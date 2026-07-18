import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/lib/i18n';
import { ToastAction } from '@/components/ui/toast';

const UNDO_WINDOW_MS = 5000;

// The safety net for every "delete" action in the app: instead of
// calling the delete API the moment the user confirms, this hides the
// item from the UI immediately (feels instant) and shows a toast with
// an Undo button for a few seconds. The actual API call only fires
// once that window passes without the user hitting Undo — so a
// misclick, a change of mind, or just wanting to double-check never
// costs real data. No backend changes needed: it's purely a client-side
// delay, so it works the same way for any entity (matches, attendance,
// players, exercises, ...) without a soft-delete/restore endpoint.
export function useUndoableDelete() {
  const { toast } = useToast();
  const { t } = useLanguage();

  return function undoableDelete(options: {
    onOptimisticRemove: () => void;
    onRestore: () => void;
    onConfirmDelete: () => void | Promise<void>;
  }) {
    let undone = false;
    options.onOptimisticRemove();
    const timeoutId = setTimeout(() => {
      if (!undone) options.onConfirmDelete();
    }, UNDO_WINDOW_MS);

    toast({
      title: t('common.deleted'),
      action: (
        <ToastAction
          altText={t('common.undo')}
          onClick={() => {
            undone = true;
            clearTimeout(timeoutId);
            options.onRestore();
          }}
        >
          {t('common.undo')}
        </ToastAction>
      ),
    });
  };
}
