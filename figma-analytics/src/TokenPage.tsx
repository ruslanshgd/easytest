import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Copy, Check, Key, Home, LogIn } from "lucide-react";

export default function TokenPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
      } else {
        setToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const copyToClipboard = async () => {
    if (token) {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <CardTitle>Требуется авторизация</CardTitle>
            <CardDescription>
              Для получения access token необходимо авторизоваться.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.href = "/"}>
              <LogIn className="h-4 w-4 mr-2" />
              Перейти к авторизации
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 text-primary" />
            <CardTitle>Access Token</CardTitle>
          </div>
          <CardDescription>
            Скопируйте этот токен и вставьте его в настройки плагина Figma для привязки прототипов к вашему аккаунту.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg border font-mono text-xs break-all max-h-32 overflow-y-auto">
            {token}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Скопировано!" : "Копировать токен"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => window.location.href = "/"}>
              <Home className="h-4 w-4 mr-2" />
              Перейти к аналитике
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
