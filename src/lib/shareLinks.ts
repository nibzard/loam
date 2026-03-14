import type { Id } from "@convex/_generated/dataModel";

type EnsureDefaultShareLink = (args: {
  videoId: Id<"videos">;
}) => Promise<{ reused: boolean; token: string }>;

type CopyText = (text: string) => Promise<boolean>;

export function buildRestrictedSharePath(token: string) {
  return `/share/${token}`;
}

export function buildRestrictedShareUrl(token: string, origin?: string) {
  const path = buildRestrictedSharePath(token);
  return origin ? `${origin}${path}` : path;
}

export async function copyTextToClipboard(text: string) {
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

export async function prepareDefaultShareLink(args: {
  copyText?: CopyText;
  ensureDefaultShareLink: EnsureDefaultShareLink;
  origin?: string;
  shouldCopy?: boolean;
  videoId: Id<"videos">;
}) {
  const { token } = await args.ensureDefaultShareLink({
    videoId: args.videoId,
  });
  const resolvedOrigin =
    args.origin ??
    (typeof window !== "undefined" ? window.location.origin : undefined);
  const url = buildRestrictedShareUrl(token, resolvedOrigin);

  if (args.shouldCopy === false) {
    return {
      copied: false,
      url,
    };
  }

  const copied = await (args.copyText ?? copyTextToClipboard)(url);

  return {
    copied,
    url,
  };
}
