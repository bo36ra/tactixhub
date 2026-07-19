import { Capacitor } from '@capacitor/core';

// This same built app serves both the live website and the Capacitor
// iOS wrapper (server.url points the native shell at the live site) —
// so every native call here must no-op safely in a plain browser tab
// instead of throwing, and only actually fire when running inside the
// native shell.
// Whether this code is running inside the actual native Capacitor
// shell (the installed iOS app) versus a regular browser tab — this is
// the real distinction between "the app" and "the website", unlike a
// screen-width breakpoint which can't tell a phone browser apart from
// the installed app. Structural, native-feeling UI (bottom tab bar,
// bottom sheets, collapsing headers, swipe gestures) is gated on this,
// not on viewport size, so the website stays a website on any device
// and the installed app stays an app.
export const isNativeApp = () => Capacitor.isNativePlatform();
const isNative = isNativeApp;

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

// Called once on app boot (see main.tsx) — sets the status bar icons to
// light-on-dark to match the app's theme. The white-strip issue behind
// the status bar is handled by capacitor.config.ts's backgroundColor
// (painting the *native* root view dark), not here — an earlier
// approach used setOverlaysWebView(true) + contentInset:'never' to
// extend the webview edge-to-edge instead, which worked but shifted the
// whole layout up under the notch; the background-color approach keeps
// the original, untouched layout.
export async function initStatusBar() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
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

// Configures the native Keyboard plugin to resize the webview's body
// when the keyboard appears, so a focused input near the bottom of the
// screen doesn't end up hidden behind it — the keyboard pushes the
// layout up instead of just overlaying it. No-ops on web (there is no
// on-screen keyboard to manage).
export async function initKeyboardResize() {
  if (!isNative()) return;
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    // ignore
  }
}
