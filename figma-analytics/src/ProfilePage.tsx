import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAppStore } from "./store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { 
  ArrowLeft, 
  Users, 
  UserPlus, 
  Trash2, 
  Copy, 
  Check, 
  LogOut,
  Mail,
  Calendar,
  Loader2,
  Palette,
  Pencil,
  X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Team {
  id: string;
  name: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  member_user_id: string;
  role: "owner" | "member";
  joined_at: string;
  email?: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  status: string;
  token?: string;
  created_at: string;
  expires_at: string;
}

interface CreatedInvite {
  email: string;
  link: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const {
    loading,
    user,
    team,
    teamMembers,
    teamInvitations,
    isOwner,
    showCreateTeam,
    showInviteForm,
    teamName,
    inviteEmails,
    creatingTeam,
    inviting,
    inviteError,
    createdInvites,
    copiedLink,
    setLoading,
    setUser,
    setTeam,
    setTeamMembers,
    setTeamInvitations,
    setIsOwner,
    openCreateTeam,
    closeCreateTeam,
    openInviteForm,
    closeInviteForm,
    setTeamName,
    setInviteEmails,
    setCreatingTeam,
    setInviting,
    setInviteError,
    setCreatedInvites,
    setCopiedLink,
    resetTeam,
  } = useAppStore();

  useEffect(() => {
    loadUserData();
  }, []);

  const [memberToRemoveId, setMemberToRemoveId] = useState<string | null>(null);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [editTeamNameValue, setEditTeamNameValue] = useState("");
  const [isSavingTeamName, setIsSavingTeamName] = useState(false);
  const [isDeleteTeamDialogOpen, setIsDeleteTeamDialogOpen] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        await loadTeamData(user.id);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamData = async (userId: string) => {
    try {
      // Current schema: team_members has only user_id (no member_user_id)
      const { data: row, error } = await supabase
        .from("team_members")
        .select("team_id, role, teams(*)")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !row) return;

      // RLS on teams can block the join for members — then teams(*) is null; fetch team by id
      let teamData: Team | null = (row.teams as Team) || null;
      if (!teamData && row.team_id) {
        const { data: t, error: te } = await supabase
          .from("teams")
          .select("id, name, created_at")
          .eq("id", row.team_id)
          .single();
        if (!te && t) teamData = t as Team;
      }

      if (teamData) {
        setTeam(teamData);
        setIsOwner(row.role === "owner");
        await loadTeamMembers(teamData.id);
        if (row.role === "owner") {
          await loadTeamInvitations(teamData.id);
        }
      }
    } catch (error) {
      console.error("Error loading team data:", error);
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_team_members_safe", {
        p_team_id: teamId,
      });

      if (error) {
        console.error("Error loading team members:", error);
        const { data: fallbackData, error: fallbackError } = await supabase.rpc("get_team_members_with_emails", {
          p_team_id: teamId,
        });
        if (!fallbackError && fallbackData) {
          setTeamMembers((fallbackData || []) as TeamMember[]);
        }
        return;
      }

      setTeamMembers((data || []) as TeamMember[]);
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  };

  const loadTeamInvitations = async (teamId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_team_invitations", {
        p_team_id: teamId,
      });

      if (error) {
        console.error("Error loading invitations:", error);
        return;
      }

      setTeamInvitations(data || []);
    } catch (error) {
      console.error("Error loading invitations:", error);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setCreatingTeam(true);
    try {
      const { error } = await supabase.rpc("create_team_and_migrate_resources", {
        p_team_name: teamName.trim(),
      });

      if (error) {
        alert(`Ошибка создания команды: ${error.message}`);
        return;
      }

      await loadUserData();
      closeCreateTeam();
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleInviteMembers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmails.trim()) return;

    setInviting(true);
    setInviteError(null);

    try {
      const emails = inviteEmails
        .split(/[,\n\r]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0 && email.includes("@"));

      if (emails.length === 0) {
        setInviteError("Введите хотя бы один корректный email адрес");
        return;
      }

      const existingMembers = teamMembers.map((m) => m.email?.toLowerCase());
      const newEmails = emails.filter(
        (email) => !existingMembers.includes(email.toLowerCase())
      );

      if (newEmails.length === 0) {
        setInviteError("Все указанные пользователи уже в команде");
        return;
      }

      const invitations = newEmails.map((email) => ({
        team_id: team?.id,
        email: email.toLowerCase(),
        invited_by: user.id,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from("team_invitations")
        .insert(invitations)
        .select("email, token");

      if (insertError) {
        setInviteError(`Ошибка создания приглашений: ${insertError.message}`);
        return;
      }

      const baseUrl = window.location.origin;
      const inviteLinks: CreatedInvite[] = (insertedData || []).map((inv: { email: string; token: string }) => ({
        email: inv.email,
        link: `${baseUrl}/invite/${inv.token}`,
      }));

      setCreatedInvites(inviteLinks);
      await loadTeamInvitations(team?.id || "");
      setInviteEmails("");
    } catch (error: any) {
      setInviteError(`Ошибка: ${error.message}`);
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(identifier);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const getInviteLink = (token: string) => {
    return `${window.location.origin}/invite/${token}`;
  };

  const openRemoveMemberDialog = (memberUserId: string) => {
    setMemberToRemoveId(memberUserId);
    setIsRemoveDialogOpen(true);
  };

  const startEditTeamName = () => {
    if (team) {
      setEditTeamNameValue(team.name);
      setIsEditingTeamName(true);
    }
  };

  const cancelEditTeamName = () => {
    setIsEditingTeamName(false);
    setEditTeamNameValue("");
  };

  const handleSaveTeamName = async () => {
    if (!team || !editTeamNameValue.trim()) return;
    setIsSavingTeamName(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ name: editTeamNameValue.trim() })
        .eq("id", team.id);

      if (error) {
        alert(`Ошибка обновления названия: ${error.message}`);
        return;
      }
      setTeam({ ...team, name: editTeamNameValue.trim() });
      setIsEditingTeamName(false);
      setEditTeamNameValue("");
    } catch (err: unknown) {
      alert(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingTeamName(false);
    }
  };

  const handleConfirmDeleteTeam = async () => {
    if (!team) return;
    setIsDeletingTeam(true);
    try {
      // Проверяем прототипы команды перед удалением
      // Если есть прототипы с user_id=NULL, устанавливаем user_id на created_by команды
      // Это предотвращает нарушение CHECK constraint prototypes_ownership_check при удалении команды
      const { data: prototypesData, error: prototypesCheckErr } = await supabase
        .from("prototypes")
        .select("id, user_id, team_id")
        .eq("team_id", team.id);

      if (prototypesCheckErr) {
        alert(`Ошибка при проверке прототипов: ${prototypesCheckErr.message}`);
        return;
      }

      if (prototypesData && prototypesData.length > 0) {
        const prototypesWithoutUser = prototypesData.filter(p => p.user_id === null);
        
        if (prototypesWithoutUser.length > 0) {
          // Получаем created_by команды
          const { data: teamData, error: teamDataErr } = await supabase
            .from("teams")
            .select("created_by")
            .eq("id", team.id)
            .single();

          if (teamDataErr) {
            alert(`Ошибка при получении данных команды: ${teamDataErr.message}`);
            return;
          }

          if (teamData && teamData.created_by) {
            // Устанавливаем user_id для прототипов без владельца
            const prototypeIds = prototypesWithoutUser.map(p => p.id);
            const { error: updatePrototypesErr } = await supabase
              .from("prototypes")
              .update({ user_id: teamData.created_by })
              .in("id", prototypeIds);

            if (updatePrototypesErr) {
              alert(`Ошибка при обновлении прототипов: ${updatePrototypesErr.message}`);
              return;
            }
          }
        }
      }

      const { error: invErr } = await supabase
        .from("team_invitations")
        .delete()
        .eq("team_id", team.id);
      if (invErr) {
        alert(`Ошибка при удалении приглашений: ${invErr.message}`);
        return;
      }
      const { error: memErr } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", team.id);
      if (memErr) {
        alert(`Ошибка при удалении участников: ${memErr.message}`);
        return;
      }
      const { error: teamErr } = await supabase
        .from("teams")
        .delete()
        .eq("id", team.id);
      if (teamErr) {
        alert(`Ошибка при удалении команды: ${teamErr.message}`);
        return;
      }
      resetTeam();
      setIsDeleteTeamDialogOpen(false);
    } catch (err: unknown) {
      alert(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeletingTeam(false);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemoveId) return;
    
    try {
      const { error } = await supabase.rpc("remove_team_member", {
        p_team_id: team?.id,
        p_user_id: memberToRemoveId,
      });

      if (error) {
        alert(`Ошибка удаления участника: ${error.message}`);
        return;
      }

      await loadTeamMembers(team?.id || "");
      setIsRemoveDialogOpen(false);
      setMemberToRemoveId(null);
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    } finally {
      // keep dialog closed on any outcome
      setIsRemoveDialogOpen(false);
      setMemberToRemoveId(null);
    }
  };

  const handleDeleteInvitation = async (invitationId: string, email: string) => {
    if (!confirm(`Удалить приглашение для ${email}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("team_invitations")
        .delete()
        .eq("id", invitationId);

      if (error) {
        alert(`Ошибка удаления приглашения: ${error.message}`);
        return;
      }

      await loadTeamInvitations(team?.id || "");
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    } else {
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Профиль</h1>
      </div>

      {/* User Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            Информация
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{user?.email}</p>
        </CardContent>
      </Card>

      {/* Theme Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            Тема оформления
          </CardTitle>
          <CardDescription>
            Выберите светлую, темную тему или используйте системные настройки
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      {/* Team Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Команда
          </CardTitle>
          {team && (
            <CardDescription>
              <Calendar className="inline h-3 w-3 mr-1" />
              Создана: {new Date(team.created_at).toLocaleDateString("ru-RU")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!team ? (
            <div>
              {!showCreateTeam ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    У вас еще нет команды. Создайте команду, чтобы начать совместную работу.
                  </p>
                  <Button onClick={openCreateTeam}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Создать команду
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="teamName">Название команды</Label>
                    <Input
                      id="teamName"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      required
                      disabled={creatingTeam}
                      placeholder="Введите название команды"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={creatingTeam || !teamName.trim()}>
                      {creatingTeam && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {creatingTeam ? "Создание..." : "Создать"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeCreateTeam}
                      disabled={creatingTeam}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                {isOwner && isEditingTeamName ? (
                  <>
                    <Input
                      value={editTeamNameValue}
                      onChange={(e) => setEditTeamNameValue(e.target.value)}
                      disabled={isSavingTeamName}
                      className="max-w-xs"
                      placeholder="Название команды"
                    />
                    <Button
                      size="sm"
                      disabled={isSavingTeamName || !editTeamNameValue.trim()}
                      onClick={handleSaveTeamName}
                    >
                      {isSavingTeamName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSavingTeamName}
                      onClick={cancelEditTeamName}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium">{team.name}</h3>
                    {isOwner && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={startEditTeamName}
                          title="Редактировать название"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Badge>Владелец</Badge>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Team Members — видны всем участникам команды */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Участники команды</h4>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    В команде пока нет других участников.
                  </p>
                ) : (
                  teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.email}</span>
                          {member.role === "owner" && <Badge variant="secondary">Владелец</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Присоединился: {new Date(member.joined_at).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                      {isOwner && member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openRemoveMemberDialog(member.member_user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {isOwner && (
                <>
                  {/* Invite Form */}
                  {createdInvites.length > 0 ? (
                    <Card className="border-success/30 bg-success/5">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center gap-2 text-success">
                          <Check className="h-5 w-5" />
                          <span className="font-medium">Приглашения созданы!</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Скопируйте ссылки и отправьте их приглашённым участникам:
                        </p>
                        {createdInvites.map((invite) => (
                          <div key={invite.email} className="p-3 bg-background rounded-lg border space-y-2">
                            <p className="font-medium text-sm">{invite.email}</p>
                            <div className="flex gap-2">
                              <Input value={invite.link} readOnly className="text-xs bg-muted" />
                              <Button
                                size="sm"
                                variant={copiedLink === invite.email ? "default" : "outline"}
                                onClick={() => copyToClipboard(invite.link, invite.email)}
                              >
                                {copiedLink === invite.email ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          onClick={() => { setCreatedInvites([]); closeInviteForm(); }}
                        >
                          Готово
                        </Button>
                      </CardContent>
                    </Card>
                  ) : !showInviteForm ? (
                    <Button onClick={openInviteForm}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Пригласить участников
                    </Button>
                  ) : (
                    <form onSubmit={handleInviteMembers} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="inviteEmails">Email адреса</Label>
                        <textarea
                          id="inviteEmails"
                          value={inviteEmails}
                          onChange={(e) => setInviteEmails(e.target.value)}
                          required
                          disabled={inviting}
                          rows={3}
                          className="w-full px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="user1@example.com, user2@example.com"
                        />
                        <p className="text-xs text-muted-foreground">
                          Можно указать несколько email адресов через запятую
                        </p>
                      </div>
                      {inviteError && (
                        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
                          {inviteError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button type="submit" disabled={inviting || !inviteEmails.trim()}>
                          {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {inviting ? "Создание..." : "Создать приглашения"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={closeInviteForm}
                          disabled={inviting}
                        >
                          Отмена
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Active Invitations */}
                  {teamInvitations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Активные приглашения</h4>
                      {teamInvitations.map((invitation) => (
                        <div key={invitation.id} className="flex items-start justify-between p-3 rounded-lg border">
                          <div>
                            <p className="font-medium text-sm">{invitation.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Истекает: {new Date(invitation.expires_at).toLocaleDateString("ru-RU")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {invitation.token && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(getInviteLink(invitation.token!), invitation.id)}
                              >
                                {copiedLink === invitation.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteInvitation(invitation.id, invitation.email)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Удаление команды — только владелец */}
                  <div className="pt-4 border-t">
                    <Button
                      variant="destructive"
                      onClick={() => setIsDeleteTeamDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить команду
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Все участники будут исключены из команды, приглашения отменены. Действие необратимо.
                    </p>
                  </div>
                </>
              )}

              {!isOwner && (
                <div className="p-4 bg-primary/5 rounded-lg">
                  <p className="text-sm text-primary">
                    Вы участник этой команды. Вы можете просматривать и редактировать тесты команды.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove member confirmation dialog */}
      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить участника из команды</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить этого участника из команды?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setIsRemoveDialogOpen(false);
                setMemberToRemoveId(null);
              }}
            >
              Отменить
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmRemoveMember}
              disabled={!memberToRemoveId}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete team confirmation dialog */}
      <Dialog open={isDeleteTeamDialogOpen} onOpenChange={setIsDeleteTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить команду</DialogTitle>
            <DialogDescription>
              Все участники будут исключены из команды, приглашения отменены. Исследования, привязанные к команде, могут остаться без команды. Это действие необратимо. Продолжить?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsDeleteTeamDialogOpen(false)}
              disabled={isDeletingTeam}
            >
              Отменить
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmDeleteTeam}
              disabled={isDeletingTeam}
            >
              {isDeletingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить команду"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Out */}
      <div className="pt-6 border-t">
        <Button variant="destructive" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Выйти
        </Button>
      </div>
    </div>
  );
}
