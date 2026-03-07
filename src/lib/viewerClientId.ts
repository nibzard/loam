const STORAGE_KEY_VIEWER_CLIENT_ID = "loam.presence.client_id";
const LEGACY_STORAGE_KEY_VIEWER_CLIENT_ID = "lawn.presence.client_id";

function createClientId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function getOrCreateViewerClientId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = window.localStorage.getItem(STORAGE_KEY_VIEWER_CLIENT_ID);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const legacyExisting = window.localStorage.getItem(LEGACY_STORAGE_KEY_VIEWER_CLIENT_ID);
  if (legacyExisting && legacyExisting.trim().length > 0) {
    window.localStorage.setItem(STORAGE_KEY_VIEWER_CLIENT_ID, legacyExisting);
    return legacyExisting;
  }

  const clientId = createClientId();
  window.localStorage.setItem(STORAGE_KEY_VIEWER_CLIENT_ID, clientId);
  return clientId;
}
