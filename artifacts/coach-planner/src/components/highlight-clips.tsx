import React from 'react';
import { Film, Plus, Trash2, Play, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  useListMatchHighlightClips, useCreateMatchHighlightClip, useDeleteMatchHighlightClip,
  getListMatchHighlightClipsQueryKey, useListPlayers,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { playerName } from '@/lib/player-name';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CATEGORIES = ['attacking', 'defensive', 'set_piece', 'individual', 'general'] as const;
const NO_PLAYER = '__none__';

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function HighlightClips({ teamId, matchId }: { teamId: number; matchId: number }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: players } = useListPlayers(teamId);
  const { data: clips } = useListMatchHighlightClips(teamId, matchId);
  const create = useCreateMatchHighlightClip();
  const del = useDeleteMatchHighlightClip();

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<string>('general');
  const [playerId, setPlayerId] = React.useState<string>(NO_PLAYER);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [playingClipId, setPlayingClipId] = React.useState<number | null>(null);
  const [playingUrl, setPlayingUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMatchHighlightClipsQueryKey(teamId, matchId) });

  const resetForm = () => {
    setTitle(''); setCategory('general'); setPlayerId(NO_PLAYER); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilePick = (f: File | null) => {
    if (f && f.size > MAX_FILE_BYTES) {
      toast({ title: t('match.clipTooLarge'), variant: 'destructive' });
      return;
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async () => {
    if (!title.trim() || !file) return;
    setUploading(true);
    try {
      const fileData = await fileToBase64(file);
      create.mutate(
        {
          teamId, matchId,
          data: {
            title: title.trim(), category, fileName: file.name, mimeType: file.type || 'video/mp4', fileData,
            ...(playerId !== NO_PLAYER && { playerId: Number(playerId) }),
          },
        },
        {
          onSuccess: () => { invalidate(); resetForm(); },
          onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
          onSettled: () => setUploading(false),
        },
      );
    } catch {
      toast({ title: t('common.saveFailed'), variant: 'destructive' });
      setUploading(false);
    }
  };

  const playClip = async (clipId: number) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/matches/${matchId}/highlight-clips/${clipId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      const clip = await res.json();
      setPlayingUrl(`data:${clip.mimeType};base64,${clip.fileData}`);
      setPlayingClipId(clipId);
    } catch {
      toast({ title: t('match.openVideoLink'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Film className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">{t('match.highlightClips')}</p>
      </div>

      {playingUrl && (
        <div className="relative">
          <video controls autoPlay className="w-full rounded-xl border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
            <source src={playingUrl} />
          </video>
          <button
            type="button"
            onClick={() => { setPlayingUrl(null); setPlayingClipId(null); }}
            className="absolute top-2 end-2 bg-black/60 text-white rounded-full p-1.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload form */}
      <div className="bg-card border rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('common.title')} className="flex-1 min-w-[10rem]" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`match.tagCat.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={playerId} onValueChange={setPlayerId}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t('match.tagPlayer')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PLAYER}>{t('match.tagNoPlayer')}</SelectItem>
              {(players ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{playerName(p, lang)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:me-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm"
          />
          {file && <p className="text-xs text-muted-foreground mt-1">{formatSize(file.size)}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">{t('match.clipMaxSize')}</p>
        </div>
        <Button size="sm" disabled={!title.trim() || !file || uploading} onClick={handleUpload}>
          <Plus className="w-4 h-4 me-1" />{uploading ? t('common.saving') : t('match.uploadClip')}
        </Button>
      </div>

      {/* Clip list */}
      {clips && clips.length > 0 && (
        <div className="space-y-1.5">
          {clips.map((clip) => {
            const clipPlayer = players?.find((p) => p.id === clip.playerId);
            return (
              <div key={clip.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
                <button
                  type="button"
                  onClick={() => playClip(clip.id)}
                  className={`p-1.5 rounded-full shrink-0 ${playingClipId === clip.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm flex-1 min-w-0 truncate">
                  {clip.title}
                  {clipPlayer && <span className="text-muted-foreground"> · {playerName(clipPlayer, lang)}</span>}
                </span>
                {clip.category && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                    {t(`match.tagCat.${clip.category}`)}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(clip.fileSize)}</span>
                <button
                  type="button"
                  className="text-destructive/60 hover:text-destructive shrink-0 p-1"
                  onClick={() => del.mutate({ teamId, matchId, clipId: clip.id }, { onSuccess: invalidate, onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
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
