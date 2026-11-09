export function buildMuxPlaybackUrl(playbackId: string, token: string): string {
  const url = new URL(`https://stream.mux.com/${playbackId}.m3u8`);
  // Cap the manifest at 720p but let adaptive streaming downscale on slow
  // links (upstream 4c6ed8d): a 720p floor stalls playback when the network
  // cannot sustain it.
  url.searchParams.set("max_resolution", "720p");
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildMuxThumbnailUrl(playbackId: string, token: string): string {
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`;
  return `${base}&token=${encodeURIComponent(token)}`;
}
