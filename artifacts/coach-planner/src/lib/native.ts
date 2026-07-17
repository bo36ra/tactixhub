import { Capacitor } from '@capacitor/core';

// This same built app serves both the live website and the Capacitor
// iOS wrapper (server.url points the native shell at the live site) —
// so every native call here must no-op safely in a plain browser tab
// instead of throwing, and only actually fire when running inside the
// native shell.
const isNative = () => Capacitor.isNativePlatform();

export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] });
  } catch {
    // Haptics unavailable — silently ignore, never block the UI action itself.
  }
}

export async function hapticSuccess() {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // ignore
  }
}

export async function hapticSelection() {
  if (!isNative()) return;
  try {
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch {
    // ignore
  }
}

// Called once on app boot (see main.tsx) — matches the status bar's
// text/icon color and background to the app's dark theme instead of
// leaving iOS's default (which can render dark-on-dark, effectively
// invisible clock/battery icons).
export async function initStatusBar() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#141210' });
  } catch {
    // ignore
  }
}

// Native share sheet. Falls back to the Web Share API (or silently does
// nothing if that's unavailable either, e.g. desktop Chrome) when not
// running in the native shell, so the same call site works everywhere.
export async function nativeShare(options: { title?: string; text?: string; url?: string }) {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share(options);
      return;
    } catch {
      // fall through to web share below
    }
  }
  if (navigator.share) {
    try {
      await navigator.share(options);
    } catch {
      // user cancelled or unsupported — nothing to do
    }
  }
}
