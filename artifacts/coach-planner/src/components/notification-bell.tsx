import React from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import {
  useListNotifications,
  useGetUnreadNotificationsCount,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationsCountQueryKey,
  type AppNotification,
} from '@workspace/api-client-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n';

// Builds the localized sentence for a notification from its type + meta
// JSON. Messages are never stored as prose on the server because the app
// is bilingual and the user can switch language at any time.
function useNotificationText() {
  const { t } = useLanguage();
  return (n: AppNotification): string => {
    let meta: Record<string, string> = {};
    try {
      meta = n.meta ? JSON.parse(n.meta) : {};
    } catch {
      // ignore malformed meta
    }
    if (meta.role) meta.role = t(`staff.role.${meta.role}`);
    const key =
      n.type === 'note_created' && meta.noteTitle
        ? 'notif.note_created.titled'
        : `notif.${n.type}`;
    let template = t(key);
    if (template === key) template = t(`notif.${n.type}`);
    return template.replace(/\{(\w+)\}/g, (_, name) => meta[name] ?? '');
  };
}

function timeAgo(iso: string, isRtl: boolean): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return isRtl ? 'الآن' : 'now';
  if (mins < 60) return isRtl ? `قبل ${mins} د` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isRtl ? `قبل ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isRtl ? `قبل ${days} يوم` : `${days}d ago`;
}

export function NotificationBell() {
  const { t, isRtl } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const renderText = useNotificationText();

  // Lightweight unread counter, polled so the badge stays fresh while the
  // rest of the staff is working in parallel.
  const { data: unread } = useGetUnreadNotificationsCount({
    query: { refetchInterval: 30_000, queryKey: getGetUnreadNotificationsCountQueryKey() },
  });
  const { data: notifications } = useListNotifications({
    query: { enabled: open, queryKey: getListNotificationsQueryKey() },
  });
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = unread?.count ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && unreadCount > 0) {
      // Closing the dropdown counts as "seen"
      markAllRead.mutate(undefined, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsCountQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        },
      });
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} dir={isRtl ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('notif.title')}
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold">{t('notif.title')}</p>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount}</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('notif.empty')}
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className="w-full text-start px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-white/[0.04] transition-colors"
                onClick={() => {
                  setOpen(false);
                  if (n.link) setLocation(n.link);
                }}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {renderText(n)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {timeAgo(n.createdAt, isRtl)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
