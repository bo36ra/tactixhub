import { ExternalLink } from 'lucide-react';
import { parseVideoLink } from '@/lib/video-link';
import { useLanguage } from '@/lib/i18n';

export function VideoEmbed({ url }: { url: string }) {
  const { t } = useLanguage();
  const parsed = parseVideoLink(url);

  if (parsed.kind === 'youtube' || parsed.kind === 'drive') {
    return (
      <div className="rounded-xl overflow-hidden border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          src={parsed.embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (parsed.kind === 'dropbox' && parsed.directUrl) {
    return (
      <video controls className="w-full rounded-xl border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
        <source src={parsed.directUrl} />
      </video>
    );
  }

  // Unrecognized link — don't try to guess how to embed it, just offer
  // to open it directly.
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-6 text-sm text-primary hover:underline"
    >
      <ExternalLink className="w-4 h-4" /> {t('match.openVideoLink')}
    </a>
  );
}
