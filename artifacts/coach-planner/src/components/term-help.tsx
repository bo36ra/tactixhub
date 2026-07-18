import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// A small (?) icon that opens a plain-language explanation on tap —
// Popover rather than Tooltip specifically because tooltips rely on
// hover, which doesn't exist on a touch screen (this app's primary
// surface). Meant for scientific/technical labels like ACWR, Monotony,
// Strain — a coach shouldn't need to already know sports-science
// jargon to understand what a number on their own dashboard means.
export function TermHelp({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground/50 hover:text-primary inline-flex align-middle ms-1" onClick={(e) => e.stopPropagation()}>
          <HelpCircle className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed" side="top">
        {children}
      </PopoverContent>
    </Popover>
  );
}
