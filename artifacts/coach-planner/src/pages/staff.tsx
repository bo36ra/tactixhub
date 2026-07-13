import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useUser } from '@clerk/react';
import {
  useListTeams,
  useListTeamMembers,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
  getListTeamMembersQueryKey,
  type TeamMember,
  TeamMemberInputRole,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useBulkInvite } from '@/lib/dev-api';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, MoreVertical, Crown, Mail } from 'lucide-react';

const ASSIGNABLE_ROLES: TeamMemberInputRole[] = [
  TeamMemberInputRole.technical_director,
  TeamMemberInputRole.coach,
  TeamMemberInputRole.assistant,
  TeamMemberInputRole.fitness_coach,
  TeamMemberInputRole.admin,
];

// Standard football-staff abbreviations for the avatar circle — reads
// cleaner than initials, especially with Arabic names.
const ROLE_BADGES: Record<string, string> = {
  technical_director: 'TD',
  coach: 'C',
  assistant: 'AC',
  fitness_coach: 'FC',
  admin: 'TM', // Team Manager — the standard football term for the admin role
  analyst: 'AN',
};

export function Staff() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [removeId, setRemoveId] = React.useState<number | null>(null);
  const [formData, setFormData] = React.useState({
    email: '',
    displayName: '',
    role: TeamMemberInputRole.assistant as TeamMemberInputRole,
  });

  const { data: members } = useListTeamMembers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListTeamMembersQueryKey(activeTeamId!) },
  });
  const addMember = useAddTeamMember();
  const updateMember = useUpdateTeamMember();
  const removeMember = useRemoveTeamMember();
  const bulkInvite = useBulkInvite(activeTeamId ?? 0);
  const { toast } = useToast();
  const { data: myTeams } = useListTeams();
  // Which of the director's teams this invite covers (default: current)
  const [inviteTeamIds, setInviteTeamIds] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (open && activeTeamId) setInviteTeamIds([activeTeamId]);
  }, [open, activeTeamId]);

  const myRole = members?.find((m) => m.userId === user?.id)?.role;
  const isOwner = myRole === 'owner';

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey(activeTeamId!) });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !formData.email.trim() || inviteTeamIds.length === 0) return;
    bulkInvite.mutate(
      {
        email: formData.email.trim(),
        role: formData.role,
        ...(formData.displayName.trim() && { displayName: formData.displayName.trim() }),
        teamIds: inviteTeamIds,
      },
      {
        onError: (err) =>
          toast({
            title: t('common.saveFailed'),
            description: err instanceof Error ? err.message : undefined,
            variant: 'destructive' as any,
          }),
        onSuccess: (r) => {
          invalidate();
          setOpen(false);
          setFormData({ email: '', displayName: '', role: TeamMemberInputRole.assistant });
          const skippedExisting = r.skipped.filter((s) => s.reason === 'already_member').length;
          toast({
            title: t('staff.invitedTo').replace('{n}', String(r.invited.length)),
            ...(skippedExisting > 0 && {
              description: t('staff.skippedExisting').replace('{n}', String(skippedExisting)),
            }),
          });
        },
      },
    );
  };

  const handleRoleChange = (memberId: number, role: TeamMemberInputRole) => {
    updateMember.mutate(
      { teamId: activeTeamId!, memberId, data: { role } },
      { onSuccess: invalidate },
    );
  };

  const handleRemove = (memberId: number) => setRemoveId(memberId);
  const confirmRemove = () => {
    if (removeId === null) return;
    removeMember.mutate({ teamId: activeTeamId!, memberId: removeId }, { onSuccess: invalidate });
    setRemoveId(null);
  };

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">{t('staff.title')}</h2>

          {isOwner && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="w-4 h-4" /> {t('staff.invite')}</Button>
              </DialogTrigger>
              <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('staff.invite')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('staff.email')}</Label>
                    <Input
                      type="email"
                      required
                      dir="ltr"
                      placeholder={t('staff.emailPlaceholder')}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('staff.nameOptional')}</Label>
                    <Input
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('staff.role')}</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(v) => setFormData({ ...formData, role: v as TeamMemberInputRole })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{t(`staff.role.${role}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(myTeams ?? []).length > 1 && (
                    <div className="space-y-2">
                      <Label>{t('staff.inviteTeams')}</Label>
                      <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5 max-h-36 overflow-y-auto">
                        {(myTeams ?? []).map((team) => (
                          <label key={team.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={inviteTeamIds.includes(team.id)}
                              onCheckedChange={(checked) =>
                                setInviteTeamIds((prev) =>
                                  checked ? [...prev, team.id] : prev.filter((id) => id !== team.id),
                                )
                              }
                            />
                            <span className="truncate">{team.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t('staff.inviteTeamsHint')}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{t('staff.inviteHint')}</p>
                  <Button type="submit" className="w-full" disabled={bulkInvite.isPending || inviteTeamIds.length === 0}>
                    {t('staff.invite')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!members || members.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('staff.empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => {
              const isMe = member.userId === user?.id;
              const pending = member.status === 'pending';
              return (
                <div
                  key={member.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-mono font-bold text-xs shrink-0" dir="ltr">
                    {member.role === 'owner' ? <Crown className="w-4 h-4" /> : ROLE_BADGES[member.role] ?? '·'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">
                        {member.displayName || member.email}
                      </p>
                      {member.role === 'owner' && <Crown className="w-3.5 h-3.5 text-primary shrink-0" />}
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground shrink-0">
                          {t('staff.you')}
                        </span>
                      )}
                    </div>
                    {member.email && member.displayName && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1" dir="ltr">
                        <Mail className="w-3 h-3 shrink-0" />{member.email}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {t(`staff.role.${member.role}`)}
                      </span>
                      {pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">
                          {t('staff.status.pending')}
                        </span>
                      )}
                    </div>
                  </div>

                  {isOwner && member.role !== 'owner' && (
                    <DropdownMenu dir={isRtl ? 'rtl' : 'ltr'}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ASSIGNABLE_ROLES.filter((role) => role !== member.role).map((role) => (
                          <DropdownMenuItem key={role} onClick={() => handleRoleChange(member.id, role)}>
                            {t('staff.changeRole')}: {t(`staff.role.${role}`)}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleRemove(member.id)}
                        >
                          <Trash2 className="w-4 h-4 me-2" />{t('staff.remove')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <ConfirmDialog
          open={removeId !== null}
          title={t('staff.removeConfirm')}
          onConfirm={confirmRemove}
          onOpenChange={(o) => !o && setRemoveId(null)}
        />
      </div>
    </AppLayout>
  );
}

export default Staff;
