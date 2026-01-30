import * as React from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/supabaseClient";

export interface PrototypeItem {
  id: string;
  task_description: string | null;
}

export interface PrototypeSelectProps {
  value: string;
  onChange: (id: string) => void;
  prototypes: PrototypeItem[];
  disabled?: boolean;
  onPrototypeDeleted?: (id: string) => void;
  /** Optional: when used in block editor, pass trigger className to match block UI */
  triggerClassName?: string;
}

const PLACEHOLDER = "Выберите прототип";

function getLabel(p: PrototypeItem): string {
  return p.task_description?.trim() || p.id.substring(0, 8);
}

export function PrototypeSelect({
  value,
  onChange,
  prototypes,
  disabled = false,
  onPrototypeDeleted,
  triggerClassName,
}: PrototypeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string;
    label: string;
  } | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const selected = prototypes.find((p) => p.id === value);
  const displayLabel = selected ? getLabel(selected) : PLACEHOLDER;

  const handleDeleteClick = (e: React.MouseEvent, p: PrototypeItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setDeleteTarget({ id: p.id, label: getLabel(p) });
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteError(null);
    setDeleting(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await supabase
        .from("study_blocks")
        .update({ prototype_id: null })
        .eq("prototype_id", deleteTarget.id);
      const { error } = await supabase
        .from("prototypes")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) {
        setDeleteError(error.message || "Ошибка удаления прототипа.");
        setDeleting(false);
        return;
      }
      closeDeleteDialog();
      setOpen(false);
      onPrototypeDeleted?.(deleteTarget.id);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Неожиданная ошибка при удалении."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm hover:bg-accent/50",
              !value && "text-muted-foreground",
              triggerClassName
            )}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
          {prototypes.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={(e) => {
                e.preventDefault();
                onChange(p.id);
                setOpen(false);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate flex-1">{getLabel(p)}</span>
              <button
                type="button"
                aria-label="Удалить прототип"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={(e) => handleDeleteClick(e, p)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить прототип</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleteTarget && (
                  <p>
                    Удалить прототип «{deleteTarget.label}»? Он будет удалён из базы. При
                    необходимости загрузите его снова через плагин Figma.
                  </p>
                )}
                {deleteError && (
                  <p className="text-destructive font-medium">{deleteError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={closeDeleteDialog}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
