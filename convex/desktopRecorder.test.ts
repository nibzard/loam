import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import { api } from "./_generated/api";
import {
  completeUpload,
  failUpload,
  prepareUpload,
} from "./desktopRecorder";

type Call = {
  args: unknown;
  kind: "action" | "mutation" | "query";
  name: string;
};

function createActionCtx(handlers: {
  actions?: Record<string, (args: any) => any | Promise<any>>;
  mutations?: Record<string, (args: any) => any | Promise<any>>;
  queries?: Record<string, (args: any) => any | Promise<any>>;
}) {
  const calls: Call[] = [];

  return {
    calls,
    ctx: {
      runAction: async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as never);
        calls.push({ kind: "action", name, args });
        const handler = handlers.actions?.[name];
        if (!handler) {
          throw new Error(`Missing mocked action for ${name}`);
        }
        return await handler(args);
      },
      runMutation: async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as never);
        calls.push({ kind: "mutation", name, args });
        const handler = handlers.mutations?.[name];
        if (!handler) {
          throw new Error(`Missing mocked mutation for ${name}`);
        }
        return await handler(args);
      },
      runQuery: async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as never);
        calls.push({ kind: "query", name, args });
        const handler = handlers.queries?.[name];
        if (!handler) {
          throw new Error(`Missing mocked query for ${name}`);
        }
        return await handler(args);
      },
    },
  };
}

test("prepareUpload creates the video and maps the upload contract fields", async () => {
  const { calls, ctx } = createActionCtx({
    actions: {
      [getFunctionName(api.videoActions.getUploadUrl)]: (args) => ({
        uploadId: "upload_123",
        uploadSessionToken: "session_456",
        url: "https://upload.example.com/put",
        receivedArgs: args,
      }),
    },
    mutations: {
      [getFunctionName(api.videos.create)]: (args) => ({
        videoId: "video_123",
        publicId: "public_abc",
        receivedArgs: args,
      }),
    },
  });

  const result = await prepareUpload._handler(ctx as never, {
    projectId: "project_123" as never,
    title: "Quarterly demo",
    fileSize: 2048,
    contentType: "video/mp4",
  });

  assert.deepEqual(result, {
    videoId: "video_123",
    publicId: "public_abc",
    uploadKey: "upload_123",
    uploadSessionToken: "session_456",
    uploadUrl: "https://upload.example.com/put",
  });

  assert.deepEqual(calls, [
    {
      kind: "mutation",
      name: "videos:create",
      args: {
        projectId: "project_123",
        title: "Quarterly demo",
        fileSize: 2048,
        contentType: "video/mp4",
      },
    },
    {
      kind: "action",
      name: "videoActions:getUploadUrl",
      args: {
        videoId: "video_123",
        filename: "Quarterly demo.mp4",
        fileSize: 2048,
        contentType: "video/mp4",
      },
    },
  ]);
});

test("completeUpload reuses the newest active share link and returns relative URLs by default", async () => {
  const { calls, ctx } = createActionCtx({
    actions: {
      [getFunctionName(api.videoActions.markUploadComplete)]: () => ({
        outcome: "started",
        success: true,
      }),
    },
    queries: {
      [getFunctionName(api.videos.get)]: () => ({
        _id: "video_123",
        role: "member",
        status: "ready",
      }),
      [getFunctionName(api.workspace.resolveContext)]: () => ({
        canonicalPath: "/garden/projects/project_123/videos/video_123",
      }),
      [getFunctionName(api.shareLinks.list)]: () => [
        {
          token: "expired_token",
          hasPassword: false,
          isExpired: true,
          _creationTime: 100,
        },
        {
          token: "password_token",
          hasPassword: true,
          isExpired: false,
          _creationTime: 200,
        },
        {
          token: "fresh_token",
          hasPassword: false,
          isExpired: false,
          _creationTime: 300,
        },
      ],
    },
  });

  const result = await completeUpload._handler(ctx as never, {
    videoId: "video_123" as never,
    uploadSessionToken: "session_456",
  });

  assert.deepEqual(result, {
    videoId: "video_123",
    status: "ready",
    shareUrl: "/share/fresh_token",
    canonicalDashboardUrl: "/garden/projects/project_123/videos/video_123",
  });

  assert.equal(
    calls.some(
      (call) =>
        call.kind === "mutation" && call.name === getFunctionName(api.shareLinks.create),
    ),
    false,
  );
  assert.deepEqual(calls[0], {
    kind: "action",
    name: "videoActions:markUploadComplete",
    args: {
      videoId: "video_123",
      uploadSessionToken: "session_456",
    },
  });
});

test("completeUpload falls back to the stored upload session and creates absolute URLs when needed", async () => {
  const originalSiteUrl = process.env.VITE_CONVEX_SITE_URL;
  process.env.VITE_CONVEX_SITE_URL = " https://app.loam.dev/base/ ";

  try {
    let videoReads = 0;
    const { calls, ctx } = createActionCtx({
      actions: {
        [getFunctionName(api.videoActions.markUploadComplete)]: () => ({
          outcome: "started",
          success: true,
        }),
      },
      mutations: {
        [getFunctionName(api.shareLinks.create)]: () => ({
          token: "new_share_token",
        }),
      },
      queries: {
        [getFunctionName(api.videos.get)]: () => {
          videoReads += 1;
          return videoReads === 1
            ? {
                _id: "video_456",
                role: "member",
                status: "uploading",
                uploadSessionToken: "stored_session",
              }
            : {
                _id: "video_456",
                role: "member",
                status: "processing",
              };
        },
        [getFunctionName(api.workspace.resolveContext)]: () => ({
          canonicalPath: "/workspace/videos/video_456",
        }),
        [getFunctionName(api.shareLinks.list)]: () => [],
      },
    });

    const result = await completeUpload._handler(ctx as never, {
      videoId: "video_456" as never,
    });

    assert.deepEqual(result, {
      videoId: "video_456",
      status: "processing",
      shareUrl: "https://app.loam.dev/base/share/new_share_token",
      canonicalDashboardUrl: "https://app.loam.dev/base/workspace/videos/video_456",
    });

    assert.deepEqual(calls[0], {
      kind: "query",
      name: "videos:get",
      args: {
        videoId: "video_456",
      },
    });
    assert.deepEqual(calls[1], {
      kind: "action",
      name: "videoActions:markUploadComplete",
      args: {
        videoId: "video_456",
        uploadSessionToken: "stored_session",
      },
    });
    assert.equal(
      calls.some(
        (call) =>
          call.kind === "mutation" && call.name === "shareLinks:create",
      ),
      true,
    );
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.VITE_CONVEX_SITE_URL;
    } else {
      process.env.VITE_CONVEX_SITE_URL = originalSiteUrl;
    }
  }
});

test("failUpload forwards the backend outcome and logs only applied failures with a message", async () => {
  const originalConsoleError = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  try {
    const { ctx } = createActionCtx({
      actions: {
        [getFunctionName(api.videoActions.markUploadFailed)]: ({ uploadSessionToken }) => ({
          cleanupScheduled: uploadSessionToken === "session_applied",
          outcome: uploadSessionToken === "session_applied" ? "applied" : "ignored",
          success: true,
        }),
      },
    });

    const applied = await failUpload._handler(ctx as never, {
      videoId: "video_789" as never,
      uploadSessionToken: "session_applied",
      message: "socket closed",
    });
    const ignored = await failUpload._handler(ctx as never, {
      videoId: "video_789" as never,
      uploadSessionToken: "session_ignored",
      message: "retry already finished",
    });

    assert.deepEqual(applied, {
      cleanupScheduled: true,
      outcome: "applied",
      success: true,
    });
    assert.deepEqual(ignored, {
      cleanupScheduled: false,
      outcome: "ignored",
      success: true,
    });
    assert.deepEqual(logged, [
      [
        "Desktop upload failed",
        {
          videoId: "video_789",
          message: "socket closed",
        },
      ],
    ]);
  } finally {
    console.error = originalConsoleError;
  }
});
