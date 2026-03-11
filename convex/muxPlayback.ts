export function buildMuxPlaybackUrl(playbackId: string, token?: string): string {
  const url = new URL(`https://stream.mux.com/${playbackId}.m3u8`);
  // Force a single 720p delivery profile in the playback manifest.
  url.searchParams.set("min_resolution", "720p");
  url.searchParams.set("max_resolution", "720p");
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export function buildMuxThumbnailUrl(playbackId: string, token?: string): string {
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`;
  if (!token) return base;
  return `${base}&token=${encodeURIComponent(token)}`;
}
