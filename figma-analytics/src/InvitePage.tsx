import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Home } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const location = useLocation();
  // Token может содержать "/" и "=" (base64), поэтому используем splat вместо :token
  const token = params["*"] ?? location.pathname.replace(/^\/invite\/?/, "");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      handleAcceptInvitation();
    }
  }, [token]);

  const handleAcceptInvitation = async () => {
    if (!token) {
      setError("Токен приглашения не найден");
      setLoading(false);
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/", { state: { inviteToken: token } });
        return;
      }

      const { data: invitation, error: invitationError } = await supabase
        .from("team_invitations")
        .select("*, teams(name)")
        .eq("token", token)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .single();

      if (invitationError || !invitation) {
        setError("Приглашение не найдено или истекло");
        setLoading(false);
        return;
      }

      if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
        setError("Это приглашение предназначено для другого email адреса");
        setLoading(false);
        return;
      }

      setTeamName((invitation.teams as any)?.name || "команда");

      const { error: acceptError } = await supabase.rpc("accept_team_invitation", {
        p_token: token,
      });

      if (acceptError) {
        setError(acceptError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Произошла ошибка");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Обработка приглашения...</h2>
            <p className="text-muted-foreground">Пожалуйста, подождите</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md border-destructive/30">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Ошибка</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")}>
              <Home className="h-4 w-4 mr-2" />
              Вернуться на главную
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md border-success/30">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
            <CardTitle className="text-success">Успешно!</CardTitle>
            <CardDescription>
              Вы успешно присоединились к команде <strong>{teamName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Перенаправление на главную страницу...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
