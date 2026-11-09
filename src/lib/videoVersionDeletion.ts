import type { Id } from "@convex/_generated/dataModel";

/**
 * Given stack versions newest-first (the `videos.listVersions` order), pick
 * where the client should land after `deletingVideoId` disappears: the newer
 * survivor when one exists, else the older survivor, else null. Mirrors the
 * server's replacement choice so a navigating client and the renumbered
 * stack agree (upstream 9a2c070's src/lib/videoVersionDeletion.ts).
 */
export function findPreferredReplacementVideoId(
  versions: ReadonlyArray<{ _id: Id<"videos"> }> | undefined,
  deletingVideoId: Id<"videos">,
): Id<"videos"> | null {
  const deletingIndex =
    versions?.findIndex((version) => version._id === deletingVideoId) ?? -1;
  if (deletingIndex === -1 || !versions) return null;

  return versions[deletingIndex - 1]?._id ?? versions[deletingIndex + 1]?._id ?? null;
}
