type DefaultShareLinkCandidate = {
  _creationTime: number;
  allowDownload: boolean;
  expiresAt?: number;
  password?: string;
  passwordHash?: string;
  token: string;
};

export function isReusableDefaultShareLink(
  link: DefaultShareLinkCandidate,
  now = Date.now(),
) {
  if (link.allowDownload) {
    return false;
  }

  if (link.expiresAt !== undefined && link.expiresAt <= now) {
    return false;
  }

  if (link.expiresAt !== undefined) {
    return false;
  }

  if (link.password || link.passwordHash) {
    return false;
  }

  return true;
}

export function pickReusableDefaultShareLink<T extends DefaultShareLinkCandidate>(
  links: T[],
  now = Date.now(),
) {
  // Dashboard sharing reuses the newest active link that keeps the safest defaults:
  // private video, no password prompt, no expiry, and no download permission.
  return links
    .filter((link) => isReusableDefaultShareLink(link, now))
    .sort((left, right) => right._creationTime - left._creationTime)[0] ?? null;
}
