import React from 'react';
import { AppLayout } from '@/components/layout';
import { PageTitle } from '@/components/page-header';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  useListLibraryDocuments, useCreateLibraryDocument, useDeleteLibraryDocument,
  getListLibraryDocumentsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Plus, Trash2, FileText, Download } from 'lucide-react';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const CATEGORIES = ['endurance', 'speed', 'speed_endurance', 'strength', 'tactical', 'general'] as const;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:application/pdf;base64," prefix — the API stores
      // and re-serves raw base64, the data-url prefix is reattached on
      // the client whenever the file is actually opened.
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Library() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: docs, isLoading } = useListLibraryDocuments();
  const create = useCreateLibraryDocument();
  const del = useDeleteLibraryDocument();

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState<string>('general');
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLibraryDocumentsQueryKey() });

  const resetForm = () => {
    setTitle(''); setDescription(''); setCategory('general'); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilePick = (f: File | null) => {
    if (f && f.size > MAX_FILE_BYTES) {
      toast({ title: t('pdfLib.tooLarge'), variant: 'destructive' });
      return;
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  const handleUpload = async () => {
    if (!title.trim() || !file) return;
    setUploading(true);
    try {
      const fileData = await fileToBase64(file);
      create.mutate(
        { data: { title: title.trim(), description: description.trim() || undefined, category, fileName: file.name, fileData } },
        {
          onSuccess: () => { invalidate(); setOpen(false); resetForm(); },
          onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
          onSettled: () => setUploading(false),
        },
      );
    } catch {
      toast({ title: t('common.saveFailed'), variant: 'destructive' });
      setUploading(false);
    }
  };

  const openDoc = async (id: number) => {
    try {
      const res = await fetch(`/api/library/documents/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      const doc = await res.json();
      const win = window.open('', '_blank');
      if (win) win.location.href = `data:application/pdf;base64,${doc.fileData}`;
    } catch {
      toast({ title: t('pdfLib.openFailed'), variant: 'destructive' });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            <PageTitle>{t('nav.library')}</PageTitle>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 me-1" />{t('pdfLib.upload')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('pdfLib.upload')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">{t('common.title')}</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t('pdfLib.category')}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`pdfLib.cat.${c}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t('common.description')} ({t('common.optional')})</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                </div>
                <div>
                  <Label className="text-xs">PDF</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted-foreground file:me-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm"
                  />
                  {file && <p className="text-xs text-muted-foreground mt-1">{formatSize(file.size)}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{t('pdfLib.maxSize')}</p>
                </div>
                <Button className="w-full" disabled={!title.trim() || !file || uploading} onClick={handleUpload}>
                  {uploading ? t('common.saving') : t('pdfLib.upload')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-3 py-3">
                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !docs || docs.length === 0 ? (
          <div className="bg-card border rounded-xl p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('pdfLib.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-3 py-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.category && `${t(`pdfLib.cat.${doc.category}`)} · `}{formatSize(doc.fileSize)}
                  </p>
                  {doc.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.description}</p>}
                </div>
                <button type="button" className="text-muted-foreground hover:text-primary p-2 shrink-0" onClick={() => openDoc(doc.id)}>
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="text-destructive/60 hover:text-destructive p-2 shrink-0"
                  onClick={() => del.mutate({ documentId: doc.id }, { onSuccess: invalidate, onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
