const STORAGE_KEY_VIEWER_CLIENT_ID = "lawn.presence.client_id";

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

  const clientId = createClientId();
  window.localStorage.setItem(STORAGE_KEY_VIEWER_CLIENT_ID, clientId);
  return clientId;
}
