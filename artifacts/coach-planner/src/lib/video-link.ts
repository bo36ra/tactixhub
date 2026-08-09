export type VideoLinkKind = 'youtube' | 'drive' | 'dropbox' | 'other';

export interface ParsedVideoLink {
  kind: VideoLinkKind;
  // A URL usable directly in an <iframe> (youtube/drive) — undefined
  // for kinds that don't support iframe embedding.
  embedUrl?: string;
  // A URL usable directly as a <video src> — Dropbox share links can
  // be converted into a direct-playable file link this way; other
  // kinds don't have an equivalent.
  directUrl?: string;
  // Raw YouTube video ID — the IFrame API's Player constructor takes
  // an ID, not a URL, so this is needed alongside embedUrl whenever
  // programmatic control (seeking to a tagged timestamp) is needed.
  youtubeId?: string;
}

// Coaches paste whatever share link their video host gives them —
// YouTube's "Share" link, Google Drive's "Share" link, or Dropbox's
// share link — none of which are directly embeddable as-is. Each
// service needs its own transform:
//   - YouTube: watch/shortened URL -> /embed/<id>, playable in an iframe
//   - Google Drive: /view share link -> /preview, playable in an iframe
//   - Dropbox: share link ends in ?dl=0 (opens Dropbox's own preview
//     page) -> ?dl=1 gives the raw file, playable directly in <video>
// Anything else falls back to "open in a new tab" rather than trying
// to embed something we don't recognize.
export function parseVideoLink(url: string): ParsedVideoLink {
  const trimmed = url.trim();

  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  if (ytMatch) {
    return { kind: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, youtubeId: ytMatch[1] };
  }

  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return { kind: 'drive', embedUrl: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
  }

  if (/dropbox\.com\//.test(trimmed)) {
    const direct = trimmed.replace(/[?&]dl=0/, '').replace(/\?$/, '') + (trimmed.includes('?') ? '&raw=1' : '?raw=1');
    return { kind: 'dropbox', directUrl: direct };
  }

  return { kind: 'other' };
}
