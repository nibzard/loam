export type DesktopRoute = "recorder" | "uploading";

export const RECORDER_PATH = "/";
export const UPLOADING_PATH = "/uploading";

export function readRoute(): DesktopRoute {
  if (typeof window === "undefined") {
    return "recorder";
  }

  return window.location.pathname === UPLOADING_PATH ? "uploading" : "recorder";
}

export function navigateTo(
  route: DesktopRoute,
  setRoute: (route: DesktopRoute) => void,
  replace = false,
) {
  if (typeof window === "undefined") {
    setRoute(route);
    return;
  }

  const path = route === "uploading" ? UPLOADING_PATH : RECORDER_PATH;
  const currentPath = window.location.pathname;

  if (currentPath !== path) {
    if (replace) {
      window.history.replaceState({ route }, "", path);
    } else {
      window.history.pushState({ route }, "", path);
    }
  }

  setRoute(route);
}
