export const MAX_SHARE_PASSWORD_LENGTH = 256;
export const PASSWORD_MAX_FAILED_ATTEMPTS = 5;
export const PASSWORD_LOCKOUT_MS = 10 * 60 * 1000;

export type ShareLinkStatus =
  | "missing"
  | "expired"
  | "processing"
  | "failed"
  | "requiresPassword"
  | "ok";

type ShareLinkLike = {
  expiresAt?: number | null;
  failedAccessAttempts?: number | null;
  lockedUntil?: number | null;
  password?: string | null;
  passwordHash?: string | null;
};

type ShareVideoLike = {
  status: "uploading" | "processing" | "ready" | "failed";
};

export function hasPasswordProtection(
  link: Pick<ShareLinkLike, "password" | "passwordHash">,
) {
  return Boolean(link.passwordHash || link.password);
}

export function normalizeProvidedPassword(password: string | null | undefined) {
  if (password === undefined || password === null || password.length === 0) {
    return undefined;
  }

  if (password.length > MAX_SHARE_PASSWORD_LENGTH) {
    throw new Error("Password is too long");
  }

  return password;
}

export function resolveShareLinkStatus(args: {
  link: ShareLinkLike | null | undefined;
  now?: number;
  video: ShareVideoLike | null | undefined;
}): ShareLinkStatus {
  const now = args.now ?? Date.now();
  const { link, video } = args;

  if (!link) {
    return "missing";
  }

  if (link.expiresAt && link.expiresAt < now) {
    return "expired";
  }

  if (!video) {
    return "missing";
  }

  if (video.status === "uploading" || video.status === "processing") {
    return "processing";
  }

  if (video.status === "failed") {
    return "failed";
  }

  if (video.status !== "ready") {
    return "missing";
  }

  if (hasPasswordProtection(link)) {
    return "requiresPassword";
  }

  return "ok";
}

export function isShareLinkPasswordLocked(
  link: Pick<ShareLinkLike, "lockedUntil">,
  now = Date.now(),
) {
  return typeof link.lockedUntil === "number" && link.lockedUntil > now;
}

export function planSharePasswordFailure(
  link: Pick<ShareLinkLike, "failedAccessAttempts">,
  now = Date.now(),
) {
  const failedAccessAttempts = (link.failedAccessAttempts ?? 0) + 1;
  if (failedAccessAttempts >= PASSWORD_MAX_FAILED_ATTEMPTS) {
    return {
      failedAccessAttempts: 0,
      lockedUntil: now + PASSWORD_LOCKOUT_MS,
    };
  }

  return {
    failedAccessAttempts,
  };
}

export function planSharePasswordSuccess(
  link: Pick<
    ShareLinkLike,
    "failedAccessAttempts" | "lockedUntil" | "password" | "passwordHash"
  >,
) {
  const updates: {
    failedAccessAttempts?: number;
    lockedUntil?: undefined;
  } = {};

  if ((link.failedAccessAttempts ?? 0) > 0) {
    updates.failedAccessAttempts = 0;
  }

  if (link.lockedUntil !== undefined && link.lockedUntil !== null) {
    updates.lockedUntil = undefined;
  }

  return {
    shouldUpgradeLegacyPassword: Boolean(link.password && !link.passwordHash),
    updates,
  };
}
