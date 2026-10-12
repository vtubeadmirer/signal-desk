/**
 * YouTube publishes an official, login-free Atom feed per channel. It is fetched
 * through the same HTTPS-only RSS path as any other source, so no new network
 * surface is involved; this module only turns what users paste into that URL.
 */
const CHANNEL_ID = /^UC[0-9A-Za-z_-]{22}$/;

export function youtubeChannelId(input: string): string | null {
  const text = input.trim();
  if (CHANNEL_ID.test(text)) return text;
  try {
    const url = new URL(text);
    if (!/^(www\.|m\.)?youtube\.com$/.test(url.hostname)) return null;
    const fromQuery = url.searchParams.get("channel_id");
    if (fromQuery && CHANNEL_ID.test(fromQuery)) return fromQuery;
    const match = url.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}
