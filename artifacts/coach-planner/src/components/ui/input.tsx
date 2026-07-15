import * as React from 'react';
import { cn } from '@/lib/utils';

// Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits. Some
// keyboards insert these into type="number" fields instead of Western
// digits, which the HTML5 number input then silently rejects — the field
// looks broken (empty/stuck) rather than showing a clear error. Blocking
// them at input time keeps every numeric field in the app (jersey
// number, birth year, durations, RPE, etc.) reliably Western-digit-only
// without touching each call site individually.
const NON_WESTERN_DIGIT_RE = /[\u0660-\u0669\u06F0-\u06F9]/;

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onBeforeInput, ...props }, ref) => {
    const handleBeforeInput = (e: React.InputEvent<HTMLInputElement>) => {
      const data = e.nativeEvent.data;
      if (type === 'number' && data && NON_WESTERN_DIGIT_RE.test(data)) {
        e.preventDefault();
      }
      onBeforeInput?.(e);
    };
    return (
      <input
        type={type}
        onBeforeInput={type === 'number' ? handleBeforeInput : onBeforeInput}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
