export type DesktopRoute = "recorder" | "uploading" | "complete";

export const RECORDER_PATH = "/";
export const UPLOADING_PATH = "/uploading";
export const COMPLETE_PATH = "/complete";

export function readRoute(): DesktopRoute {
  if (typeof window === "undefined") {
    return "recorder";
  }

  if (window.location.pathname === UPLOADING_PATH) {
    return "uploading";
  }

  if (window.location.pathname === COMPLETE_PATH) {
    return "complete";
  }

  return "recorder";
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

  const path =
    route === "uploading"
      ? UPLOADING_PATH
      : route === "complete"
        ? COMPLETE_PATH
        : RECORDER_PATH;
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
