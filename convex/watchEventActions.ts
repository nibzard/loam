"use node";

import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

type WatchSource = "dashboard" | "public" | "share";

const watchEventRateLimiter = new RateLimiter(components.rateLimiter, {
  recordWatchByViewer: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 4,
    shards: 8,
  },
  guestWatchByVideoSource: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 30,
    shards: 8,
  },
  guestPublicNotificationsByVideo: {
    kind: "fixed window",
    rate: 1,
    period: 30 * MINUTE,
    shards: 8,
  },
  guestShareNotificationsByVideo: {
    kind: "fixed window",
    rate: 6,
    period: HOUR,
    shards: 8,
  },
});

function identityDisplayName(identity: Record<string, unknown>) {
  const name = identity.name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();

  const firstName = identity.firstName;
  const lastName = identity.lastName;
  if (typeof firstName === "string" && typeof lastName === "string") {
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) return fullName;
  }

  const email = identity.email;
  if (typeof email === "string" && email.trim().length > 0) return email.trim();

  return "Member";
}

function deriveGuestLabel(clientId: string) {
  const suffix = clientId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
  return `Guest ${suffix || "USER"}`;
}

function resolveSource(args: {
  videoId?: Id<"videos">;
  publicId?: string;
  grantToken?: string;
}): WatchSource {
  const provided = [
    args.videoId ? "dashboard" : null,
    args.publicId ? "public" : null,
    args.grantToken ? "share" : null,
  ].filter((value): value is WatchSource => value !== null);

  if (provided.length !== 1) {
    throw new Error("Provide exactly one of videoId, publicId, or grantToken");
  }

  return provided[0];
}

function resolveSiteUrl() {
  const raw = process.env.VITE_CONVEX_SITE_URL || process.env.APP_SITE_URL;
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendWatchNotificationEmail(input: {
  to: string;
  viewerLabel: string;
  source: WatchSource;
  watchedAt: number;
  videoTitle: string;
  videoPublicId: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL;
  if (!resendApiKey || !fromEmail) {
    return { sent: false as const, reason: "not_configured" as const };
  }

  const siteUrl = resolveSiteUrl();
  const watchPath = `/watch/${input.videoPublicId}`;
  const watchUrl = siteUrl ? `${siteUrl}${watchPath}` : watchPath;
  const watchedAtIso = new Date(input.watchedAt).toISOString();
  const escapedViewerLabel = escapeHtml(input.viewerLabel);
  const escapedSource = escapeHtml(input.source);
  const escapedWatchedAtIso = escapeHtml(watchedAtIso);
  const escapedWatchUrl = escapeHtml(watchUrl);

  const subject = `Someone watched "${input.videoTitle}"`;
  const text = [
    `${input.viewerLabel} watched your video.`,
    `Source: ${input.source}`,
    `When: ${watchedAtIso}`,
    `Open: ${watchUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">New video watch event</h2>
      <p style="margin: 0 0 8px;"><strong>${escapedViewerLabel}</strong> watched your video.</p>
      <p style="margin: 0 0 8px;">Source: <code>${escapedSource}</code></p>
      <p style="margin: 0 0 8px;">When: <code>${escapedWatchedAtIso}</code></p>
      <p style="margin: 0 0 0;"><a href="${escapedWatchUrl}">Open video</a></p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: input.to,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Failed to send watch notification email", {
      status: response.status,
      body,
    });
    return { sent: false as const, reason: "provider_error" as const };
  }

  return { sent: true as const };
}

async function shouldSendGuestNotification(ctx: ActionCtx, input: {
  source: WatchSource;
  videoId: Id<"videos">;
}) {
  if (input.source === "public") {
    const status = await watchEventRateLimiter.limit(
      ctx,
      "guestPublicNotificationsByVideo",
      { key: `${input.videoId}` },
    );
    return status.ok;
  }

  if (input.source === "share") {
    const status = await watchEventRateLimiter.limit(
      ctx,
      "guestShareNotificationsByVideo",
      { key: `${input.videoId}` },
    );
    return status.ok;
  }

  return true;
}

export const recordWatch = action({
  args: {
    videoId: v.optional(v.id("videos")),
    publicId: v.optional(v.string()),
    grantToken: v.optional(v.string()),
    clientId: v.optional(v.string()),
  },
  returns: v.object({
    recorded: v.boolean(),
    firstWatch: v.boolean(),
    notificationSent: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const source = resolveSource({
      videoId: args.videoId,
      publicId: args.publicId,
      grantToken: args.grantToken,
    });

    let resolvedVideoId: Id<"videos">;
    if (source === "dashboard") {
      const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
        videoId: args.videoId as Id<"videos">,
      });
      if (!video || video.status !== "ready") {
        return { recorded: false, firstWatch: false, notificationSent: false };
      }
      resolvedVideoId = args.videoId as Id<"videos">;
    } else if (source === "public") {
      const result = await ctx.runQuery(api.videos.getByPublicId, {
        publicId: args.publicId as string,
      });
      if (!result?.video?._id) {
        return { recorded: false, firstWatch: false, notificationSent: false };
      }
      resolvedVideoId = result.video._id;
    } else {
      const result = await ctx.runQuery(api.videos.getByShareGrant, {
        grantToken: args.grantToken as string,
      });
      if (!result?.video?._id) {
        return { recorded: false, firstWatch: false, notificationSent: false };
      }
      resolvedVideoId = result.video._id;
    }

    const identity = await ctx.auth.getUserIdentity();
    let fingerprint: string;
    let viewerKind: "member" | "guest";
    let viewerLabel: string;

    if (identity) {
      fingerprint = `auth:${identity.subject}`;
      viewerKind = "member";
      viewerLabel = identityDisplayName(identity as Record<string, unknown>);
    } else {
      const clientId = (args.clientId ?? "").trim().slice(0, 64);
      if (!clientId) {
        return { recorded: false, firstWatch: false, notificationSent: false };
      }

      fingerprint = `guest:${clientId}`;
      viewerKind = "guest";
      viewerLabel = deriveGuestLabel(clientId);
    }

    const watchLimit = await watchEventRateLimiter.limit(
      ctx,
      "recordWatchByViewer",
      { key: `${resolvedVideoId}:${fingerprint}` },
    );
    if (!watchLimit.ok) {
      return { recorded: false, firstWatch: false, notificationSent: false };
    }

    if (viewerKind === "guest") {
      const guestVolumeLimit = await watchEventRateLimiter.limit(
        ctx,
        "guestWatchByVideoSource",
        { key: `${resolvedVideoId}:${source}` },
      );
      if (!guestVolumeLimit.ok) {
        return { recorded: false, firstWatch: false, notificationSent: false };
      }
    }

    const watchEvent = await ctx.runMutation(internal.watchEvents.recordWatchEvent, {
      videoId: resolvedVideoId,
      fingerprint,
      viewerKind,
      viewerLabel,
      source,
    });

    if (!watchEvent.isFirstWatch) {
      return { recorded: true, firstWatch: false, notificationSent: false };
    }

    if (identity?.subject === watchEvent.uploaderClerkId) {
      return { recorded: true, firstWatch: true, notificationSent: false };
    }

    if (!watchEvent.uploaderEmail) {
      return { recorded: true, firstWatch: true, notificationSent: false };
    }

    if (
      viewerKind === "guest" &&
      !(await shouldSendGuestNotification(ctx, {
        source,
        videoId: resolvedVideoId,
      }))
    ) {
      return { recorded: true, firstWatch: true, notificationSent: false };
    }

    const notification = await sendWatchNotificationEmail({
      to: watchEvent.uploaderEmail,
      viewerLabel: watchEvent.viewerLabel,
      source,
      watchedAt: watchEvent.watchedAt,
      videoTitle: watchEvent.videoTitle,
      videoPublicId: watchEvent.videoPublicId,
    });

    return {
      recorded: true,
      firstWatch: true,
      notificationSent: notification.sent,
    };
  },
});
