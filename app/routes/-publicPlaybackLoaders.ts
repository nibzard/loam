import type { ConvexReactClient } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "@convex/_generated/api";

import { prewarmShare } from "./-share.data";
import { prewarmWatch } from "./-watch.data";

export type WatchRouteBootstrap = FunctionReturnType<
  typeof api.videoActions.getPublicWatchBootstrap
>;

export type ShareRouteBootstrap = FunctionReturnType<
  typeof api.videoActions.getSharePlaybackBootstrap
>;

export function isReadyShareBootstrap(
  bootstrap: ShareRouteBootstrap,
): bootstrap is Extract<ShareRouteBootstrap, { state: "ready" }> {
  return bootstrap.state === "ready";
}

export async function loadWatchRouteBootstrap(
  convex: ConvexReactClient,
  params: { publicId: string },
) {
  prewarmWatch(convex, params);

  return await convex.action(api.videoActions.getPublicWatchBootstrap, {
    publicId: params.publicId,
  });
}

export async function loadShareRouteBootstrap(
  convex: ConvexReactClient,
  params: { token: string; preload: boolean },
) {
  prewarmShare(convex, { token: params.token });

  if (params.preload) {
    const shareInfo = await convex.query(api.shareLinks.getByToken, {
      token: params.token,
    });

    switch (shareInfo.status) {
      case "missing":
        return { state: "missing" } as const;
      case "expired":
        return { state: "expired" } as const;
      case "processing":
        return { state: "processing" } as const;
      case "failed":
        return { state: "failed" } as const;
      case "requiresPassword":
        return { state: "passwordRequired" } as const;
      case "ok":
        return { state: "bootstrapping" } as const;
    }
  }

  const bootstrap = await convex.action(api.videoActions.getSharePlaybackBootstrap, {
    token: params.token,
  });

  if (isReadyShareBootstrap(bootstrap)) {
    prewarmShare(convex, {
      token: params.token,
      grantToken: bootstrap.grantToken,
    });
  }

  return bootstrap;
}
