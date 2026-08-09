import React from 'react';
import { ExternalLink, Plus, Trash2, Play, Clock } from 'lucide-react';
import { parseVideoLink } from '@/lib/video-link';
import { useYouTubePlayer } from '@/lib/youtube-player';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  useListMatchVideoTags, useCreateMatchVideoTag, useDeleteMatchVideoTag,
  getListMatchVideoTagsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const CATEGORIES = ['attacking', 'defensive', 'set_piece', 'individual', 'general'] as const;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseManualTime(input: string): number | null {
  const m = input.trim().match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  if (seconds >= 60) return null;
  return minutes * 60 + seconds;
}

export function VideoWithTags({ url, teamId, matchId }: { url: string; teamId: number; matchId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const parsed = parseVideoLink(url);
  const canControl = parsed.kind === 'youtube' || parsed.kind === 'dropbox';

  const yt = useYouTubePlayer(parsed.kind === 'youtube' ? (parsed.youtubeId ?? '') : '');
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const { data: tags } = useListMatchVideoTags(teamId, matchId);
  const createTag = useCreateMatchVideoTag();
  const deleteTag = useDeleteMatchVideoTag();

  const [label, setLabel] = React.useState('');
  const [category, setCategory] = React.useState<string>('general');
  const [manualTime, setManualTime] = React.useState('');
  const [capturedTime, setCapturedTime] = React.useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMatchVideoTagsQueryKey(teamId, matchId) });

  const captureNow = () => {
    if (parsed.kind === 'youtube') setCapturedTime(yt.getCurrentTime());
    else if (parsed.kind === 'dropbox') setCapturedTime(Math.floor(videoRef.current?.currentTime ?? 0));
  };

  const jumpTo = (seconds: number) => {
    if (parsed.kind === 'youtube') yt.seekTo(seconds);
    else if (parsed.kind === 'dropbox' && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  const handleAddTag = () => {
    const timestampSeconds = canControl ? capturedTime : parseManualTime(manualTime);
    if (timestampSeconds === null || !label.trim()) return;
    createTag.mutate(
      { teamId, matchId, data: { timestampSeconds, label: label.trim(), category } },
      {
        onSuccess: () => { invalidate(); setLabel(''); setManualTime(''); setCapturedTime(null); },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-3">
      {parsed.kind === 'youtube' ? (
        <div className="rounded-xl overflow-hidden border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
          <div ref={yt.containerRef} className="w-full h-full" />
        </div>
      ) : parsed.kind === 'drive' ? (
        <div className="rounded-xl overflow-hidden border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={parsed.embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : parsed.kind === 'dropbox' && parsed.directUrl ? (
        <video ref={videoRef} controls className="w-full rounded-xl border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
          <source src={parsed.directUrl} />
        </video>
      ) : (
        <a
          href={url} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-6 text-sm text-primary hover:underline"
        >
          <ExternalLink className="w-4 h-4" /> {t('match.openVideoLink')}
        </a>
      )}

      {/* Add-tag form */}
      <div className="bg-card border rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{t('match.tagMoment')}</p>
        <div className="flex flex-wrap gap-2">
          {canControl ? (
            <Button type="button" size="sm" variant="secondary" onClick={captureNow} className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {capturedTime !== null ? formatTime(capturedTime) : t('match.captureTime')}
            </Button>
          ) : (
            <Input
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              placeholder="mm:ss"
              dir="ltr"
              className="w-24"
            />
          )}
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('match.tagLabelPlaceholder')}
            className="flex-1 min-w-[10rem]"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`match.tagCat.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button" size="sm" onClick={handleAddTag}
            disabled={(canControl ? capturedTime === null : !parseManualTime(manualTime)) || !label.trim() || createTag.isPending}
          >
            <Plus className="w-4 h-4 me-1" />{t('common.add')}
          </Button>
        </div>
      </div>

      {/* Tag list */}
      {tags && tags.length > 0 && (
        <div className="space-y-1.5">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
              {canControl ? (
                <button
                  type="button"
                  onClick={() => jumpTo(tag.timestampSeconds)}
                  className="flex items-center gap-1.5 text-xs font-mono font-bold text-primary shrink-0 hover:underline"
                  dir="ltr"
                >
                  <Play className="w-3 h-3" />{formatTime(tag.timestampSeconds)}
                </button>
              ) : (
                <span className="text-xs font-mono font-bold text-primary shrink-0" dir="ltr">{formatTime(tag.timestampSeconds)}</span>
              )}
              <span className="text-sm flex-1 min-w-0 truncate">{tag.label}</span>
              {tag.category && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                  {t(`match.tagCat.${tag.category}`)}
                </span>
              )}
              <button
                type="button"
                className="text-destructive/60 hover:text-destructive shrink-0 p-1"
                onClick={() => deleteTag.mutate({ teamId, matchId, tagId: tag.id }, { onSuccess: invalidate, onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
