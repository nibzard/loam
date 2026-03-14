"use node";

import {
  createHmac,
  createPrivateKey,
  sign as signWithPrivateKey,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";

type MuxAsset = {
  duration?: number;
  id?: string;
  passthrough?: string;
  playback_ids?: Array<{ id?: string; policy?: string }>;
};

type MuxPlaybackId = {
  id?: string;
  policy?: string;
};

type MuxPlaybackTokenType = "thumbnail" | "video";

type MuxApiEnvelope<T> = {
  data: T;
};

const MUX_API_BASE_URL = "https://api.mux.com";
const MUX_WEBHOOK_TOLERANCE_SECONDS = 300;

let cachedPrivateKey: KeyObject | null = null;
let cachedPrivateKeyValue: string | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function resolvePrivateKeyPem(value: string): string {
  const normalized = normalizePrivateKey(value).trim();
  if (normalized.startsWith("-----BEGIN")) {
    return normalized;
  }

  const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
  if (decoded.startsWith("-----BEGIN")) {
    return decoded;
  }

  throw new Error(
    "MUX_PRIVATE_KEY (or legacy MUX_SIGNING_PRIVATE_KEY) must be a PEM or base64-encoded PEM private key.",
  );
}

function getMuxJwtCredentials(): { keyId: string; keySecret: string } {
  const keyId = readEnv("MUX_SIGNING_KEY", "MUX_SIGNING_KEY_ID");
  if (!keyId) {
    throw new Error(
      "Missing required environment variable: MUX_SIGNING_KEY (or legacy MUX_SIGNING_KEY_ID)",
    );
  }

  const keySecret = readEnv("MUX_PRIVATE_KEY", "MUX_SIGNING_PRIVATE_KEY");
  if (!keySecret) {
    throw new Error(
      "Missing required environment variable: MUX_PRIVATE_KEY (or legacy MUX_SIGNING_PRIVATE_KEY)",
    );
  }

  return {
    keyId,
    keySecret: resolvePrivateKeyPem(keySecret),
  };
}

function getMuxPrivateKey(): KeyObject {
  const { keySecret } = getMuxJwtCredentials();

  if (!cachedPrivateKey || cachedPrivateKeyValue !== keySecret) {
    cachedPrivateKey = createPrivateKey(keySecret);
    cachedPrivateKeyValue = keySecret;
  }

  return cachedPrivateKey;
}

function getMuxAuthHeader(): string {
  const tokenId = requireEnv("MUX_TOKEN_ID");
  const tokenSecret = requireEnv("MUX_TOKEN_SECRET");
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
}

function encodeBase64Url(value: Buffer | string): string {
  const source = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return source
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseExpirationToSeconds(expiration: number | string): number {
  if (typeof expiration === "number") {
    return expiration;
  }

  const match = /^(\d+)([smhd])$/.exec(expiration.trim());
  if (!match) {
    throw new Error(`Unsupported Mux playback token expiration: ${expiration}`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "s"
      ? 1
      : unit === "m"
        ? 60
        : unit === "h"
          ? 60 * 60
          : 24 * 60 * 60;

  return value * multiplier;
}

async function muxRequest<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> {
  const response = await fetch(`${MUX_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: getMuxAuthHeader(),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : null),
      ...(init?.headers ?? {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Mux API request failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as MuxApiEnvelope<T>;
  return payload.data;
}

function buildPlaybackToken(
  playbackId: string,
  options: {
    expiration: number | string;
    keyId: string;
    type: MuxPlaybackTokenType;
  },
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: options.type === "video" ? "v" : "t",
    exp: nowSeconds + parseExpirationToSeconds(options.expiration),
    kid: options.keyId,
    sub: playbackId,
  };

  const signingInput = `${encodeBase64Url(JSON.stringify({ alg: "RS256" }))}.${encodeBase64Url(
    JSON.stringify(payload),
  )}`;
  const signature = signWithPrivateKey("RSA-SHA256", Buffer.from(signingInput, "utf8"), getMuxPrivateKey());

  return `${signingInput}.${encodeBase64Url(signature)}`;
}

function parseMuxSignatureHeader(header: string) {
  return header.split(",").reduce(
    (accumulator, item) => {
      const [key, value] = item.split("=");
      if (!value) {
        return accumulator;
      }

      if (key === "t") {
        accumulator.timestamp = Number.parseInt(value, 10);
      } else if (key === "v1") {
        accumulator.signatures.push(value);
      }

      return accumulator;
    },
    {
      signatures: [] as string[],
      timestamp: -1,
    },
  );
}

export async function createMuxAssetFromInputUrl(passthrough: string, inputUrl: string) {
  return await muxRequest<MuxAsset>("/video/v1/assets", {
    body: {
      inputs: [{ url: inputUrl }],
      max_resolution_tier: "1080p",
      mp4_support: "none",
      passthrough,
      playback_policies: ["signed"],
      video_quality: "basic",
    },
    method: "POST",
  });
}

export async function getMuxAsset(assetId: string) {
  return await muxRequest<MuxAsset>(`/video/v1/assets/${assetId}`);
}

export async function deleteMuxAsset(assetId: string) {
  await muxRequest<void>(`/video/v1/assets/${assetId}`, {
    method: "DELETE",
  });
}

export async function createSignedPlaybackId(assetId: string) {
  return await muxRequest<MuxPlaybackId>(`/video/v1/assets/${assetId}/playback-ids`, {
    body: { policy: "signed" },
    method: "POST",
  });
}

export async function createPublicPlaybackId(assetId: string) {
  return await muxRequest<MuxPlaybackId>(`/video/v1/assets/${assetId}/playback-ids`, {
    body: { policy: "public" },
    method: "POST",
  });
}

export async function deletePlaybackId(assetId: string, playbackId: string) {
  await muxRequest<void>(`/video/v1/assets/${assetId}/playback-ids/${playbackId}`, {
    method: "DELETE",
  });
}

export async function signPlaybackToken(playbackId: string, expiration = "1h") {
  const { keyId } = getMuxJwtCredentials();
  return buildPlaybackToken(playbackId, {
    expiration,
    keyId,
    type: "video",
  });
}

export async function signThumbnailToken(playbackId: string, expiration = "1h") {
  const { keyId } = getMuxJwtCredentials();
  return buildPlaybackToken(playbackId, {
    expiration,
    keyId,
    type: "thumbnail",
  });
}

export function verifyMuxWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) {
    throw new Error("Missing mux-signature header");
  }

  const webhookSecret = requireEnv("MUX_WEBHOOK_SECRET");
  const details = parseMuxSignatureHeader(signature);
  if (details.timestamp < 0) {
    throw new Error("Unable to extract timestamp and signatures from mux-signature header");
  }

  if (details.signatures.length === 0) {
    throw new Error("No v1 signatures found in mux-signature header");
  }

  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(`${details.timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const matched = details.signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return (
      candidateBuffer.byteLength === expectedBuffer.byteLength &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });

  if (!matched) {
    throw new Error("No signatures found matching the expected signature for payload.");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - details.timestamp;
  if (ageSeconds > MUX_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Webhook timestamp is too old");
  }
}
