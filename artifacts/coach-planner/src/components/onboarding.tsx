import React from 'react';
import { useLanguage } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Users, Dumbbell, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { hapticSelection, hapticImpact } from '@/lib/native';

const SLIDES = [
  { icon: null, titleKey: 'onboarding.s1title', bodyKey: 'onboarding.s1body' },
  { icon: Users, titleKey: 'onboarding.s2title', bodyKey: 'onboarding.s2body' },
  { icon: Dumbbell, titleKey: 'onboarding.s3title', bodyKey: 'onboarding.s3body' },
  { icon: Activity, titleKey: 'onboarding.s4title', bodyKey: 'onboarding.s4body' },
] as const;

export function OnboardingCarousel({ onDone }: { onDone: () => void }) {
  const { t, isRtl } = useLanguage();
  const [index, setIndex] = React.useState(0);
  const startX = React.useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;

  const goNext = () => {
    hapticSelection();
    if (isLast) {
      hapticImpact('light');
      onDone();
    } else {
      setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  };
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const delta = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(delta) < 40) return;
    // RTL-aware: in Arabic, swiping right advances (mirrors reading direction)
    const advance = isRtl ? delta > 0 : delta < 0;
    if (advance) goNext();
    else goPrev();
  };

  const slide = SLIDES[index];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex justify-end p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {!isLast && (
          <button type="button" className="text-sm text-muted-foreground px-3 py-1.5" onClick={onDone}>
            {t('onboarding.skip')}
          </button>
        )}
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {index === 0 ? (
          <img src="/logo-icon.svg" alt="TactixHub" className="w-24 h-24" />
        ) : (
          Icon && (
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-10 h-10 text-primary" />
            </div>
          )
        )}
        <div className="space-y-2 max-w-xs">
          <h1 className="text-2xl font-bold font-display">{t(slide.titleKey)}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{t(slide.bodyKey)}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-6">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-primary' : 'w-1.5 bg-white/15'}`}
          />
        ))}
      </div>

      <div className="p-6 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <Button className="w-full h-12 text-base" onClick={goNext}>
          {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          {!isLast && (isRtl ? <ChevronLeft className="w-4 h-4 ms-1" /> : <ChevronRight className="w-4 h-4 ms-1" />)}
        </Button>
      </div>
    </div>
  );
}
