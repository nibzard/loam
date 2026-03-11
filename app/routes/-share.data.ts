import { useQuery, type ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";
import {
  makeRouteQuerySpec,
  prewarmSpecs,
  type RouteQuerySpec,
} from "@/lib/convexRouteData";

export function getShareEssentialSpecs(params: { token: string }) {
  return [
    makeRouteQuerySpec(api.shareLinks.getByToken, {
      token: params.token,
    }),
  ];
}

export function getShareGrantedSpecs(params: { grantToken: string }) {
  return [
    makeRouteQuerySpec(api.videos.getByShareGrant, {
      grantToken: params.grantToken,
    }),
    makeRouteQuerySpec(api.comments.getThreadedForShareGrant, {
      grantToken: params.grantToken,
    }),
    makeRouteQuerySpec(api.reactions.listForShareGrant, {
      grantToken: params.grantToken,
    }),
  ];
}

export function useShareData(params: { token: string; grantToken?: string | null }) {
  const shareInfo = useQuery(api.shareLinks.getByToken, {
    token: params.token,
  });

  const videoData = useQuery(
    api.videos.getByShareGrant,
    params.grantToken ? { grantToken: params.grantToken } : "skip",
  );

  const comments = useQuery(
    api.comments.getThreadedForShareGrant,
    params.grantToken ? { grantToken: params.grantToken } : "skip",
  );

  const reactions = useQuery(
    api.reactions.listForShareGrant,
    params.grantToken ? { grantToken: params.grantToken } : "skip",
  );

  return { shareInfo, videoData, comments, reactions };
}

export async function prewarmShare(
  convex: ConvexReactClient,
  params: { token: string; grantToken?: string | null },
) {
  const specs: Array<RouteQuerySpec<FunctionReference<"query">>> = [
    ...getShareEssentialSpecs({ token: params.token }),
  ];

  if (params.grantToken) {
    specs.push(...getShareGrantedSpecs({ grantToken: params.grantToken }));
  }

  prewarmSpecs(convex, specs);
}
