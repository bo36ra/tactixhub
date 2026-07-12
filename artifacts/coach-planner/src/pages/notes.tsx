import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useUser } from '@clerk/react';
import {
  useListNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useListTeamMembers,
  getListNotesQueryKey,
  getListTeamMembersQueryKey,
  type Note,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { Pin, PinOff, Pencil, Trash2, Send, X } from 'lucide-react';
import { format } from 'date-fns';

export function Notes() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editContent, setEditContent] = React.useState('');
  const [editTitle, setEditTitle] = React.useState('');
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const { toast } = useToast();

  const { data: notes } = useListNotes(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListNotesQueryKey(activeTeamId!) },
  });
  const { data: members } = useListTeamMembers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListTeamMembersQueryKey(activeTeamId!) },
  });
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const isOwner = members?.find((m) => m.userId === user?.id)?.role === 'owner';
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(activeTeamId!) });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !content.trim()) return;
    createNote.mutate(
      {
        teamId: activeTeamId,
        data: { content: content.trim(), ...(title.trim() && { title: title.trim() }) },
      },
      {
        onSuccess: () => {
          toast({ title: t('notes.saved') });
          invalidate();
          setTitle('');
          setContent('');
        },
      },
    );
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditTitle(note.title ?? '');
  };

  const handleSaveEdit = (noteId: number) => {
    if (!editContent.trim()) return;
    updateNote.mutate(
      { teamId: activeTeamId!, noteId, data: { content: editContent.trim(), title: editTitle.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setEditingId(null);
        },
      },
    );
  };

  const togglePin = (note: Note) => {
    updateNote.mutate(
      { teamId: activeTeamId!, noteId: note.id, data: { pinned: !note.pinned } },
      { onSuccess: invalidate },
    );
  };

  const handleDelete = (noteId: number) => setDeleteId(noteId);
  const confirmDelete = () => {
    if (deleteId === null) return;
    deleteNote.mutate({ teamId: activeTeamId!, noteId: deleteId }, { onSuccess: invalidate });
    setDeleteId(null);
  };

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-8 max-w-3xl">
        <h2 className="text-2xl font-bold">{t('notes.title')}</h2>

        {/* Composer */}
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3"
        >
          <Input
            placeholder={t('notes.noteTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder={t('notes.contentPlaceholder')}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" className="gap-2" disabled={!content.trim() || createNote.isPending}>
              <Send className="w-4 h-4" /> {t('notes.add')}
            </Button>
          </div>
        </form>

        {/* Notes list */}
        {!notes || notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('notes.empty')}</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const mine = note.authorUserId === user?.id;
              const canManage = mine || isOwner;
              const edited = note.updatedAt !== note.createdAt;
              const editing = editingId === note.id;
              return (
                <div
                  key={note.id}
                  className={`rounded-xl border p-4 ${
                    note.pinned
                      ? 'border-primary/30 bg-primary/[0.04]'
                      : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-xs shrink-0">
                        {note.authorName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{note.authorName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(note.createdAt), 'dd/MM/yyyy HH:mm')}
                          {edited && <span className="ms-1">· {t('notes.edited')}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {note.pinned && !canManage && <Pin className="w-3.5 h-3.5 text-primary" />}
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            title={note.pinned ? t('notes.unpin') : t('notes.pin')}
                            onClick={() => togglePin(note)}
                          >
                            {note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => (editing ? setEditingId(null) : startEdit(note))}
                          >
                            {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(note.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-3 space-y-2">
                      <Input
                        placeholder={t('notes.noteTitle')}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <Textarea
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={!editContent.trim() || updateNote.isPending}
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {note.title && <p className="mt-3 text-sm font-semibold">{note.title}</p>}
                      <p className={`${note.title ? 'mt-1' : 'mt-3'} text-sm text-foreground/90 whitespace-pre-wrap`}>
                        {note.content}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <ConfirmDialog
          open={deleteId !== null}
          title={t('notes.deleteConfirm')}
          onConfirm={confirmDelete}
          onOpenChange={(o) => !o && setDeleteId(null)}
        />
      </div>
    </AppLayout>
  );
}

export default Notes;
