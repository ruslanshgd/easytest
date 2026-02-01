import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, Lightbulb } from "lucide-react";

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
    const currentPort = window.location.port;
    const viewerPort = currentPort === "5174" ? "5173" : currentPort === "5173" ? "5174" : currentPort;
    const baseUrl = `${window.location.protocol}//${window.location.hostname}:${viewerPort}`.replace(/\/+$/, "");
    const token = String(shareToken).trim().replace(/^\/+/, "");
    return `${baseUrl}/run/${token}`;
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

  const getStatusLabel = (): string => {
    switch (studyStatus) {
      case "draft":
        return "Не опубликован";
      case "published":
        return "Опубликован";
      case "stopped":
        return "Остановлен";
    }
  };

  const shareUrl = getShareUrl();

  if (loading) {
    return (
      <div className="py-6">
        <Card className="p-6">
          <p className="text-muted-foreground text-center">Загрузка токена...</p>
        </Card>
      </div>
    );
  }

  if (!shareToken) {
    return (
      <div className="py-6">
        <Card className="p-6 border-destructive/30 bg-destructive/5">
          <p className="text-destructive mb-4">Ошибка: токен для ссылки не найден.</p>
          {onRetry && (
            <Button onClick={onRetry} variant="default">
              Попробовать снова
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Статус: 32px жирно */}
      <h1 className="text-[32px] font-semibold leading-tight text-foreground text-center">
        {getStatusLabel()}
      </h1>

      {/* Подзаголовок: 20px обычное */}
      <p className="text-xl font-normal text-foreground text-center">
        Давайте пригласим респондентов
      </p>

      {/* Карточка по стилю отчёт/тест */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-2">Поделиться по ссылке</h2>
        <p className="text-[15px] text-muted-foreground mb-4">
          Используйте ссылку, чтобы пригласить своих пользователей:
        </p>
        <div className="flex gap-3 items-stretch">
          <Input
            readOnly
            value={shareUrl}
            className="flex-1 font-mono text-sm"
          />
          <Button
            onClick={handleCopy}
            className="h-11 shrink-0 gap-2"
          >
            <Link className="h-4 w-4" />
            {copied ? "Скопировано" : "Копировать ссылку"}
          </Button>
        </div>

        {(studyStatus === "draft" || studyStatus === "stopped") && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-[15px] text-muted-foreground">
            <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              {studyStatus === "stopped"
                ? "Тест остановлен. Редактируйте блоки при необходимости и снова опубликуйте — ссылка станет активной для респондентов."
                : "Отправьте эту ссылку коллегам для проверки теста перед публикацией."}
            </span>
          </div>
        )}
      </Card>

      {/* Как это работает */}
      <div>
        <p className="font-semibold text-sm mb-2">Как это работает:</p>
        <ul className="space-y-1 text-sm text-muted-foreground list-none pl-0 m-0">
          <li><strong className="text-foreground">Черновик</strong> — редактируйте блоки, тестируйте с командой</li>
          <li><strong className="text-foreground">Опубликован</strong> — респонденты проходят тест, блоки нельзя менять</li>
          <li><strong className="text-foreground">Остановлен</strong> — редактирование снова доступно, можно изменить тест и снова опубликовать</li>
        </ul>
      </div>
    </div>
  );
}
