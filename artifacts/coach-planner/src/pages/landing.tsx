import React from 'react';
import { Link } from 'wouter';
import { buttonVariants } from '@/components/ui/button';
import { Globe, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export function Landing() {
  const { t, lang, setLang } = useLanguage();

  const features = [
    { num: '01', title: t('landing.f1title'), body: t('landing.f1body') },
    { num: '02', title: t('landing.f2title'), body: t('landing.f2body') },
    { num: '03', title: t('landing.f3title'), body: t('landing.f3body') },
  ];

  const featureStrip = [
    { title: t('landing.feat1title'), desc: t('landing.feat1body') },
    { title: t('landing.feat2title'), desc: t('landing.feat2body') },
    { title: t('landing.feat3title'), desc: t('landing.feat3body') },
    { title: t('landing.feat4title'), desc: t('landing.feat4body') },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">

      {/* ── Nav ── */}
      <header className="fixed inset-x-0 top-0 z-50 h-14 flex items-center px-6 md:px-10 border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="flex-1 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <span className="font-display font-bold text-primary-foreground text-xs leading-none">CP</span>
          </div>
          <span className="font-display font-bold text-base tracking-tight">{t('app.title')}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            aria-label={t('nav.toggleLang')}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <Globe className="w-4 h-4" />
          </button>
          <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium px-2 py-1">
            {t('landing.signIn')}
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: 'sm', className: 'h-8 px-4 text-sm' })}>
            {t('landing.getStarted')}
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col pt-14">

        {/* ── Hero ── */}
        <section className="relative flex-1 flex flex-col justify-center px-6 md:px-10 py-24 md:py-36 overflow-hidden">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-[0.07]"
              style={{ background: 'radial-gradient(circle, #C9AF8E 0%, transparent 70%)' }}
            />
          </div>

          <div className="relative max-w-5xl">
            <p className="font-serif-italic text-primary text-sm md:text-base mb-6 tracking-wide">
              {t('landing.eyebrow')}
            </p>
            <h1 className="font-display font-bold text-5xl md:text-7xl lg:text-[88px] leading-[1.0] tracking-tight text-foreground mb-8">
              {t('landing.heroMain')}<br />
              <span className="text-muted-foreground/50">{t('landing.heroSub')}</span>{' '}
              <span className="text-primary">{t('landing.heroBold')}</span>
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-xl mb-10 leading-relaxed">
              {t('landing.body')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'h-12 px-7 text-base gap-2 group' })}>
                {t('landing.startFree')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link href="/sign-in" className={buttonVariants({ size: 'lg', variant: 'outline', className: 'h-12 px-7 text-base border-border text-muted-foreground hover:text-foreground' })}>
                {t('landing.signIn')}
              </Link>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="px-6 md:px-10 py-24 border-t border-border bg-card">
          <p className="font-serif-italic text-primary text-sm mb-10 tracking-wide">
            {t('landing.howEyebrow')}
          </p>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-foreground mb-16 max-w-lg leading-tight">
            {t('landing.howTitle')}
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {features.map(({ num, title, body }) => (
              <div key={num} className="space-y-3">
                <span className="font-mono-num text-primary text-sm font-semibold tracking-widest">{num}</span>
                <div className="w-8 h-px bg-border" />
                <h3 className="font-display font-bold text-xl text-foreground">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature strip ── */}
        <section className="px-6 md:px-10 py-24 border-t border-border">
          <p className="font-serif-italic text-primary text-sm mb-10 tracking-wide">
            {t('landing.insideEyebrow')}
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {featureStrip.map(({ title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-xl border border-border bg-card space-y-2 hover:border-primary/30 transition-colors"
              >
                <h3 className="font-display font-bold text-foreground">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="px-6 md:px-10 py-24 border-t border-border bg-card text-center">
          <p className="font-serif-italic text-primary text-sm mb-6 tracking-wide">
            {t('landing.ctaEyebrow')}
          </p>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-foreground mb-6">
            {t('landing.ctaTitle')}
          </h2>
          <p className="text-muted-foreground mb-10 max-w-md mx-auto">
            {t('landing.ctaBody')}
          </p>
          <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'h-12 px-8 text-base gap-2 group' })}>
            {t('landing.ctaButton')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </section>
      </main>

      <footer className="px-6 md:px-10 py-8 border-t border-border flex items-center justify-between">
        <span className="font-display font-bold text-sm text-foreground">{t('app.title')}</span>
        <p className="text-muted-foreground text-xs">© {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
