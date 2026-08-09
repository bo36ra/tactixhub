import React from 'react';

// The YouTube IFrame API is loaded once globally and reused — a plain
// <iframe src="...youtube.com/embed/..."> has no way to read the
// current playback position or seek to a specific one from JS (that's
// what makes "jump to this tagged moment" and "tag the moment I'm
// paused on" possible at all for YouTube specifically).
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

export function useYouTubePlayer(videoId: string) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!videoId || !containerRef.current) return;
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0 },
        events: {
          onReady: () => { if (!cancelled) setReady(true); },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId]);

  const getCurrentTime = React.useCallback((): number => {
    return Math.floor(playerRef.current?.getCurrentTime?.() ?? 0);
  }, []);

  const seekTo = React.useCallback((seconds: number) => {
    playerRef.current?.seekTo?.(seconds, true);
    playerRef.current?.playVideo?.();
  }, []);

  return { containerRef, ready, getCurrentTime, seekTo };
}
