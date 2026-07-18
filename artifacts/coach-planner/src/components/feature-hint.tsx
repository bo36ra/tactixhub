import React from 'react';
import { Lightbulb, X } from 'lucide-react';

// A short explanation banner shown the first time a coach opens a
// newer/less-obvious feature — dismissed once, it never reappears on
// that device (tracked per feature id, same localStorage pattern as
// the onboarding carousel). Lower-friction than a tooltip pointing at
// a specific button: it explains the *page*, not one control, and
// doesn't need per-element positioning.
export function FeatureHint({ id, title, body }: { id: string; title: string; body: string }) {
  const key = `tactixhub_hint_${id}`;
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return true;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // storage unavailable — just hide for this render, no persistence
    }
    setDismissed(true);
  };

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 flex items-start gap-3">
      <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </div>
      <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0 p-1 -m-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
