import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import type { UploadStatus } from "@/components/upload/UploadProgress";
import { getUploadErrorMessage } from "@/lib/uploadErrors";
import { copyTextToClipboard, prepareDefaultShareLink } from "@/lib/shareLinks";

const AUTO_DISMISS_COPIED_UPLOAD_DELAY_MS = 8000;
const DEFAULT_SHARE_LINK_ERROR = "Could not prepare share link. Try again.";

/**
 * What a dropped file becomes: a new video in a project, or the next version
 * of an existing video's stack (upstream 9e85de3's creation-intent shape).
 * Version intents create the row with `videos.createVersion`, which clones
 * the stack head, and skip share-link preparation: share links already follow
 * the head, so there is no new link to prepare.
 */
export type VideoUploadCreationIntent =
  | { kind: "standalone"; projectId: Id<"projects"> }
  | { kind: "version"; sourceVideoId: Id<"videos"> };

export interface ManagedUploadItem {
  id: string;
  projectId: Id<"projects">;
  creationIntent: VideoUploadCreationIntent;
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
  const createVideoVersion = useMutation(api.videos.createVersion);
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

  const uploadSingleFile = useCallback(
    async (
      projectId: Id<"projects">,
      file: File,
      creationIntent: VideoUploadCreationIntent,
    ) => {
      const uploadId = createUploadId();
      const abortController = new AbortController();

      setUploads((prev) => [
        ...prev,
        {
          id: uploadId,
          projectId,
          creationIntent,
          file,
          progress: 0,
          status: "pending",
          abortController,
        },
      ]);

      let createdVideoId: Id<"videos"> | undefined;
      let activeUploadSessionToken: string | undefined;

      try {
        // The creation intent decides which row the upload lands on: a new
        // standalone video keeps its own title; a version inherits the stack
        // head's metadata server-side, so no title is passed.
        if (creationIntent.kind === "version") {
          const createdVersion = await createVideoVersion({
            sourceVideoId: creationIntent.sourceVideoId,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });
          createdVideoId = createdVersion.videoId;
        } else {
          const createdVideo = await createVideo({
            projectId: creationIntent.projectId,
            title: file.name.replace(/\.[^/.]+$/, ""),
            fileSize: file.size,
            contentType: file.type || "video/mp4",
          });
          createdVideoId = createdVideo.videoId;
        }

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

        if (creationIntent.kind === "version") {
          // Version uploads never prepare a share link: the stack's link was
          // repointed to this new head when the version was created.
          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? {
                    ...upload,
                    status: "complete",
                    progress: 100,
                  }
                : upload,
            ),
          );
          return;
        }

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
        const errorMessage = getUploadErrorMessage(error, "Upload failed");

        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === uploadId
              ? { ...upload, status: "error", error: errorMessage }
              : upload,
          ),
        );

        if (createdVideoId) {
          // A failed version upload rolls the never-ingested version row
          // back server-side, so this cleanup may itself report that the
          // video is gone. Either way the upload item is already terminal.
          markUploadFailed({
            videoId: createdVideoId,
            uploadSessionToken: activeUploadSessionToken,
          }).catch(console.error);
        }
      }
    },
    [
      createVideo,
      createVideoVersion,
      getUploadUrl,
      markUploadComplete,
      markUploadFailed,
      prepareShareLink,
    ],
  );

  const uploadFilesToProject = useCallback(
    async (projectId: Id<"projects">, files: File[]) => {
      for (const file of files) {
        await uploadSingleFile(projectId, file, {
          kind: "standalone",
          projectId,
        });
      }
    },
    [uploadSingleFile],
  );

  const uploadFilesAsNewVersion = useCallback(
    async (
      sourceVideoId: Id<"videos">,
      projectId: Id<"projects">,
      files: File[],
    ) => {
      for (const file of files) {
        await uploadSingleFile(projectId, file, {
          kind: "version",
          sourceVideoId,
        });
      }
    },
    [uploadSingleFile],
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
    uploadFilesAsNewVersion,
    cancelUpload,
    copyShareLinkForUpload,
    dismissUpload,
  };
}
