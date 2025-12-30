import { useState } from "react";
import { supabase } from "../supabaseClient";
import { translateAuthError } from "../utils/errorMessages";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true, // Автоматически создавать пользователя при первом входе
        },
      });

      if (error) {
        setError(translateAuthError(error));
        setLoading(false);
        return;
      }

      setMessage("Код отправлен на вашу почту! Проверьте email.");
      setStep("code");
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
        setLoading(false);
        return;
      }

      if (session) {
        setMessage("Успешный вход! Перенаправление...");
        // Сессия будет обработана в App.tsx через onAuthStateChange
        window.location.reload(); // Перезагружаем страницу для применения авторизации
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setOtpCode("");
    setError(null);
    setMessage(null);
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
    }}>
      <div style={{
        backgroundColor: "white",
        padding: "2rem",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        width: "100%",
        maxWidth: "400px",
      }}>
        <h2 style={{ marginTop: 0, marginBottom: "1.5rem", textAlign: "center" }}>
          {step === "email" ? "Вход" : "Введите код"}
        </h2>

        {error && (
          <div style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            backgroundColor: "#fee",
            color: "#c33",
            borderRadius: "4px",
            fontSize: "0.9rem",
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            backgroundColor: "#efe",
            color: "#3c3",
            borderRadius: "4px",
            fontSize: "0.9rem",
          }}>
            {message}
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendOTP}>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: loading ? "#ccc" : "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "500",
              }}
            >
              {loading ? "Отправка..." : "Отправить код"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP}>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="otp" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
                Код из письма
              </label>
              <input
                id="otp"
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                required
                disabled={loading}
                maxLength={8}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "1.5rem",
                  textAlign: "center",
                  letterSpacing: "0.5rem",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
                placeholder="12345678"
                autoFocus
              />
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#666" }}>
                Код отправлен на {email}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: loading ? "#ccc" : "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "500",
                marginBottom: "0.5rem",
              }}
            >
              {loading ? "Проверка..." : "Войти"}
            </button>
            <button
              type="button"
              onClick={handleBackToEmail}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.5rem",
                backgroundColor: "transparent",
                color: "#007bff",
                border: "1px solid #007bff",
                borderRadius: "4px",
                fontSize: "0.9rem",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Изменить email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

