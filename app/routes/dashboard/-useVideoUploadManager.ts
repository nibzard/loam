import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import type { UploadStatus } from "@/components/upload/UploadProgress";
import { copyTextToClipboard, prepareDefaultShareLink } from "@/lib/shareLinks";

const AUTO_DISMISS_COPIED_UPLOAD_DELAY_MS = 8000;
const DEFAULT_SHARE_LINK_ERROR = "Could not prepare share link. Try again.";

export interface ManagedUploadItem {
  id: string;
  projectId: Id<"projects">;
  file: File;
  uploadSessionToken?: string;
  videoId?: Id<"videos">;
  progress: number;
  status: UploadStatus;
  error?: string;
  bytesPerSecond?: number;
  estimatedSecondsRemaining?: number | null;
  isPreparingShareLink?: boolean;
  shareLinkError?: string;
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

export function useVideoUploadManager() {
  const createVideo = useMutation(api.videos.create);
  const getUploadUrl = useAction(api.videoActions.getUploadUrl);
  const markUploadComplete = useAction(api.videoActions.markUploadComplete);
  const markUploadFailed = useAction(api.videoActions.markUploadFailed);
  const ensureDefaultShareLink = useMutation(api.shareLinks.ensureDefault);
  const [uploads, setUploads] = useState<ManagedUploadItem[]>([]);

  const dismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((item) => item.id !== uploadId));
  }, []);

  const scheduleCopiedUploadDismiss = useCallback((uploadId: string) => {
    window.setTimeout(() => {
      setUploads((prev) => {
        const upload = prev.find((item) => item.id === uploadId);
        if (!upload || upload.status !== "complete" || !upload.shareLinkCopied) {
          return prev;
        }
        return prev.filter((item) => item.id !== uploadId);
      });
    }, AUTO_DISMISS_COPIED_UPLOAD_DELAY_MS);
  }, []);

  const prepareShareLink = useCallback(
    async (args: {
      existingUrl?: string;
      uploadId: string;
      videoId: Id<"videos">;
    }) => {
      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === args.uploadId
            ? {
                ...upload,
                isPreparingShareLink: true,
                shareLinkError: undefined,
              }
            : upload,
        ),
      );

      try {
        const result = args.existingUrl
          ? {
              copied: await copyTextToClipboard(args.existingUrl),
              url: args.existingUrl,
            }
          : await prepareDefaultShareLink({
              videoId: args.videoId,
              ensureDefaultShareLink,
            });

        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === args.uploadId
              ? {
                  ...upload,
                  isPreparingShareLink: false,
                  shareLinkCopied: result.copied,
                  shareLinkError: undefined,
                  shareLinkUrl: result.url,
                }
              : upload,
          ),
        );

        if (result.copied) {
          scheduleCopiedUploadDismiss(args.uploadId);
        }

        return result;
      } catch {
        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === args.uploadId
              ? {
                  ...upload,
                  isPreparingShareLink: false,
                  shareLinkCopied: false,
                  shareLinkError: DEFAULT_SHARE_LINK_ERROR,
                }
              : upload,
          ),
        );

        return null;
      }
    },
    [ensureDefaultShareLink, scheduleCopiedUploadDismiss],
  );

  const copyShareLinkForUpload = useCallback(
    async (uploadId: string) => {
      const upload = uploads.find((item) => item.id === uploadId);
      if (!upload?.videoId) {
        return null;
      }

      return await prepareShareLink({
        uploadId,
        videoId: upload.videoId,
        existingUrl: upload.shareLinkUrl,
      });
    },
    [prepareShareLink, uploads],
  );

  const uploadFilesToProject = useCallback(
    async (projectId: Id<"projects">, files: File[]) => {
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
        let activeUploadSessionToken: string | undefined;

        try {
          const createdVideo = await createVideo({
            projectId,
            title,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });
          createdVideoId = createdVideo.videoId;

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? { ...upload, videoId: createdVideoId, status: "uploading" }
                : upload,
            ),
          );

          const { url, uploadSessionToken } = await getUploadUrl({
            videoId: createdVideoId,
            filename: file.name,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });
          activeUploadSessionToken = uploadSessionToken;

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? { ...upload, uploadSessionToken }
                : upload,
            ),
          );

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

          await markUploadComplete({
            videoId: createdVideoId,
            uploadSessionToken,
          });

          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? {
                    ...upload,
                    isPreparingShareLink: true,
                    status: "complete",
                    progress: 100,
                    shareLinkCopied: false,
                    shareLinkError: undefined,
                  }
                : upload,
            ),
          );

          void prepareShareLink({
            uploadId,
            videoId: createdVideoId,
          });
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
            markUploadFailed({
              videoId: createdVideoId,
              uploadSessionToken: activeUploadSessionToken,
            }).catch(console.error);
          }
        }
      }
    },
    [
      createVideo,
      getUploadUrl,
      markUploadComplete,
      markUploadFailed,
      prepareShareLink,
    ],
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      const upload = uploads.find((item) => item.id === uploadId);
      if (upload?.abortController) {
        upload.abortController.abort();
      }
      if (upload?.videoId) {
        markUploadFailed({
          videoId: upload.videoId,
          uploadSessionToken: upload.uploadSessionToken,
        }).catch(console.error);
      }
      setUploads((prev) => prev.filter((item) => item.id !== uploadId));
    },
    [uploads, markUploadFailed],
  );

  return {
    uploads,
    uploadFilesToProject,
    cancelUpload,
    copyShareLinkForUpload,
    dismissUpload,
  };
}
