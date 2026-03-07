const MAX_REDIRECT_PATH_LENGTH = 2048;

function hasControlChars(value: string) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

export function sanitizeRedirectPath(
  raw: string | null | undefined,
  fallback?: string,
): string | undefined {
  if (typeof raw !== "string") return fallback;

  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > MAX_REDIRECT_PATH_LENGTH) return fallback;
  if (hasControlChars(trimmed)) return fallback;
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\")) return fallback;

  return trimmed;
}
