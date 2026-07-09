import React from 'react';
import { SignIn, SignUp } from '@clerk/react';
import { useLanguage } from '@/lib/i18n';
import { ShieldHalf } from 'lucide-react';
import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SignInPage() {
  const { lang } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80">
          <ShieldHalf className="w-6 h-6" />
          <span className="font-bold tracking-tight">Coach Planner</span>
        </Link>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

export function SignUpPage() {
  const { lang } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80">
          <ShieldHalf className="w-6 h-6" />
          <span className="font-bold tracking-tight">Coach Planner</span>
        </Link>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}
