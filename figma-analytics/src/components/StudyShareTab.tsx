import { useState } from "react";

interface StudyShareTabProps {
  studyId: string;
  studyStatus: "draft" | "published" | "stopped";
  shareToken: string | null;
  loading?: boolean;
  onRetry?: () => void;
}

export default function StudyShareTab({ studyId, studyStatus, shareToken, loading = false, onRetry }: StudyShareTabProps) {
  const [copied, setCopied] = useState(false);

  const getShareUrl = (): string => {
    if (!shareToken) return "";
    // Viewer находится на другом порту
    const currentPort = window.location.port;
    const viewerPort = currentPort === "5174" ? "5173" : currentPort === "5173" ? "5174" : currentPort;
    const baseUrl = `${window.location.protocol}//${window.location.hostname}:${viewerPort}`;
    return `${baseUrl}/run/${shareToken}`;
  };

  const handleCopy = async () => {
    const url = getShareUrl();
    if (!url) return;
    
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const getStatusInfo = () => {
    switch (studyStatus) {
      case "draft":
        return {
          title: "Режим предпросмотра",
          description: "Тест в режиме черновика. Ссылка работает для предпросмотра и тестирования с командой. После публикации ссылка станет рабочей для респондентов.",
          color: "#ff9800",
          icon: "🔧"
        };
      case "published":
        return {
          title: "Тест опубликован",
          description: "Ссылка активна и доступна для прохождения респондентами. Редактирование блоков заблокировано.",
          color: "#4caf50",
          icon: "✅"
        };
      case "stopped":
        return {
          title: "Тестирование остановлено",
          description: "Ссылка больше не работает. Новые прохождения невозможны. Результаты доступны для просмотра.",
          color: "#f44336",
          icon: "⛔"
        };
    }
  };

  const statusInfo = getStatusInfo();
  const shareUrl = getShareUrl();

  if (loading) {
    return (
      <div style={{ padding: "20px 0" }}>
        <div style={{
          padding: 20,
          background: "#f5f5f5",
          borderRadius: 8,
          textAlign: "center"
        }}>
          Загрузка токена...
        </div>
      </div>
    );
  }

  if (!shareToken) {
    return (
      <div style={{ padding: "20px 0" }}>
        <div style={{
          padding: 20,
          background: "#fff3e0",
          color: "#e65100",
          borderRadius: 8,
          textAlign: "center"
        }}>
          <div style={{ marginBottom: 12 }}>Ошибка: токен для ссылки не найден.</div>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: "8px 16px",
                background: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "bold"
              }}
            >
              Попробовать снова
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 0" }}>
      {/* Статус */}
      <div style={{
        padding: 20,
        background: `${statusInfo.color}15`,
        borderLeft: `4px solid ${statusInfo.color}`,
        borderRadius: "0 8px 8px 0",
        marginBottom: 24
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{statusInfo.icon}</span>
          <h3 style={{ margin: 0, fontSize: 18, color: statusInfo.color }}>{statusInfo.title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#666" }}>{statusInfo.description}</p>
      </div>

      {/* Ссылка */}
      <div style={{
        padding: 20,
        background: "#f5f5f5",
        borderRadius: 8,
        marginBottom: 24
      }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>Ссылка для прохождения</h3>
        
        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "stretch"
        }}>
          <div style={{
            flex: 1,
            padding: "12px 16px",
            background: studyStatus === "stopped" ? "#eee" : "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 14,
            wordBreak: "break-all",
            color: studyStatus === "stopped" ? "#999" : "#333",
            textDecoration: studyStatus === "stopped" ? "line-through" : "none"
          }}>
            {shareUrl}
          </div>
          
          {studyStatus !== "stopped" && (
            <button
              onClick={handleCopy}
              style={{
                padding: "12px 24px",
                background: copied ? "#4caf50" : "#2196f3",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "bold",
                whiteSpace: "nowrap",
                transition: "background 0.2s"
              }}
            >
              {copied ? "✓ Скопировано" : "Копировать"}
            </button>
          )}
        </div>

        {studyStatus === "draft" && (
          <p style={{ margin: "12px 0 0 0", fontSize: 13, color: "#666" }}>
            💡 Отправьте эту ссылку коллегам для проверки теста перед публикацией.
          </p>
        )}

        {studyStatus === "published" && (
          <p style={{ margin: "12px 0 0 0", fontSize: 13, color: "#666" }}>
            📤 Отправьте эту ссылку респондентам для прохождения теста.
          </p>
        )}
      </div>

      {/* Подсказки по статусам */}
      <div style={{
        padding: 16,
        background: "#e3f2fd",
        borderRadius: 8,
        fontSize: 13,
        color: "#1565c0"
      }}>
        <strong style={{ display: "block", marginBottom: 8 }}>Как это работает:</strong>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>Черновик</strong> — редактируйте блоки, тестируйте с командой</li>
          <li><strong>Опубликован</strong> — респонденты проходят тест, блоки нельзя менять</li>
          <li><strong>Остановлен</strong> — тестирование завершено, только просмотр результатов</li>
        </ul>
      </div>
    </div>
  );
}
