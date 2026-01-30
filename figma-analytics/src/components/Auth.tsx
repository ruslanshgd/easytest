import { supabase } from "../supabaseClient";
import { translateAuthError } from "../utils/errorMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { useAppStore } from "../store";

export default function Auth() {
  const {
    email,
    otpCode,
    step,
    authFormLoading,
    error,
    message,
    setEmail,
    setOtpCode,
    setStep,
    setAuthFormLoading,
    setError,
    setMessage,
    resetForm,
  } = useAppStore();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFormLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(translateAuthError(error));
        setAuthFormLoading(false);
        return;
      }

      setMessage("Код отправлен на вашу почту! Проверьте email.");
      setStep("code");
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFormLoading(true);
    setError(null);

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });

      if (error) {
        setError(translateAuthError(error));
        setAuthFormLoading(false);
        return;
      }

      if (session) {
        setMessage("Успешный вход! Перенаправление...");
        window.location.reload();
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setOtpCode("");
    setError(null);
    setMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {step === "email" ? "Вход" : "Введите код"}
          </CardTitle>
          <CardDescription>
            {step === "email" 
              ? "Введите email для получения кода входа" 
              : `Код отправлен на ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-success/10 text-success px-4 py-3 rounded-lg mb-4 text-sm">
              {message}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={authFormLoading}
                    className="pl-10"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={authFormLoading || !email.trim()}
                className="w-full"
              >
                {authFormLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {authFormLoading ? "Отправка..." : "Отправить код"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Код из письма</Label>
                <Input
                  id="otp"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  disabled={authFormLoading}
                  maxLength={8}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="123456"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Button
                  type="submit"
                  disabled={authFormLoading || otpCode.length < 6}
                  className="w-full"
                >
                  {authFormLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {authFormLoading ? "Проверка..." : "Войти"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToEmail}
                  disabled={authFormLoading}
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Изменить email
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
