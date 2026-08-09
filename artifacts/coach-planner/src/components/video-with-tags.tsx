import React from 'react';
import { ExternalLink, Plus, Trash2, Play, Clock, PenLine, Eraser } from 'lucide-react';
import { parseVideoLink } from '@/lib/video-link';
import { useYouTubePlayer } from '@/lib/youtube-player';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  useListMatchVideoTags, useCreateMatchVideoTag, useDeleteMatchVideoTag,
  getListMatchVideoTagsQueryKey, useListPlayers,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DrawingOverlay, type Arrow } from '@/components/drawing-overlay';
import { playerName } from '@/lib/player-name';

const CATEGORIES = ['attacking', 'defensive', 'set_piece', 'individual', 'general'] as const;
const ALL_PLAYERS = '__all__';
const NO_PLAYER = '__none__';

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

function parseArrows(drawingData: string | null | undefined): Arrow[] {
  if (!drawingData) return [];
  try {
    const parsed = JSON.parse(drawingData);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function VideoWithTags({ url, teamId, matchId }: { url: string; teamId: number; matchId: number }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const parsed = parseVideoLink(url);
  const canControl = parsed.kind === 'youtube' || parsed.kind === 'dropbox';

  const yt = useYouTubePlayer(parsed.kind === 'youtube' ? (parsed.youtubeId ?? '') : '');
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const { data: players } = useListPlayers(teamId);
  const { data: tags } = useListMatchVideoTags(teamId, matchId);
  const createTag = useCreateMatchVideoTag();
  const deleteTag = useDeleteMatchVideoTag();

  const [label, setLabel] = React.useState('');
  const [category, setCategory] = React.useState<string>('general');
  const [taggedPlayerId, setTaggedPlayerId] = React.useState<string>(NO_PLAYER);
  const [manualTime, setManualTime] = React.useState('');
  const [capturedTime, setCapturedTime] = React.useState<number | null>(null);
  const [filterPlayerId, setFilterPlayerId] = React.useState<string>(ALL_PLAYERS);
  const [drawMode, setDrawMode] = React.useState(false);
  const [draftArrows, setDraftArrows] = React.useState<Arrow[]>([]);
  const [visibleDrawingTagId, setVisibleDrawingTagId] = React.useState<number | null>(null);

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
      {
        teamId, matchId,
        data: {
          timestampSeconds,
          label: label.trim(),
          category,
          ...(taggedPlayerId !== NO_PLAYER && { playerId: Number(taggedPlayerId) }),
          ...(draftArrows.length > 0 && { drawingData: JSON.stringify(draftArrows) }),
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setLabel(''); setManualTime(''); setCapturedTime(null);
          setTaggedPlayerId(NO_PLAYER); setDraftArrows([]); setDrawMode(false);
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  const visibleTags = (tags ?? []).filter((tag) => filterPlayerId === ALL_PLAYERS || tag.playerId === Number(filterPlayerId));
  const playersWithTags = (players ?? []).filter((p) => (tags ?? []).some((tag) => tag.playerId === p.id));

  return (
    <div className="space-y-3">
      <div className="relative">
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
        {drawMode && (parsed.kind === 'youtube' || parsed.kind === 'drive' || parsed.kind === 'dropbox') && (
          <DrawingOverlay arrows={draftArrows} editable onChange={setDraftArrows} />
        )}
        {!drawMode && visibleDrawingTagId !== null && (parsed.kind === 'youtube' || parsed.kind === 'drive' || parsed.kind === 'dropbox') && (
          <DrawingOverlay arrows={parseArrows((tags ?? []).find((tg) => tg.id === visibleDrawingTagId)?.drawingData)} editable={false} />
        )}
      </div>

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
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`match.tagCat.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={taggedPlayerId} onValueChange={setTaggedPlayerId}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t('match.tagPlayer')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PLAYER}>{t('match.tagNoPlayer')}</SelectItem>
              {(players ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{playerName(p, lang)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button" size="sm" variant={drawMode ? 'default' : 'secondary'}
            onClick={() => setDrawMode((v) => !v)}
            className="gap-1.5"
          >
            <PenLine className="w-3.5 h-3.5" />
            {t('match.drawArrows')}{draftArrows.length > 0 ? ` (${draftArrows.length})` : ''}
          </Button>
          {draftArrows.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraftArrows([])} className="gap-1.5 text-destructive">
              <Eraser className="w-3.5 h-3.5" />{t('match.clearDrawing')}
            </Button>
          )}
          <Button
            type="button" size="sm" onClick={handleAddTag}
            disabled={(canControl ? capturedTime === null : !parseManualTime(manualTime)) || !label.trim() || createTag.isPending}
            className="ms-auto"
          >
            <Plus className="w-4 h-4 me-1" />{t('common.add')}
          </Button>
        </div>
        {drawMode && <p className="text-[11px] text-muted-foreground">{t('match.drawHint')}</p>}
      </div>

      {/* Player filter — only shown once there's more than one player with tags */}
      {playersWithTags.length > 0 && (
        <Select value={filterPlayerId} onValueChange={setFilterPlayerId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PLAYERS}>{t('match.tagAllMoments')}</SelectItem>
            {playersWithTags.map((p) => <SelectItem key={p.id} value={String(p.id)}>{playerName(p, lang)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Tag list */}
      {visibleTags.length > 0 && (
        <div className="space-y-1.5">
          {visibleTags.map((tag) => {
            const arrows = parseArrows(tag.drawingData);
            const tagPlayer = players?.find((p) => p.id === tag.playerId);
            return (
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
                <span className="text-sm flex-1 min-w-0 truncate">
                  {tag.label}
                  {tagPlayer && <span className="text-muted-foreground"> · {playerName(tagPlayer, lang)}</span>}
                </span>
                {tag.category && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                    {t(`match.tagCat.${tag.category}`)}
                  </span>
                )}
                {arrows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisibleDrawingTagId((id) => (id === tag.id ? null : tag.id))}
                    className={`p-1 shrink-0 ${visibleDrawingTagId === tag.id ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-destructive/60 hover:text-destructive shrink-0 p-1"
                  onClick={() => deleteTag.mutate({ teamId, matchId, tagId: tag.id }, { onSuccess: invalidate, onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
