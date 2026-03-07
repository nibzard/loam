import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import type { UploadStatus } from "@/components/upload/UploadProgress";

export interface ManagedUploadItem {
  id: string;
  projectId: Id<"projects">;
  file: File;
  videoId?: Id<"videos">;
  progress: number;
  status: UploadStatus;
  error?: string;
  bytesPerSecond?: number;
  estimatedSecondsRemaining?: number | null;
  shareLinkUrl?: string;
  shareLinkCopied?: boolean;
  abortController?: AbortController;
}

function createUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

export function useVideoUploadManager() {
  const createVideo = useMutation(api.videos.create);
  const createShareLink = useMutation(api.shareLinks.create);
  const getUploadUrl = useAction(api.videoActions.getUploadUrl);
  const markUploadComplete = useAction(api.videoActions.markUploadComplete);
  const markUploadFailed = useAction(api.videoActions.markUploadFailed);
  const [uploads, setUploads] = useState<ManagedUploadItem[]>([]);

  const uploadFilesToProject = useCallback(
    async (projectId: Id<"projects">, files: File[]) => {
      const shouldAutoCopyShareLink = files.length === 1;

      for (const file of files) {
        const uploadId = createUploadId();
        const title = file.name.replace(/\.[^/.]+$/, "");
        const abortController = new AbortController();

        setUploads((prev) => [
          ...prev,
          {
            id: uploadId,
            projectId,
            file,
            progress: 0,
            status: "pending",
            abortController,
          },
        ]);

        let createdVideoId: Id<"videos"> | undefined;
        let createdPublicId: string | undefined;
        let shareLinkUrl: string | undefined;

        try {
          const createdVideo = await createVideo({
            projectId,
            title,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });
          createdVideoId = createdVideo.videoId;
          createdPublicId = createdVideo.publicId;

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? { ...upload, videoId: createdVideoId, status: "uploading" }
                : upload,
            ),
          );

          const { url } = await getUploadUrl({
            videoId: createdVideoId,
            filename: file.name,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let lastTime = Date.now();
            let lastLoaded = 0;
            const recentSpeeds: number[] = [];

            xhr.upload.addEventListener("progress", (event) => {
              if (!event.lengthComputable) return;

              const percentage = Math.round((event.loaded / event.total) * 100);
              const now = Date.now();
              const timeDelta = (now - lastTime) / 1000;
              const bytesDelta = event.loaded - lastLoaded;

              if (timeDelta > 0.1) {
                const speed = bytesDelta / timeDelta;
                recentSpeeds.push(speed);
                if (recentSpeeds.length > 5) recentSpeeds.shift();
                lastTime = now;
                lastLoaded = event.loaded;
              }

              const avgSpeed =
                recentSpeeds.length > 0
                  ? recentSpeeds.reduce((sum, speed) => sum + speed, 0) /
                    recentSpeeds.length
                  : 0;
              const remaining = event.total - event.loaded;
              const eta = avgSpeed > 0 ? Math.ceil(remaining / avgSpeed) : null;

              setUploads((prev) =>
                prev.map((upload) =>
                  upload.id === uploadId
                    ? {
                        ...upload,
                        progress: percentage,
                        bytesPerSecond: avgSpeed,
                        estimatedSecondsRemaining: eta,
                      }
                    : upload,
                ),
              );
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
              }
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            });

            xhr.addEventListener("error", () => {
              reject(new Error("Upload failed: Network error"));
            });

            xhr.addEventListener("abort", () => {
              reject(new Error("Upload cancelled"));
            });

            abortController.signal.addEventListener("abort", () => {
              xhr.abort();
            });

            xhr.open("PUT", url);
            xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
            xhr.send(file);
          });

          await markUploadComplete({ videoId: createdVideoId });

          if (shouldAutoCopyShareLink && typeof window !== "undefined") {
            try {
              const shareLink = await createShareLink({
                videoId: createdVideoId,
              });
              shareLinkUrl = `${window.location.origin}/share/${shareLink.token}`;
            } catch (error) {
              console.error("Failed to create default share link:", error);
              if (createdPublicId) {
                shareLinkUrl = `${window.location.origin}/watch/${createdPublicId}`;
              }
            }
          }

          let shareLinkCopied = false;
          if (shareLinkUrl && shouldAutoCopyShareLink) {
            shareLinkCopied = await copyTextToClipboard(shareLinkUrl);
          }

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? {
                    ...upload,
                    status: "complete",
                    progress: 100,
                    shareLinkUrl,
                    shareLinkCopied,
                  }
                : upload,
            ),
          );

          setTimeout(() => {
            setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
          }, 3000);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Upload failed";

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? { ...upload, status: "error", error: errorMessage }
                : upload,
            ),
          );

          if (createdVideoId) {
            markUploadFailed({ videoId: createdVideoId }).catch(console.error);
          }
        }
      }
    },
    [createShareLink, createVideo, getUploadUrl, markUploadComplete, markUploadFailed],
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      const upload = uploads.find((item) => item.id === uploadId);
      if (upload?.abortController) {
        upload.abortController.abort();
      }
      if (upload?.videoId) {
        markUploadFailed({ videoId: upload.videoId }).catch(console.error);
      }
      setUploads((prev) => prev.filter((item) => item.id !== uploadId));
    },
    [uploads, markUploadFailed],
  );

  return {
    uploads,
    uploadFilesToProject,
    cancelUpload,
  };
}
