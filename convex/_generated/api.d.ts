/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as billingHelpers from "../billingHelpers.js";
import type * as billingWebhookSync from "../billingWebhookSync.js";
import type * as comments from "../comments.js";
import type * as desktopRecorder from "../desktopRecorder.js";
import type * as discussionAudience from "../discussionAudience.js";
import type * as http from "../http.js";
import type * as mux from "../mux.js";
import type * as muxActions from "../muxActions.js";
import type * as muxPlayback from "../muxPlayback.js";
import type * as playbackAccess from "../playbackAccess.js";
import type * as playbackSessions from "../playbackSessions.js";
import type * as projects from "../projects.js";
import type * as reactions from "../reactions.js";
import type * as s3 from "../s3.js";
import type * as security from "../security.js";
import type * as shareAccess from "../shareAccess.js";
import type * as shareLinkAuth from "../shareLinkAuth.js";
import type * as shareLinkDefaults from "../shareLinkDefaults.js";
import type * as shareLinks from "../shareLinks.js";
import type * as teams from "../teams.js";
import type * as uploadSessions from "../uploadSessions.js";
import type * as videoActions from "../videoActions.js";
import type * as videoMemberGrantHelpers from "../videoMemberGrantHelpers.js";
import type * as videoPresence from "../videoPresence.js";
import type * as videos from "../videos.js";
import type * as watchEventActions from "../watchEventActions.js";
import type * as watchEvents from "../watchEvents.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  billing: typeof billing;
  billingHelpers: typeof billingHelpers;
  billingWebhookSync: typeof billingWebhookSync;
  comments: typeof comments;
  desktopRecorder: typeof desktopRecorder;
  discussionAudience: typeof discussionAudience;
  http: typeof http;
  mux: typeof mux;
  muxActions: typeof muxActions;
  muxPlayback: typeof muxPlayback;
  playbackAccess: typeof playbackAccess;
  playbackSessions: typeof playbackSessions;
  projects: typeof projects;
  reactions: typeof reactions;
  s3: typeof s3;
  security: typeof security;
  shareAccess: typeof shareAccess;
  shareLinkAuth: typeof shareLinkAuth;
  shareLinkDefaults: typeof shareLinkDefaults;
  shareLinks: typeof shareLinks;
  teams: typeof teams;
  uploadSessions: typeof uploadSessions;
  videoActions: typeof videoActions;
  videoMemberGrantHelpers: typeof videoMemberGrantHelpers;
  videoPresence: typeof videoPresence;
  videos: typeof videos;
  watchEventActions: typeof watchEventActions;
  watchEvents: typeof watchEvents;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  stripe: import("@convex-dev/stripe/_generated/component.js").ComponentApi<"stripe">;
};
