import { useEffect, useCallback, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import TestView from "./TestView.tsx";
import { useViewerStore } from "./store";
import { ArrowRight, ChevronLeft, Trash2 } from "lucide-react";

// ============= Компонент модального окна для изображений =============
interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  showNavigation?: boolean;
  showSelectButton?: boolean;
  onSelect?: () => void;
}

function ImageModal({ imageUrl, onClose, onNext, onPrev, showNavigation = false, showSelectButton = false, onSelect }: ImageModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, onNext, onPrev]);

  const modalOverlayStyles: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.95)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  };

  const modalContentStyles: React.CSSProperties = {
    position: "relative",
    maxWidth: "90vw",
    maxHeight: "90vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const navButtonStyles: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(255, 255, 255, 0.2)",
    border: "none",
    borderRadius: "50%",
    width: 48,
    height: 48,
    color: "white",
    fontSize: 24,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10001
  };

  const imageStyles: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "90vh",
    objectFit: "contain",
    borderRadius: 8
  };

  return (
    <div
      style={modalOverlayStyles}
      onClick={onClose}
    >
      <div
        style={modalContentStyles}
        onClick={(e) => e.stopPropagation()}
      >
        {showNavigation && onPrev && (
          <button
            onClick={onPrev}
            style={{ ...navButtonStyles, left: -60 }}
          >
            ‹
          </button>
        )}
        <img
          src={imageUrl}
          alt=""
          style={imageStyles}
        />
        {showNavigation && onNext && (
          <button
            onClick={onNext}
            style={{ ...navButtonStyles, right: -60 }}
          >
            ›
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: -50,
            right: 0,
            background: "rgba(255, 255, 255, 0.2)",
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            color: "white",
            fontSize: 24,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          ×
        </button>
        {showSelectButton && onSelect && (
          <button
            onClick={onSelect}
            style={{
              position: "absolute",
              bottom: -60,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "12px 24px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Выбрать этот вариант
          </button>
        )}
      </div>
    </div>
  );
}

// Кнопка «Показать задание» — фиксирована слева внизу, открывает сайдбар с инструкцией
const SHOW_TASK_TRIGGER_BOTTOM_PX = 80;
const SHOW_TASK_LABEL_DURATION_MS = 3000;

interface ShowTaskTriggerProps {
  onClick: () => void;
  showLabel: boolean;
}

function ShowTaskTrigger({ onClick, showLabel }: ShowTaskTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "fixed",
        left: 0,
        bottom: SHOW_TASK_TRIGGER_BOTTOM_PX,
        zIndex: 99,
        height: 48,
        paddingLeft: 6,
        paddingRight: 12,
        paddingTop: 4,
        paddingBottom: 4,
        border: "none",
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        background: "rgba(30, 30, 30, 0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "white",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        transition: "opacity 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
    >
      <ChevronLeft size={24} style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: 15,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          maxWidth: showLabel ? 180 : 0,
          opacity: showLabel ? 1 : 0,
          transform: showLabel ? "translateX(0)" : "translateX(-10px)",
          transition: "max-width 0.25s, opacity 0.2s, transform 0.2s",
        }}
      >
        Показать задание
      </span>
    </button>
  );
}

// Все типы блоков
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds" | "card_sorting" | "tree_testing" | "first_click" | "matrix" | "agreement";

// StudyData interface removed - not used in code

// ============= Компонент "Открытый вопрос" =============
interface OpenQuestionBlockProps {
  question: string;
  optional?: boolean;
  imageUrl?: string;
  onSubmit: (answer: string, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function OpenQuestionBlock({ question, optional, imageUrl, onSubmit }: OpenQuestionBlockProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());

  const handleSubmit = async () => {
    if (submitting) return;
    if (!answer.trim() && !optional) return;
    
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    
    try {
      await onSubmit(answer.trim(), durationMs);
    } catch (err) {
      console.error("Error submitting answer:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
      <div style={{ maxWidth: "600px", width: "100%" }}>
        <h2 style={{ margin: "0 0 24px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{question || "Вопрос"}</h2>
        <textarea 
          value={answer} 
          onChange={(e) => setAnswer(e.target.value)} 
          placeholder="Введите текст ответа" 
          style={{ 
            width: "100%", 
            minHeight: "120px", 
            padding: "12px", 
            border: "1px solid #ddd", 
            borderRadius: "8px", 
            fontSize: "16px", 
            fontFamily: "inherit", 
            resize: "vertical", 
            boxSizing: "border-box", 
            marginBottom: "20px" 
          }} 
        />
        <button 
          onClick={handleSubmit} 
          disabled={(!answer.trim() && !optional) || submitting} 
          style={{ 
            padding: "12px 24px", 
            background: (answer.trim() || optional) && !submitting ? "#007AFF" : "#ccc", 
            color: "white", 
            border: "none", 
            borderRadius: "8px", 
            fontSize: "16px", 
            fontWeight: 600, 
            cursor: (answer.trim() || optional) && !submitting ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: 8
          }}
        >
          {submitting ? "Сохранение..." : "Далее"}
          {!submitting && <ArrowRight size={18} />}
        </button>
      </div>
    </div>
  );
}

// ============= Компонент "Выбор" =============
interface ChoiceBlockProps {
  config: {
    question: string;
    description?: string;
    options: string[];
    allowMultiple?: boolean;
    maxSelections?: number;
    shuffle?: boolean;
    allowOther?: boolean;
    allowNone?: boolean;
    noneText?: string;
    optional?: boolean;
    imageUrl?: string;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function ChoiceBlock({ config, onSubmit, onSkip }: ChoiceBlockProps) {
  const [shuffledOptions] = useState(() => {
    const opts = [...config.options];
    if (config.shuffle) {
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
    }
    return opts;
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [noneSelected, setNoneSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [showImageModal, setShowImageModal] = useState(false);

  const handleSelect = (option: string) => {
    if (noneSelected) return;
    if (config.allowMultiple) {
      if (selected.includes(option)) {
        setSelected(selected.filter(s => s !== option));
      } else {
        if (config.maxSelections && selected.length >= config.maxSelections) return;
        setSelected([...selected, option]);
      }
    } else {
      setSelected([option]);
      setShowOther(false);
    }
  };

  const handleOther = () => {
    if (noneSelected) return;
    if (config.allowMultiple) {
      setShowOther(!showOther);
      if (showOther) setOtherText("");
    } else {
      setSelected([]);
      setShowOther(true);
    }
  };

  const handleNone = () => {
    setNoneSelected(!noneSelected);
    if (!noneSelected) {
      setSelected([]);
      setShowOther(false);
      setOtherText("");
    }
  };

  const handleSubmit = async () => {
    const hasAnswer = selected.length > 0 || (showOther && otherText.trim()) || noneSelected;
    if (!hasAnswer && !config.optional) return;

    setSubmitting(true);
    const durationMs = Date.now() - startTime;

    try {
      await onSubmit({
        selected,
        other: showOther && otherText.trim() ? otherText.trim() : undefined,
        none: noneSelected
      }, durationMs);
    } catch (err) {
      console.error("Error submitting choice:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // handleSkip removed - onSkip is not used

  const hasAnswer = selected.length > 0 || (showOther && otherText.trim()) || noneSelected;

  return (
    <>
      {showImageModal && config.imageUrl && (
        <ImageModal imageUrl={config.imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "900px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          {config.imageUrl && (
            <div style={{ marginBottom: 24, borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setShowImageModal(true)}>
              <img src={config.imageUrl} alt="" style={{ width: "100%", maxHeight: 500, objectFit: "contain", background: "#f5f5f5" }} />
              <div style={{ textAlign: "center", marginTop: 8, color: "#666", fontSize: 13 }}>Нажмите для увеличения</div>
            </div>
          )}
        <h2 style={{ margin: "0 0 12px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{config.question}</h2>
        {config.description && <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "14px" }}>{config.description}</p>}
        {config.allowMultiple && config.maxSelections && (
          <p style={{ margin: "0 0 16px 0", color: "#999", fontSize: "13px" }}>Выберите до {config.maxSelections} вариантов</p>
        )}
        
        <div style={{ marginBottom: 20 }}>
          {shuffledOptions.map((option, i) => (
            <button key={typeof option === 'string' ? option : `option-${i}-${(option as any).id || (option as any).value || i}`} onClick={() => handleSelect(option)} disabled={noneSelected} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", marginBottom: 8, border: selected.includes(option) ? "2px solid #007AFF" : "1px solid #ddd", borderRadius: 8, background: selected.includes(option) ? "#e3f2fd" : "white", cursor: noneSelected ? "not-allowed" : "pointer", textAlign: "left", fontSize: 15, opacity: noneSelected ? 0.5 : 1 }}>
              <span style={{ width: 24, height: 24, borderRadius: config.allowMultiple ? 4 : 12, border: selected.includes(option) ? "2px solid #007AFF" : "2px solid #ccc", marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center", background: selected.includes(option) ? "#007AFF" : "white" }}>
                {selected.includes(option) && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
              </span>
              {option}
            </button>
          ))}
          
          {config.allowOther && (
            <button onClick={handleOther} disabled={noneSelected} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", marginBottom: 8, border: showOther && !config.allowMultiple ? "2px solid #007AFF" : "1px solid #ddd", borderRadius: 8, background: showOther && !config.allowMultiple ? "#e3f2fd" : "white", cursor: noneSelected ? "not-allowed" : "pointer", textAlign: "left", fontSize: 15, opacity: noneSelected ? 0.5 : 1 }}>
              <span style={{ width: 24, height: 24, borderRadius: config.allowMultiple ? 4 : 12, border: (showOther && !config.allowMultiple) ? "2px solid #007AFF" : "2px solid #ccc", marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center", background: (showOther && !config.allowMultiple) ? "#007AFF" : "white" }}>
                {(showOther && !config.allowMultiple) && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
              </span>
              Другое
            </button>
          )}
          
          {showOther && (
            <input type="text" value={otherText} onChange={e => setOtherText(e.target.value)} placeholder="Введите свой вариант" style={{ width: "100%", padding: "12px 16px", marginBottom: 8, border: "1px solid #ddd", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} autoFocus />
          )}
          
          {config.allowNone && (
            <button onClick={handleNone} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", marginTop: 16, border: noneSelected ? "2px solid #007AFF" : "1px solid #ddd", borderRadius: 8, background: noneSelected ? "#e3f2fd" : "white", cursor: "pointer", textAlign: "left", fontSize: 15 }}>
              <span style={{ width: 24, height: 24, borderRadius: config.allowMultiple ? 4 : 12, border: noneSelected ? "2px solid #007AFF" : "2px solid #ccc", marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center", background: noneSelected ? "#007AFF" : "white" }}>
                {noneSelected && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
              </span>
              {config.noneText || "Ничего из вышеперечисленного"}
            </button>
          )}
        </div>
        
        {config.allowMultiple && (
          <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#666" }}>
            Вы можете выбрать несколько вариантов ответа
          </p>
        )}
        
        <div style={{ display: "flex", gap: 12 }}>
          <button 
            onClick={handleSubmit} 
            disabled={(!hasAnswer && !config.optional) || submitting} 
            style={{ 
              padding: "12px 24px", 
              background: (hasAnswer || config.optional) && !submitting ? "#007AFF" : "#ccc", 
              color: "white", 
              border: "none", 
              borderRadius: "8px", 
              fontSize: "16px", 
              fontWeight: 600, 
              cursor: (hasAnswer || config.optional) && !submitting ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 8
            }}
          >
            {submitting ? "Сохранение..." : "Далее"}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ============= Компонент "Контекст" =============
interface ContextBlockProps {
  config: { title: string; description?: string; };
  onNext: () => void;
}

function ContextBlock({ config, onNext }: ContextBlockProps) {
  return (
    <div
      className="context-block-wrapper"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        padding: "var(--space-4)",
      }}
    >
      <div
        className="context-block-content"
        style={{
          maxWidth: "var(--context-block-max-width)",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-context-title)",
            fontWeight: "var(--text-context-title-weight)",
            color: "var(--color-foreground, #333)",
          }}
        >
          {config.title}
        </h2>
        {config.description && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-context-desc)",
              fontWeight: "var(--text-context-desc-weight)",
              color: "var(--color-muted-foreground, #666)",
              lineHeight: 1.6,
            }}
          >
            {config.description}
          </p>
        )}
        <button
          type="button"
          onClick={onNext}
          style={{
            width: "auto",
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            background: "var(--color-primary, #007AFF)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Далее
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ============= Компонент "Шкала" =============
interface ScaleBlockProps {
  config: {
    question: string;
    description?: string;
    scaleType: "numeric" | "emoji" | "stars";
    min?: number;
    max?: number;
    minLabel?: string;
    maxLabel?: string;
    emojiCount?: 3 | 5;
    optional?: boolean;
    imageUrl?: string;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function ScaleBlock({ config, onSubmit, onSkip }: ScaleBlockProps) {
  const [value, setValue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [showImageModal, setShowImageModal] = useState(false);

  const handleSubmit = async () => {
    if (value === null && !config.optional) return;
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    try {
      await onSubmit({ value, scaleType: config.scaleType }, durationMs);
    } catch (err) {
      console.error("Error submitting scale:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // handleSkip removed - onSkip is not used

  const renderNumeric = () => {
    const min = config.min ?? 1;
    const max = config.max ?? 5;
    const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const hasLabels = (config.minLabel?.trim() || config.maxLabel?.trim());

    return (
      <div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {values.map(v => (
            <button key={v} onClick={() => setValue(v)} style={{ width: 44, height: 44, borderRadius: 8, border: value === v ? "2px solid #007AFF" : "1px solid #ddd", background: value === v ? "#007AFF" : "white", color: value === v ? "white" : "#333", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>{v}</button>
          ))}
        </div>
        {hasLabels && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "#999" }}>{config.minLabel?.trim() || ""}</span>
            <span style={{ fontSize: 13, color: "#999" }}>{config.maxLabel?.trim() || ""}</span>
          </div>
        )}
      </div>
    );
  };

  const renderEmoji = () => {
    const emojis3 = ["😞", "😐", "😊"];
    const emojis5 = ["😠", "😞", "😐", "😊", "😄"];
    const emojis = config.emojiCount === 3 ? emojis3 : emojis5;
    const hasLabels = (config.minLabel?.trim() || config.maxLabel?.trim());
    return (
      <div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {emojis.map((emoji, i) => (
            <button key={`emoji-${i}-${emoji}`} onClick={() => setValue(i + 1)} style={{ width: 56, height: 56, borderRadius: 12, border: value === i + 1 ? "3px solid #007AFF" : "1px solid #ddd", background: value === i + 1 ? "#e3f2fd" : "white", fontSize: 28, cursor: "pointer", transition: "transform 0.2s", transform: value === i + 1 ? "scale(1.1)" : "scale(1)" }}>{emoji}</button>
          ))}
        </div>
        {hasLabels && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "#999" }}>{config.minLabel?.trim() || ""}</span>
            <span style={{ fontSize: 13, color: "#999" }}>{config.maxLabel?.trim() || ""}</span>
          </div>
        )}
      </div>
    );
  };

  const renderStars = () => {
    const hasLabels = (config.minLabel?.trim() || config.maxLabel?.trim());
    return (
      <div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} onClick={() => setValue(star)} style={{ background: "none", border: "none", fontSize: 36, cursor: "pointer", color: value !== null && star <= value ? "#ffc107" : "#ddd", transition: "transform 0.2s", transform: value !== null && star <= value ? "scale(1.1)" : "scale(1)" }}>★</button>
          ))}
        </div>
        {hasLabels && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "#999" }}>{config.minLabel?.trim() || ""}</span>
            <span style={{ fontSize: 13, color: "#999" }}>{config.maxLabel?.trim() || ""}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {showImageModal && config.imageUrl && (
        <ImageModal imageUrl={config.imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "600px", width: "100%" }}>
          {config.imageUrl && (
            <div style={{ marginBottom: 24, borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setShowImageModal(true)}>
              <img src={config.imageUrl} alt="" style={{ width: "100%", maxHeight: 500, objectFit: "contain", background: "#f5f5f5" }} />
              <div style={{ textAlign: "center", marginTop: 8, color: "#666", fontSize: 13 }}>Нажмите для увеличения</div>
            </div>
          )}
          <h2 style={{ margin: "0 0 12px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{config.question}</h2>
          {config.description && <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "14px" }}>{config.description}</p>}
          
          <div style={{ marginBottom: 24 }}>
            {config.scaleType === "numeric" && renderNumeric()}
            {config.scaleType === "emoji" && renderEmoji()}
            {config.scaleType === "stars" && renderStars()}
          </div>
          
          <button onClick={handleSubmit} disabled={(value === null && !config.optional) || submitting} style={{ padding: "12px 24px", background: (value !== null || config.optional) && !submitting ? "#007AFF" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: (value !== null || config.optional) && !submitting ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {submitting ? "Сохранение..." : "Далее"}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}

// ============= Компонент "Предпочтение" =============
interface PreferenceBlockProps {
  config: {
    question: string;
    comparisonType: "all" | "pairwise";
    images: string[];
    shuffle?: boolean;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
}

function PreferenceBlock({ config, onSubmit }: PreferenceBlockProps) {
  const [shuffledImages] = useState(() => {
    const imgs = config.images.map((url, i) => ({ url, originalIndex: i }));
    if (config.shuffle && config.comparisonType === "all") {
      for (let i = imgs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      }
    }
    return imgs;
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [pairIndex, setPairIndex] = useState(0);
  const [pairResults, setPairResults] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [modalImageIndex, setModalImageIndex] = useState<number | null>(null);
  const [modalPairIndex, setModalPairIndex] = useState<number | null>(null);

  // Для попарного сравнения - генерируем все пары
  const pairs = config.comparisonType === "pairwise" ? 
    config.images.flatMap((_, i) => config.images.slice(i + 1).map((_, j) => [i, i + j + 1])) : [];

  const handleSelectAll = async (index: number) => {
    setSelected(index);
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    try {
      await onSubmit({ selectedIndex: shuffledImages[index].originalIndex, type: "all" }, durationMs);
    } catch (err) {
      console.error("Error submitting preference:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPair = async (winner: number) => {
    const newResults = [...pairResults, winner];
    setPairResults(newResults);
    
    if (pairIndex < pairs.length - 1) {
      setPairIndex(pairIndex + 1);
    } else {
      // Все пары сравнены
      setSubmitting(true);
      const durationMs = Date.now() - startTime;
      // Подсчитываем победы
      const wins: { [key: number]: number } = {};
      newResults.forEach((winner) => {
        wins[winner] = (wins[winner] || 0) + 1;
      });
      try {
        await onSubmit({ pairResults: newResults, wins, type: "pairwise" }, durationMs);
      } catch (err) {
        console.error("Error submitting preference:", err);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleOpenModal = (imageIndex: number, pairIdx: number) => {
    setModalImageIndex(imageIndex);
    setModalPairIndex(pairIdx);
  };

  const handleModalNext = () => {
    if (modalPairIndex === null || modalImageIndex === null) return;
    const [a, b] = pairs[modalPairIndex];
    // Переключаемся только между двумя вариантами текущей пары
    if (modalImageIndex === a) {
      setModalImageIndex(b);
    } else {
      setModalImageIndex(a);
    }
  };

  const handleModalPrev = () => {
    if (modalPairIndex === null || modalImageIndex === null) return;
    const [a, b] = pairs[modalPairIndex];
    // Переключаемся только между двумя вариантами текущей пары
    if (modalImageIndex === b) {
      setModalImageIndex(a);
    } else {
      setModalImageIndex(b);
    }
  };

  const handleModalSelect = () => {
    if (modalImageIndex === null || modalPairIndex === null) return;
    handleSelectPair(modalImageIndex);
    setModalImageIndex(null);
    setModalPairIndex(null);
  };

  if (config.comparisonType === "pairwise" && pairs.length > 0) {
    const [a, b] = pairs[pairIndex];
    return (
      <>
        {modalImageIndex !== null && modalPairIndex !== null && (
          <ImageModal
            imageUrl={config.images[modalImageIndex]}
            onClose={() => {
              setModalImageIndex(null);
              setModalPairIndex(null);
            }}
            onNext={handleModalNext}
            onPrev={handleModalPrev}
            showNavigation={true}
            showSelectButton={true}
            onSelect={handleModalSelect}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{config.question}</h2>
            <p style={{ margin: 0, color: "#999", fontSize: "13px" }}>Сравнение {pairIndex + 1} из {pairs.length} • Нажмите на вариант для увеличения и выбора</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1 }}>
            <button onClick={() => handleOpenModal(a, pairIndex)} disabled={submitting} style={{ padding: 0, border: "2px solid #ddd", borderRadius: 12, overflow: "hidden", cursor: submitting ? "not-allowed" : "pointer", background: "white", transition: "transform 0.2s, box-shadow 0.2s", display: "flex", flexDirection: "column" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
              <img src={config.images[a]} alt={`Вариант ${a + 1}`} style={{ width: "100%", flex: 1, minHeight: 0, objectFit: "contain", background: "#fafafa" }} />
              <div style={{ padding: 16, fontWeight: 500, fontSize: 16, textAlign: "center", borderTop: "1px solid #eee" }}>Вариант {String.fromCharCode(65 + a)}</div>
            </button>
            <button onClick={() => handleOpenModal(b, pairIndex)} disabled={submitting} style={{ padding: 0, border: "2px solid #ddd", borderRadius: 12, overflow: "hidden", cursor: submitting ? "not-allowed" : "pointer", background: "white", transition: "transform 0.2s, box-shadow 0.2s", display: "flex", flexDirection: "column" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
              <img src={config.images[b]} alt={`Вариант ${b + 1}`} style={{ width: "100%", flex: 1, minHeight: 0, objectFit: "contain", background: "#fafafa" }} />
              <div style={{ padding: 16, fontWeight: 500, fontSize: 16, textAlign: "center", borderTop: "1px solid #eee" }}>Вариант {String.fromCharCode(65 + b)}</div>
            </button>
          </div>
        </div>
      </>
    );
  }

  const [modalImageIndexAll, setModalImageIndexAll] = useState<number | null>(null);

  const handleOpenModalAll = (index: number) => {
    setModalImageIndexAll(index);
  };

  const handleModalNextAll = () => {
    if (modalImageIndexAll === null) return;
    const next = (modalImageIndexAll + 1) % shuffledImages.length;
    setModalImageIndexAll(next);
  };

  const handleModalPrevAll = () => {
    if (modalImageIndexAll === null) return;
    const prev = modalImageIndexAll <= 0 ? shuffledImages.length - 1 : modalImageIndexAll - 1;
    setModalImageIndexAll(prev);
  };

  const handleModalSelectAll = () => {
    if (modalImageIndexAll === null) return;
    handleSelectAll(modalImageIndexAll);
    setModalImageIndexAll(null);
  };

  return (
    <>
      {modalImageIndexAll !== null && (
        <ImageModal
          imageUrl={shuffledImages[modalImageIndexAll].url}
          onClose={() => setModalImageIndexAll(null)}
          onNext={handleModalNextAll}
          onPrev={handleModalPrevAll}
          showNavigation={true}
          showSelectButton={true}
          onSelect={handleModalSelectAll}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "1200px", width: "100%" }}>
          <h2 style={{ margin: "0 0 24px 0", fontSize: "24px", fontWeight: 600, color: "#333", textAlign: "center" }}>{config.question}</h2>
          <p style={{ margin: "0 0 24px 0", color: "#999", fontSize: "14px", textAlign: "center" }}>Нажмите на вариант для увеличения и выбора</p>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shuffledImages.length, 4)}, 1fr)`, gap: 20 }}>
            {shuffledImages.map((img, i) => (
              <button key={`preference-${i}-${img.url || i}`} onClick={() => handleOpenModalAll(i)} disabled={submitting} style={{ padding: 0, border: selected === i ? "3px solid #007AFF" : "2px solid #ddd", borderRadius: 12, overflow: "hidden", cursor: submitting ? "not-allowed" : "pointer", background: selected === i ? "#e3f2fd" : "white", transition: "all 0.2s" }}>
                <img src={img.url} alt={`Вариант ${i + 1}`} style={{ width: "100%", height: 250, objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='250'%3E%3Crect fill='%23f0f0f0' width='200' height='250'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНет изображения%3C/text%3E%3C/svg%3E"; }} />
                <div style={{ padding: 16, fontWeight: 500, fontSize: 15, textAlign: "center" }}>Вариант {String.fromCharCode(65 + i)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ============= Компонент "5 секунд" =============
interface FiveSecondsBlockProps {
  config: {
    instruction: string;
    duration: number;
    imageUrl: string;
  };
  onComplete: () => void;
}

function FiveSecondsBlock({ config, onComplete }: FiveSecondsBlockProps) {
  const [phase, setPhase] = useState<"instruction" | "viewing" | "done">("instruction");
  const [timeLeft, setTimeLeft] = useState(config.duration);

  const startViewing = () => {
    setPhase("viewing");
  };

  useEffect(() => {
    if (phase !== "viewing") return;
    
    if (timeLeft <= 0) {
      setPhase("done");
      onComplete();
      return;
    }
    
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, timeLeft, onComplete]);

  if (phase === "instruction") {
    return (
      <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: "#f5f5f7" }}>
        <aside
          style={{
            width: "320px",
            minWidth: "320px",
            background: "white",
            boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>⏱️</div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#333" }}>Тест на {config.duration} секунд</h2>
          <p style={{ margin: 0, color: "#666", fontSize: "15px", lineHeight: 1.6, flex: 1 }}>{config.instruction}</p>
          <p style={{ margin: 0, color: "#999", fontSize: "14px", lineHeight: 1.5 }}>Изображение будет показано на {config.duration} секунд. Постарайтесь запомнить как можно больше деталей.</p>
          <button
            onClick={startViewing}
            style={{
              padding: "14px 24px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Показать изображение
          </button>
        </aside>
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a1a1a",
          }}
        >
          <img
            src={config.imageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "blur(20px)",
              transform: "scale(1.05)",
              opacity: 0.6,
            }}
            onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНе удалось загрузить изображение%3C/text%3E%3C/svg%3E"; }}
          />
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", pointerEvents: "none" }} />
        </div>
      </div>
    );
  }

  if (phase === "viewing") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 0, background: "#f5f5f7" }}>
        <img src={config.imageUrl} alt="Test image" style={{ width: "100%", height: "100vh", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНе удалось загрузить изображение%3C/text%3E%3C/svg%3E"; }} />
      </div>
    );
  }

  return null;
}

// ============= Тест первого клика =============
interface FirstClickBlockProps {
  config: { instruction: string; imageUrl: string };
  onSubmit: (answer: { x: number; y: number }, durationMs: number) => Promise<void>;
}

function FirstClickBlock({ config, onSubmit }: FirstClickBlockProps) {
  const [phase, setPhase] = useState<"instruction" | "clicking">("instruction");
  const [showImageAt, setShowImageAt] = useState<number | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
  const [showLabelOnTrigger, setShowLabelOnTrigger] = useState(false);
  const labelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleShowImage = () => {
    setPhase("clicking");
    setShowImageAt(Date.now());
  };

  const handleHideSidebarFromOverlay = () => {
    setShowSidebarOverlay(false);
    setShowLabelOnTrigger(true);
    if (labelTimeoutRef.current) clearTimeout(labelTimeoutRef.current);
    labelTimeoutRef.current = setTimeout(() => {
      setShowLabelOnTrigger(false);
      labelTimeoutRef.current = null;
    }, SHOW_TASK_LABEL_DURATION_MS) as ReturnType<typeof setTimeout>;
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (submitting || phase !== "clicking") return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPending({ x, y });
  };

  const handleConfirm = async () => {
    if (!pending || !showImageAt || submitting) return;
    setSubmitting(true);
    const durationMs = Date.now() - showImageAt;
    try {
      await onSubmit(pending, durationMs);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPending(null);
  };

  useEffect(() => () => {
    if (labelTimeoutRef.current) clearTimeout(labelTimeoutRef.current);
  }, []);

  const renderSidebarWithBlurredImage = (buttonLabel: string, onButtonClick: () => void) => (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: "#f5f5f7" }}>
      <aside
        style={{
          width: "320px",
          minWidth: "320px",
          background: "white",
          boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          zIndex: 2,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#333" }}>Тест первого клика</h2>
        <p style={{ margin: 0, color: "#666", fontSize: "15px", lineHeight: 1.6, flex: 1 }}>{config.instruction}</p>
        <button
          onClick={onButtonClick}
          style={{
            padding: "14px 24px",
            background: "var(--color-primary, #007AFF)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          {buttonLabel}
        </button>
      </aside>
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a",
        }}
      >
        <img
          src={config.imageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: "blur(20px)",
            transform: "scale(1.05)",
            opacity: 0.6,
          }}
          onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНе удалось загрузить%3C/text%3E%3C/svg%3E"; }}
        />
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", pointerEvents: "none" }} />
      </div>
    </div>
  );

  if (phase === "instruction") {
    return renderSidebarWithBlurredImage("Показать изображение", handleShowImage);
  }

  if (phase === "clicking" && showSidebarOverlay) {
    return renderSidebarWithBlurredImage("Показать изображение", handleHideSidebarFromOverlay);
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
          <img
            src={config.imageUrl}
            alt=""
            onClick={handleImageClick}
            style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", cursor: "crosshair", borderRadius: "8px", border: "1px solid #e0e0e0", display: "block" }}
            onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНе удалось загрузить%3C/text%3E%3C/svg%3E"; }}
          />
          {pending && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: `${pending.x * 100}%`,
                  top: `${pending.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "2px solid white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${pending.x * 100}%`,
                  top: `${pending.y * 100}%`,
                  transform: "translate(-50%, -100%)",
                  display: "flex",
                  gap: 8,
                  marginTop: -8,
                  pointerEvents: "auto",
                }}
              >
                <button onClick={(e) => { e.stopPropagation(); handleConfirm(); }} disabled={submitting} style={{ padding: "8px 16px", background: "#22c55e", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>Подтвердить клик</button>
                <button onClick={(e) => { e.stopPropagation(); handleCancel(); }} disabled={submitting} style={{ padding: "8px 16px", background: "#6b7280", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>Отменить клик</button>
              </div>
            </>
          )}
        </div>
      </div>
      <ShowTaskTrigger onClick={() => setShowSidebarOverlay(true)} showLabel={showLabelOnTrigger} />
    </>
  );
}

// ============= Типы для Tree Testing =============
interface TreeTestingNode {
  id: string;
  name: string;
  children: TreeTestingNode[];
}

// ============= Компонент Tree Testing =============
interface TreeTestingBlockProps {
  config: {
    task: string;
    description?: string;
    tree: TreeTestingNode[];
    correctAnswers: string[];
    allowSkip: boolean;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function TreeTestingBlock({ config, onSubmit, onSkip }: TreeTestingBlockProps) {
  const [selectedPath, setSelectedPath] = useState<string[]>([]); // массив ID от корня до выбранного узла
  const [clickHistory, setClickHistory] = useState<{ id: string; name: string }[]>([]); // полная история кликов по узлам
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());

  // Найти узел по ID
  const findNode = (nodes: TreeTestingNode[], nodeId: string): TreeTestingNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children.length > 0) {
        const found = findNode(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  // Найти путь к узлу (массив ID от корня)
  const findPathToNode = (nodes: TreeTestingNode[], targetId: string, currentPath: string[] = []): string[] | null => {
    for (const node of nodes) {
      const newPath = [...currentPath, node.id];
      if (node.id === targetId) return newPath;
      if (node.children.length > 0) {
        const found = findPathToNode(node.children, targetId, newPath);
        if (found) return found;
      }
    }
    return null;
  };

  // Получить имена узлов по пути
  const getPathNames = (path: string[]): string[] => {
    return path.map(id => {
      const node = findNode(config.tree, id);
      return node?.name || "";
    }).filter(Boolean);
  };

  // Развернуть/свернуть узел
  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Выбрать узел — добавляем клик в историю
  const selectNode = (nodeId: string) => {
    const path = findPathToNode(config.tree, nodeId);
    if (path) {
      setSelectedPath(path);
      const node = findNode(config.tree, nodeId);
      if (node) {
        setClickHistory(prev => [...prev, { id: nodeId, name: node.name }]);
      }
      // Развернуть всех родителей
      const newExpanded = new Set(expandedNodes);
      path.forEach(id => newExpanded.add(id));
      setExpandedNodes(newExpanded);
    }
  };

  // Вычислить isDirect: путь должен быть минимальным (без лишних шагов) до правильного ответа
  const calculateIsDirect = (path: string[]): boolean => {
    if (path.length === 0) return false;
    
    const selectedNodeId = path[path.length - 1];
    if (!config.correctAnswers.includes(selectedNodeId)) return false;
    
    // Найти минимальный путь к правильному узлу
    const correctPath = findPathToNode(config.tree, selectedNodeId);
    if (!correctPath) return false;
    
    // isDirect = true, если выбранный путь совпадает с минимальным путем или является его подмножеством
    // (т.е. пользователь не делал лишних шагов)
    if (path.length <= correctPath.length) {
      // Проверяем, что путь совпадает с началом правильного пути
      for (let i = 0; i < path.length; i++) {
        if (path[i] !== correctPath[i]) return false;
      }
      return true;
    }
    
    return false;
  };

  // Отправить ответ
  const handleSubmit = async () => {
    if (selectedPath.length === 0) return;
    
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    const selectedNodeId = selectedPath[selectedPath.length - 1];
    const isCorrect = config.correctAnswers.includes(selectedNodeId);
    const isDirect = calculateIsDirect(selectedPath);
    
    try {
      await onSubmit({
        selectedNodeId,
        selectedPath,
        pathNames: getPathNames(selectedPath),
        clickHistory: clickHistory.map(c => c.id),
        clickHistoryNames: clickHistory.map(c => c.name),
        isCorrect,
        isDirect
      }, durationMs);
    } catch (err) {
      console.error("Error submitting tree testing:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Обработка "Не знаю"
  const handleDontKnow = async () => {
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    
    try {
      await onSubmit({
        selectedNodeId: null,
        selectedPath: [],
        pathNames: [],
        isCorrect: false,
        dontKnow: true,
        isUnsuccessful: true
      }, durationMs);
    } catch (err) {
      console.error("Error submitting 'don't know':", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Пропустить
  const handleSkip = async () => {
    if (!config.allowSkip || !onSkip) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  // Рендер узла дерева
  const renderTreeNode = (node: TreeTestingNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedPath.includes(node.id);
    const isLeafSelected = selectedPath[selectedPath.length - 1] === node.id;

    return (
      <div key={node.id}>
        <div
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(node.id);
            }
            selectNode(node.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            marginLeft: depth * 24,
            marginBottom: 4,
            background: isLeafSelected ? "#e3f2fd" : isSelected ? "#f5f5f5" : "white",
            border: isLeafSelected ? "2px solid #2196f3" : "1px solid #e0e0e0",
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          {/* Иконка развернуть/свернуть */}
          <span style={{ 
            width: 20, 
            height: 20, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "#666"
          }}>
            {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
          </span>
          
          {/* Название */}
          <span style={{ 
            flex: 1, 
            fontSize: 15, 
            fontWeight: isLeafSelected ? 600 : 400,
            color: isLeafSelected ? "#1976d2" : "#333"
          }}>
            {node.name}
          </span>

          {/* Индикатор выбора */}
          {isLeafSelected && (
            <span style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "#2196f3",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14
            }}>
              ✓
            </span>
          )}
        </div>

        {/* Дочерние узлы */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const hasSelection = selectedPath.length > 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      width: "100%",
      padding: "20px",
      background: "#f5f5f7"
    }}>
      <div style={{
        maxWidth: "800px",
        width: "100%"
      }}>
        {/* Заголовок */}
        <h2 style={{
          margin: "0 0 12px 0",
          fontSize: "24px",
          fontWeight: 600,
          color: "#333"
        }}>
          {config.task}
        </h2>

        {/* Описание */}
        {config.description && (
          <p style={{
            margin: "0 0 24px 0",
            color: "#666",
            fontSize: "15px",
            lineHeight: 1.5
          }}>
            {config.description}
          </p>
        )}

        {/* Инструкция */}
        <p style={{
          margin: "0 0 20px 0",
          color: "#999",
          fontSize: "13px"
        }}>
          Выберите категорию, которая лучше всего соответствует заданию. Нажмите на категорию чтобы раскрыть подкатегории.
        </p>

        {/* Дерево */}
        <div style={{
          marginBottom: 24,
          maxHeight: "50vh",
          overflowY: "auto",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 12
        }}>
          {config.tree.map(node => renderTreeNode(node))}
        </div>

        {/* Выбранный путь */}
        {hasSelection && (
          <div style={{
            marginBottom: 24,
            padding: "12px 16px",
            background: "#e8f5e9",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            <span style={{ color: "#2e7d32", fontWeight: 500 }}>Ваш выбор:</span>
            <span style={{ color: "#333" }}>
              {getPathNames(selectedPath).join(" › ")}
            </span>
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: "flex", gap: 12, flexDirection: "row", flexWrap: "wrap" }}>
          <button
              onClick={hasSelection ? handleSubmit : handleSkip}
              disabled={(!hasSelection && !config.allowSkip) || submitting}
              style={{
                padding: "14px 24px",
                background: (hasSelection || config.allowSkip) && !submitting ? "#007AFF" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: (hasSelection || config.allowSkip) && !submitting ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: 8
              }}
            >
              {submitting ? "Сохранение..." : "Выбрать"}
              {!submitting && <ArrowRight size={18} />}
            </button>
            <button
              onClick={handleDontKnow}
              disabled={submitting}
              style={{
                padding: "14px 24px",
                background: submitting ? "#ccc" : "#f5f5f5",
                color: "#666",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: submitting ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8
              }}
            >
              {submitting ? "Сохранение..." : "Не знаю"}
            </button>
        </div>
      </div>
    </div>
  );
}

// ============= Компонент UMUX Lite опрос =============
interface UmuxLiteBlockProps {
  onSubmit: (item1: number, item2: number, feedback: string, durationMs: number) => Promise<void>;
}

function UmuxLiteBlock({ onSubmit }: UmuxLiteBlockProps) {
  const [item1, setItem1] = useState<number | null>(null);
  const [item2, setItem2] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

  const handleSubmit = async () => {
    if (item1 === null || item2 === null) {
      setError("Пожалуйста, ответьте на оба вопроса");
      return;
    }
    setSubmitting(true);
    setError(null);
    const durationMs = Date.now() - startTime;
    try {
      await onSubmit(item1, item2, feedback.trim(), durationMs);
    } catch (err) {
      setError("Ошибка сохранения ответов");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f7", padding: 20 }}>
      <div style={{ background: "#ffffff", borderRadius: 12, padding: 32, maxWidth: 600, width: "100%", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <h2 style={{ marginTop: 0, marginBottom: 24, color: "#333", fontSize: 24 }}>📋 Оценка удобства использования</h2>
        <p style={{ marginBottom: 32, color: "#666", fontSize: 14 }}>Пожалуйста, оцените ваш опыт использования прототипа:</p>
        
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: "block", marginBottom: 12, fontSize: 14, fontWeight: 500, color: "#333" }}>1. Возможности этого прототипа полностью удовлетворяют моим потребностям.</label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#999" }}>Не согласен</span>
            <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                <button key={v} onClick={() => setItem1(v)} style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid", borderColor: item1 === v ? "#007AFF" : "#ddd", background: item1 === v ? "#007AFF" : "#fff", color: item1 === v ? "#fff" : "#333", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>{v}</button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#999" }}>Согласен</span>
          </div>
        </div>
        
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: "block", marginBottom: 12, fontSize: 14, fontWeight: 500, color: "#333" }}>2. Этот прототип было легко использовать.</label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#999" }}>Не согласен</span>
            <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                <button key={v} onClick={() => setItem2(v)} style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid", borderColor: item2 === v ? "#007AFF" : "#ddd", background: item2 === v ? "#007AFF" : "#fff", color: item2 === v ? "#fff" : "#333", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>{v}</button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#999" }}>Согласен</span>
          </div>
        </div>
        
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: "block", marginBottom: 12, fontSize: 14, fontWeight: 500, color: "#333" }}>3. Дополнительные комментарии (необязательно):</label>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Поделитесь своими мыслями..." style={{ width: "100%", minHeight: 100, padding: 12, border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        </div>
        
        {error && <div style={{ marginBottom: 16, padding: 12, background: "#ffebee", color: "#c62828", borderRadius: 8, fontSize: 14 }}>{error}</div>}
        
        <button onClick={handleSubmit} disabled={submitting || item1 === null || item2 === null} style={{ width: "100%", padding: "14px 24px", background: (submitting || item1 === null || item2 === null) ? "#ccc" : "#007AFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (submitting || item1 === null || item2 === null) ? "not-allowed" : "pointer" }}>
          {submitting ? "Отправка..." : "Отправить"}
        </button>
      </div>
    </div>
  );
}

// ============= Компонент "Сортировка карточек" =============
interface CardSortingCard {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

interface CardSortingCategory {
  id: string;
  name: string;
}

interface CardSortingBlockProps {
  config: {
    task: string;
    sortingType: "open" | "closed";
    cards: CardSortingCard[];
    categories: CardSortingCategory[];
    shuffleCards: boolean;
    shuffleCategories: boolean;
    allowPartialSort: boolean;
    showImages?: boolean;
    showDescriptions?: boolean;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
}

function CardSortingBlock({ config, onSubmit }: CardSortingBlockProps) {
  const [phase, setPhase] = useState<"intro" | "sorting">("intro");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Перемешиваем карточки и категории
  const [shuffledCards] = useState(() => {
    const cards = [...config.cards];
    if (config.shuffleCards) {
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
    }
    return cards;
  });
  
  const [shuffledCategories] = useState(() => {
    const cats = [...config.categories];
    if (config.shuffleCategories) {
      for (let i = cats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cats[i], cats[j]] = [cats[j], cats[i]];
      }
    }
    return cats;
  });
  
  // Карточки, которые ещё не отсортированы
  const [unsortedCards, setUnsortedCards] = useState<CardSortingCard[]>(shuffledCards);
  
  // Распределение карточек по категориям: { categoryId: [card, ...] }
  const [sortedCards, setSortedCards] = useState<Record<string, CardSortingCard[]>>({});
  
  // Пользовательские категории (для открытой сортировки)
  const [userCategories, setUserCategories] = useState<CardSortingCategory[]>([]);
  
  // Перетаскиваемая карточка
  const [draggingCard, setDraggingCard] = useState<CardSortingCard | null>(null);
  
  // Показать зону создания категории (подсветка при drag over)
  const [showCreateCategoryZone, setShowCreateCategoryZone] = useState(false);
  
  const allCategories = [...shuffledCategories, ...userCategories];
  const sortedCount = shuffledCards.length - unsortedCards.length;
  
  const handleStart = () => {
    setPhase("sorting");
    setStartTime(Date.now());
  };
  
  const handleDragStart = (e: React.DragEvent, card: CardSortingCard) => {
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingCard(card);
  };
  
  const handleDragEnd = () => {
    setDraggingCard(null);
    setShowCreateCategoryZone(false);
  };
  
  const handleDropOnCategory = (categoryId: string) => {
    if (!draggingCard) return;
    
    // Удаляем из несортированных
    setUnsortedCards(prev => prev.filter(c => c.id !== draggingCard.id));
    
    // Удаляем из других категорий если уже была отсортирована
    setSortedCards(prev => {
      const newSorted = { ...prev };
      Object.keys(newSorted).forEach(catId => {
        newSorted[catId] = newSorted[catId].filter(c => c.id !== draggingCard.id);
      });
      // Добавляем в новую категорию
      if (!newSorted[categoryId]) {
        newSorted[categoryId] = [];
      }
      newSorted[categoryId] = [...newSorted[categoryId], draggingCard];
      return newSorted;
    });
    
    setDraggingCard(null);
    setShowCreateCategoryZone(false);
  };
  
  const handleDropOnCreateCategory = () => {
    if (!draggingCard || config.sortingType === "closed") return;
    const newCat: CardSortingCategory = {
      id: crypto.randomUUID(),
      name: ""
    };
    setUserCategories(prev => [...prev, newCat]);
    setUnsortedCards(prev => prev.filter(c => c.id !== draggingCard.id));
    setSortedCards(prev => {
      const newSorted = { ...prev };
      Object.keys(newSorted).forEach(catId => {
        newSorted[catId] = newSorted[catId].filter(c => c.id !== draggingCard.id);
      });
      newSorted[newCat.id] = [draggingCard];
      return newSorted;
    });
    setDraggingCard(null);
    setShowCreateCategoryZone(false);
  };
  
  const handleUpdateCategoryName = (categoryId: string, newName: string) => {
    setUserCategories(prev => prev.map(c => c.id === categoryId ? { ...c, name: newName } : c));
  };
  
  const handleRemoveCategory = (categoryId: string) => {
    // Вернуть карточки обратно в несортированные
    const cardsToReturn = sortedCards[categoryId] || [];
    setUnsortedCards(prev => [...prev, ...cardsToReturn]);
    
    // Удалить категорию
    setUserCategories(prev => prev.filter(c => c.id !== categoryId));
    setSortedCards(prev => {
      const newSorted = { ...prev };
      delete newSorted[categoryId];
      return newSorted;
    });
  };
  
  const handleReturnCard = (card: CardSortingCard, fromCategoryId: string) => {
    setSortedCards(prev => {
      const newSorted = { ...prev };
      newSorted[fromCategoryId] = newSorted[fromCategoryId].filter(c => c.id !== card.id);
      return newSorted;
    });
    setUnsortedCards(prev => [...prev, card]);
  };
  
  const canSubmit = config.allowPartialSort || unsortedCards.length === 0;
  
  const handleSubmit = async () => {
    if (!canSubmit || !startTime) return;
    
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    
    // Формируем результат
    const result: Record<string, string[]> = {};
    allCategories.forEach(cat => {
      const cards = sortedCards[cat.id] || [];
      if (cards.length > 0) {
        result[cat.name] = cards.map(c => c.title);
      }
    });
    
    try {
      await onSubmit({
        categories: result,
        unsortedCount: unsortedCards.length,
        totalCards: shuffledCards.length,
        sortingType: config.sortingType,
        userCreatedCategories: userCategories.map(c => c.name)
      }, durationMs);
    } catch (err) {
      console.error("Error submitting card sorting:", err);
    } finally {
      setSubmitting(false);
    }
  };
  
  // Intro phase: левый сайдбар с заданием, справа затемнение
  if (phase === "intro") {
    return (
      <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: "#f5f5f7" }}>
        <aside style={{ width: 320, minWidth: 320, background: "white", boxShadow: "2px 0 12px rgba(0,0,0,0.08)", padding: 24, display: "flex", flexDirection: "column", gap: 20, zIndex: 2 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#333" }}>Сортировка карточки</h2>
          <p style={{ margin: 0, color: "#666", fontSize: 15, lineHeight: 1.6, flex: 1, whiteSpace: "pre-wrap" }}>{config.task || ""}</p>
          <p style={{ margin: 0, color: "#666", fontSize: 15, lineHeight: 1.6 }}>
            Отсортируйте каждую карточку в категорию, которая вам кажется наиболее подходящей, перетащите карточки в правую часть страницы, чтобы создать категории. Просто делайте то, что кажется вам наиболее подходящим, нет правильных или неправильных ответов.
          </p>
          <button
            onClick={handleStart}
            style={{
              padding: "14px 24px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Начать
          </button>
        </aside>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
        </div>
      </div>
    );
  }
  
  // Sorting phase: слева сайдбар (задание + карточки + прогресс + Готово), справа категории горизонтально
  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: "#f5f5f7" }}>
      {/* Left sidebar - task + cards list + progress + Готово */}
      <div style={{ width: 280, padding: "16px 20px 16px 16px", borderRight: "1px solid #e0e0e0", background: "white", display: "flex", flexDirection: "column", flexShrink: 0, minHeight: 0, overflowY: "auto" }}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: "#666", marginBottom: 12, whiteSpace: "pre-wrap" }}>{config.task}</p>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Карточки</div>
          <div style={{ fontSize: 13, color: "#999" }}>{sortedCount} из {shuffledCards.length}</div>
          <div style={{ marginTop: 8, height: 6, background: "#e0e0e0", borderRadius: 3 }}>
            <div style={{ height: "100%", background: "#007AFF", borderRadius: 3, width: `${shuffledCards.length ? (sortedCount / shuffledCards.length) * 100 : 0}%`, transition: "width 0.3s" }} />
          </div>
        </div>
        
        <div style={{ flex: 1, minHeight: 0 }}>
          {unsortedCards.map(card => (
            <div
              key={card.id}
              draggable
              onDragStart={e => handleDragStart(e, card)}
              onDragEnd={handleDragEnd}
              style={{
                padding: "12px 16px",
                background: "#f7f7f5",
                borderRadius: 8,
                marginBottom: 8,
                cursor: "grab",
                border: "1px solid #e5e5e3",
                transition: "box-shadow 0.2s"
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {config.showImages && card.imageUrl && card.imageUrl.trim() !== "" && (
                  <img src={card.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{card.title}</div>
                  {config.showDescriptions && card.description && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{card.description}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {unsortedCards.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 14 }}>
              Все карточки отсортированы
            </div>
          )}
        </div>
        
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "14px",
            background: canSubmit && !submitting ? "#007AFF" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed"
          }}
        >
          {submitting ? "Сохранение..." : "Готово"}
        </button>
      </div>
      
      {/* Right side - Categories horizontally */}
      <div style={{ flex: 1, minWidth: 0, padding: 20, overflowX: "auto", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "row", gap: 16, minHeight: "100%", alignItems: "flex-start" }}>
          {allCategories.map(cat => {
            const isUserCreated = userCategories.some(uc => uc.id === cat.id);
            const categoryCards = sortedCards[cat.id] || [];
            
            return (
              <div
                key={cat.id}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={() => handleDropOnCategory(cat.id)}
                style={{
                  background: "white",
                  borderRadius: 12,
                  border: draggingCard ? "2px dashed #007AFF" : "1px solid #e0e0e0",
                  minHeight: 200,
                  minWidth: 220,
                  flex: "1 1 220px",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  {isUserCreated ? (
                    <input
                      type="text"
                      value={cat.name}
                      onChange={e => handleUpdateCategoryName(cat.id, e.target.value)}
                      placeholder="Название категории"
                      draggable={false}
                      onDragStart={e => e.preventDefault()}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "6px 8px",
                        border: "1px solid #e0e0e0",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0 }}>{cat.name}</span>
                  )}
                  {isUserCreated && (
                    <button
                      onClick={() => handleRemoveCategory(cat.id)}
                      style={{ background: "none", border: "none", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
                      title="Удалить категорию"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {categoryCards.length === 0 ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
                      Перетащите сюда, чтобы добавить в категорию
                    </div>
                  ) : (
                    categoryCards.map(card => (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={e => handleDragStart(e, card)}
                        onDragEnd={handleDragEnd}
                        style={{
                          padding: "10px 12px",
                          background: "#f7f7f5",
                          borderRadius: 6,
                          fontSize: 13,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          cursor: "grab"
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0 }}>
                          {config.showImages && card.imageUrl && card.imageUrl.trim() !== "" && (
                            <img src={card.imageUrl} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleReturnCard(card, cat.id)}
                          onMouseDown={e => e.stopPropagation()}
                          style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 16, flexShrink: 0 }}
                          title="Вернуть карточку"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Create new category zone (only when dragging, open sorting) */}
          {config.sortingType === "open" && draggingCard !== null && (
            <div
              onDragOver={e => { 
                e.preventDefault(); 
                setShowCreateCategoryZone(true);
              }}
              onDragLeave={() => setShowCreateCategoryZone(false)}
              onDrop={handleDropOnCreateCategory}
              style={{
                background: showCreateCategoryZone ? "#e3f2fd" : "#fafafa",
                borderRadius: 12,
                border: showCreateCategoryZone ? "2px dashed #007AFF" : "2px dashed #ccc",
                minHeight: 200,
                minWidth: 220,
                flex: "1 1 220px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
            >
              <div style={{ textAlign: "center", color: showCreateCategoryZone ? "#007AFF" : "#999" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>+</div>
                <div style={{ fontSize: 13 }}>Перетащите сюда, чтобы создать новую категорию</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============= Компонент "Матрица" =============
interface MatrixRow {
  id: string;
  title: string;
}

interface MatrixColumn {
  id: string;
  title: string;
}

interface MatrixBlockProps {
  config: {
    question: string;
    description?: string;
    imageUrl?: string;
    rows: MatrixRow[];
    columns: MatrixColumn[];
    shuffleRows: boolean;
    shuffleColumns: boolean;
    allowMultiple: boolean;
    optional: boolean;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function MatrixBlock({ config, onSubmit, onSkip }: MatrixBlockProps) {
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [showImageModal, setShowImageModal] = useState(false);
  
  // Перемешиваем строки и столбцы
  const [shuffledRows] = useState(() => {
    const rows = [...config.rows];
    if (config.shuffleRows) {
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
    }
    return rows;
  });
  
  const [shuffledColumns] = useState(() => {
    const cols = [...config.columns];
    if (config.shuffleColumns) {
      for (let i = cols.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cols[i], cols[j]] = [cols[j], cols[i]];
      }
    }
    return cols;
  });
  
  // Состояние выбранных значений: { rowId: [columnId1, columnId2, ...] }
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  
  const handleCellClick = (rowId: string, columnId: string) => {
    setSelections(prev => {
      const rowSelections = prev[rowId] || [];
      
      if (config.allowMultiple) {
        // Множественный выбор - toggle
        if (rowSelections.includes(columnId)) {
          return {
            ...prev,
            [rowId]: rowSelections.filter(id => id !== columnId)
          };
        } else {
          return {
            ...prev,
            [rowId]: [...rowSelections, columnId]
          };
        }
      } else {
        // Одиночный выбор - замена
        return {
          ...prev,
          [rowId]: [columnId]
        };
      }
    });
  };
  
  const hasAnswer = Object.keys(selections).some(rowId => selections[rowId].length > 0);
  
  const handleSubmit = async () => {
    if (!hasAnswer && !config.optional) return;
    
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    
    try {
      await onSubmit({ selections }, durationMs);
    } catch (err) {
      console.error("Error submitting matrix:", err);
    } finally {
      setSubmitting(false);
    }
  };
  
  // handleSkip removed - onSkip is not used
  
  return (
    <>
      {showImageModal && config.imageUrl && (
        <ImageModal imageUrl={config.imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "900px", width: "100%" }}>
          {config.imageUrl && (
            <div style={{ marginBottom: 24, borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setShowImageModal(true)}>
              <img src={config.imageUrl} alt="" style={{ width: "100%", maxHeight: 500, objectFit: "contain", background: "#f5f5f5" }} />
              <div style={{ textAlign: "center", marginTop: 8, color: "#666", fontSize: 13 }}>Нажмите для увеличения</div>
            </div>
          )}
          <h2 style={{ margin: "0 0 12px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{config.question}</h2>
          {config.description && <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "14px" }}>{config.description}</p>}
          
          {/* Матрица */}
          <div style={{ marginBottom: 24, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={{ padding: "12px 16px", textAlign: "left", border: "1px solid #e0e0e0", background: "#f7f7f5", fontWeight: 600, fontSize: 14, color: "#333" }}></th>
                  {shuffledColumns.map(column => (
                    <th key={column.id} style={{ padding: "12px 16px", textAlign: "center", border: "1px solid #e0e0e0", background: "#f7f7f5", fontWeight: 600, fontSize: 14, color: "#333", minWidth: 120 }}>
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shuffledRows.map(row => (
                  <tr key={row.id}>
                    <td style={{ padding: "12px 16px", border: "1px solid #e0e0e0", background: "#fafafa", fontWeight: 500, fontSize: 14, color: "#333" }}>
                      {row.title}
                    </td>
                    {shuffledColumns.map(column => {
                      const isSelected = selections[row.id]?.includes(column.id) || false;
                      return (
                        <td 
                          key={column.id} 
                          style={{ 
                            padding: "12px 16px", 
                            border: "1px solid #e0e0e0", 
                            textAlign: "center",
                            cursor: "pointer",
                            background: isSelected ? "#e3f2fd" : "white",
                            transition: "background 0.2s"
                          }}
                          onClick={() => handleCellClick(row.id, column.id)}
                        >
                          <div style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            width: config.allowMultiple ? 20 : 24,
                            height: config.allowMultiple ? 20 : 24,
                            borderRadius: config.allowMultiple ? 4 : 12,
                            border: isSelected ? "2px solid #007AFF" : "2px solid #ccc",
                            background: isSelected ? "#007AFF" : "white",
                            transition: "all 0.2s"
                          }}>
                            {isSelected && (
                              <span style={{ color: "white", fontSize: 12 }}>✓</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={handleSubmit} disabled={(!hasAnswer && !config.optional) || submitting} style={{ padding: "12px 24px", background: (hasAnswer || config.optional) && !submitting ? "#007AFF" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: (hasAnswer || config.optional) && !submitting ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {submitting ? "Сохранение..." : "Далее"}
              {!submitting && <ArrowRight size={18} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============= Компонент "Соглашение" =============
interface AgreementBlockProps {
  config: {
    title: string;
    agreementType: "standard" | "custom";
    customPdfUrl?: string;
  };
  onSubmit: (answer: any, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function AgreementBlock({ config, onSubmit }: AgreementBlockProps) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  // Генерация стандартного текста соглашения (упрощенная версия для респондента)
  const getStandardAgreementText = (): string => {
    return `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Настоящим я даю свое согласие на обработку моих персональных данных в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ "О персональных данных".

1. ОПЕРАТОР ПЕРСОНАЛЬНЫХ ДАННЫХ
Оператором персональных данных является организация, проводящая исследование.

2. ЦЕЛИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ
Персональные данные обрабатываются в следующих целях:
- Проведение исследования и анализ результатов
- Улучшение качества продуктов и услуг
- Коммуникация с участниками исследования (при необходимости)

3. СОСТАВ ПЕРСОНАЛЬНЫХ ДАННЫХ
В рамках исследования могут собираться следующие данные:
- Ответы на вопросы исследования
- Данные о взаимодействии с интерфейсом (клики, время прохождения)
- Аудио- и видеозаписи (если применимо)
- Электронная почта и другие контактные данные (если предоставлены)

4. СПОСОБЫ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ
Обработка персональных данных осуществляется с использованием средств автоматизации и без использования таких средств, включая сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (распространение, предоставление, доступ), обезличивание, блокирование, удаление, уничтожение персональных данных.

5. СРОК ДЕЙСТВИЯ СОГЛАСИЯ
Согласие действует до достижения целей обработки персональных данных или до отзыва согласия субъектом персональных данных.

6. ПРАВА СУБЪЕКТА ПЕРСОНАЛЬНЫХ ДАННЫХ
Я понимаю, что в соответствии с Федеральным законом № 152-ФЗ "О персональных данных" имею право:
- Получать информацию, касающуюся обработки моих персональных данных
- Требовать уточнения, блокирования или уничтожения персональных данных
- Отозвать согласие на обработку персональных данных
- Обжаловать действия или бездействие оператора в уполномоченный орган по защите прав субъектов персональных данных или в судебном порядке

7. ОТЗЫВ СОГЛАСИЯ
Я понимаю, что могу отозвать свое согласие на обработку персональных данных, направив письменное уведомление оператору по адресу, указанному в контактной информации.

Настоящее согласие предоставляется мной добровольно и подтверждает, что я ознакомлен(а) с условиями обработки персональных данных.`;
  };

  const handleSubmit = async (acceptedValue: boolean) => {
    setSubmitting(true);
    setError(null);
    const durationMs = Date.now() - startTime;
    
    try {
      await onSubmit({ 
        accepted: acceptedValue, 
        acceptedAt: acceptedValue ? new Date().toISOString() : null
      }, durationMs);
    } catch (err) {
      // Правильно извлекаем сообщение об ошибке
      let errorMessage: string;
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        // Если ошибка от Supabase, она может быть объектом с полем message
        const errorObj = err as any;
        errorMessage = errorObj.message || errorObj.error?.message || String(err);
      } else {
        errorMessage = String(err);
      }
      
      console.error("Error submitting agreement:", {
        error: err,
        errorMessage,
        errorStack: err instanceof Error ? err.stack : undefined,
        errorString: JSON.stringify(err, Object.getOwnPropertyNames(err))
      });
      // Отображаем ошибку пользователю
      setError(errorMessage || "Ошибка сохранения согласия. Пожалуйста, попробуйте еще раз.");
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    await handleSubmit(false);
  };

  return (
    <>
      {showAgreementModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.95)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            overflowY: "auto"
          }}
          onClick={() => setShowAgreementModal(false)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              background: "white",
              borderRadius: 12,
              padding: 32,
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAgreementModal(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                fontSize: 24,
                cursor: "pointer",
                color: "#666"
              }}
            >
              ×
            </button>
            <div style={{ whiteSpace: "pre-line", lineHeight: 1.6, color: "#333" }}>
              {config.agreementType === "standard" ? getStandardAgreementText() : (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <p style={{ marginBottom: 20 }}>Для просмотра соглашения откройте PDF файл:</p>
                  <a
                    href={config.customPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      padding: "12px 24px",
                      background: "#007AFF",
                      color: "white",
                      textDecoration: "none",
                      borderRadius: 8,
                      fontWeight: 600
                    }}
                  >
                    Открыть соглашение (PDF)
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "900px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: "0 0 24px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>
            {config.title || "Пожалуйста, ознакомьтесь и примите условия участия в исследовании"}
          </h2>
          
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ marginTop: 4, width: 20, height: 20, cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "16px", lineHeight: 1.5, color: "#333" }}>
                  Я соглашаюсь на сбор персональных данных и принимаю{" "}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowAgreementModal(true);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#007AFF",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: "16px",
                      padding: 0,
                      fontWeight: 600
                    }}
                  >
                    Соглашение о сборе и обработке персональных данных
                  </button>
                </span>
              </div>
            </label>
          </div>
          
          {error && (
            <div style={{
              marginBottom: 16,
              padding: "12px 16px",
              background: "#ffebee",
              color: "#c62828",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              {error}
            </div>
          )}
          
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => handleSubmit(true)}
              disabled={!accepted || submitting}
              style={{
                flex: 1,
                padding: "12px 24px",
                background: accepted && !submitting ? "#007AFF" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: accepted && !submitting ? "pointer" : "not-allowed"
              }}
            >
              {submitting ? "Сохранение..." : "Принять"}
            </button>
            <button
              onClick={handleDecline}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "12px 24px",
                background: submitting ? "#ccc" : "#f5f5f5",
                color: submitting ? "#999" : "#333",
                border: "1px solid #ddd",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer"
              }}
            >
              {submitting ? "Сохранение..." : "Отказаться"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============= Компонент "Спасибо за участие" =============
function ThankYouPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f5f7", padding: 20 }}>
      <div style={{ textAlign: "center", color: "#333" }}>
        <div style={{ fontSize: 80, marginBottom: 24 }}>🎉</div>
        <h1 style={{ margin: "0 0 16px 0", fontSize: 36, fontWeight: 700 }}>Спасибо за участие!</h1>
        <p style={{ margin: 0, fontSize: 18, color: "#666", maxWidth: 400 }}>Вы успешно завершили тест. Ваши ответы сохранены.</p>
        <p style={{ margin: "24px 0 0 0", fontSize: 14, color: "#999" }}>Теперь можно закрыть эту вкладку.</p>
      </div>
    </div>
  );
}

// ============= Основной компонент =============
export default function StudyRunView() {
  const params = useParams();
  // Токен может содержать слэш (например base64url), поэтому берём весь путь после /run/ или /share/
  const token = (params["*"] ?? params.token ?? "").replace(/^\/+/, "") || null;

  // Store selectors
  const {
    studyData,
    runId,
    currentBlockIndex,
    studyRunLoading,
    studyRunError,
    currentBlockSessionId,
    finished,
    setCurrentBlockIndex,
    setStudyRunLoading,
    setStudyRunError,
    setFinished,
    loadStudyAndStartRun,
    createSessionForBlock,
  } = useViewerStore();

  // Состояние для хранения всех ответов респондента
  const [allResponses, setAllResponses] = useState<Record<string, any>>({});

  useEffect(() => {
    console.log("StudyRunView: useEffect triggered", { token, studyRunLoading, studyRunError, studyData: !!studyData, runId });
    
    if (!token) {
      console.error("StudyRunView: Token is missing in URL");
      setStudyRunError("Токен не указан в URL");
      setStudyRunLoading(false);
      return;
    }
    
    console.log("StudyRunView: Calling loadStudyAndStartRun with token:", token);
    loadStudyAndStartRun(token).catch((err) => {
      console.error("StudyRunView: Error in loadStudyAndStartRun:", err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Functions from store are stable

  // Загрузка всех ответов для проверки логики
  useEffect(() => {
    if (!runId) return;
    
    const loadResponses = async () => {
      try {
        const { data, error } = await supabase
          .from("study_block_responses")
          .select("block_id, answer")
          .eq("run_id", runId);
        
        if (error) {
          console.error("Error loading responses:", error);
          return;
        }
        
        if (data) {
          const responsesMap: Record<string, any> = {};
          data.forEach(r => {
            responsesMap[r.block_id] = r.answer;
          });
          setAllResponses(responsesMap);
        }
      } catch (err) {
        console.error("Unexpected error loading responses:", err);
      }
    };
    
    loadResponses();
  }, [runId]);

  // Нормализация ответа к тексту и числу (для choice/scale и др.)
  const getAnswerTextAndNumeric = useCallback((answer: any): { text: string; numeric?: number } => {
    if (answer == null) return { text: "" };
    if (typeof answer === "string") return { text: answer };
    if (answer.text) return { text: answer.text };
    if (Array.isArray(answer.selected)) return { text: answer.selected.join(", ") };
    if (answer.selected !== undefined) return { text: String(answer.selected) };
    if (typeof answer.value === "number") return { text: String(answer.value), numeric: answer.value };
    if (answer.selections) return { text: JSON.stringify(answer.selections) };
    return { text: JSON.stringify(answer) };
  }, []);

  // Функция проверки условия логики (responsesOverride — для только что отправленного ответа)
  const checkLogicCondition = useCallback((condition: any, blockId: string, responsesOverride?: Record<string, any>): boolean => {
    const responses = responsesOverride ?? allResponses;
    const answer = responses[blockId];

    if (condition.operator === "has_answer") {
      if (answer == null) return false;
      if (typeof answer === "string") return answer.trim().length > 0;
      const { text, numeric } = getAnswerTextAndNumeric(answer);
      return numeric != null || (text.length > 0 && text !== "{}");
    }

    if (!answer) return false;

    // Для прототипов проверяем финальный экран
    if (condition.operator === "completed_on" || condition.operator === "not_completed_on") {
      const finalScreen = answer.finalScreen || answer.screenName;
      if (condition.operator === "completed_on") {
        return finalScreen === condition.screenName;
      } else {
        return finalScreen !== condition.screenName;
      }
    }

    const { text: answerText, numeric: answerNumeric } = getAnswerTextAndNumeric(answer);
    const value = (condition.value || "").toLowerCase();
    const condNum = Number(condition.value);

    switch (condition.operator) {
      case "contains":
        return answerText.toLowerCase().includes(value);
      case "not_contains":
        return !answerText.toLowerCase().includes(value);
      case "equals":
        return answerText === condition.value;
      case "not_equals":
        return answerText !== condition.value;
      case "less_than":
        return answerNumeric != null && !Number.isNaN(condNum) && answerNumeric < condNum;
      case "greater_than":
        return answerNumeric != null && !Number.isNaN(condNum) && answerNumeric > condNum;
      default:
        return false;
    }
  }, [allResponses, getAnswerTextAndNumeric]);

  // Вычисление цепочки условий с комбинаторами И/Или (combinators[i] между condition[i] и condition[i+1])
  // defaultCombinator: при отсутствии combinators — "and" для showOnCondition, "or" для правил перехода
  const evaluateConditions = useCallback(
    (
      conditions: any[],
      combinators: ("and" | "or")[] | undefined,
      checkOne: (cond: any) => boolean,
      defaultCombinator: "and" | "or" = "and"
    ): boolean => {
      if (conditions.length === 0) return true;
      if (conditions.length === 1) return checkOne(conditions[0]);
      let result = checkOne(conditions[0]);
      const combs = combinators ?? [];
      for (let i = 1; i < conditions.length; i++) {
        const next = checkOne(conditions[i]);
        const op = combs[i - 1] ?? defaultCombinator;
        result = op === "and" ? result && next : result || next;
      }
      return result;
    },
    []
  );

  // Функция проверки "Показать при условии" (responsesOverride — merged с только что отправленным)
  const shouldShowBlock = useCallback((block: any, responsesOverride?: Record<string, any>): boolean => {
    const logic = block.config?.logic;
    if (!logic?.showOnCondition?.enabled) return true;

    const { conditions, combinators, action } = logic.showOnCondition;
    if (conditions.length === 0) return true;

    const allConditionsMet = evaluateConditions(
      conditions,
      combinators,
      (cond: any) => checkLogicCondition(cond, cond.blockId, responsesOverride)
    );

    return action === "show" ? allConditionsMet : !allConditionsMet;
  }, [checkLogicCondition, evaluateConditions]);

  // Функция получения следующего блока с учетом логики
  const getNextBlockWithLogic = useCallback((currentBlock: any, currentAnswer: any): number | "end" => {
    if (!studyData) return currentBlockIndex + 1;
    
    const logic = currentBlock.config?.logic;
    if (!logic?.conditionalLogic) {
      // Нет логики - переходим к следующему блоку
      return currentBlockIndex + 1;
    }

    const { rules, elseGoToBlockId } = logic.conditionalLogic;

    // Обновляем ответ для текущего блока перед проверкой
    const updatedResponses = { ...allResponses, [currentBlock.id]: currentAnswer };

    const checkOneRuleCondition = (cond: any): boolean => {
      if (cond.blockId === currentBlock.id) {
        const tempAnswer: any = updatedResponses[currentBlock.id];
        if (cond.operator === "has_answer") {
          if (tempAnswer == null) return false;
          if (typeof tempAnswer === "string") return tempAnswer.trim().length > 0;
          const { text, numeric } = getAnswerTextAndNumeric(tempAnswer);
          return numeric != null || (text.length > 0 && text !== "{}");
        }
        if (!tempAnswer) return false;
        const { text: answerText, numeric: answerNumeric } = getAnswerTextAndNumeric(tempAnswer);
        const value = (cond.value || "").toLowerCase();
        const condNum = Number(cond.value);
        switch (cond.operator) {
          case "contains":
            return answerText.toLowerCase().includes(value);
          case "not_contains":
            return !answerText.toLowerCase().includes(value);
          case "equals":
            return answerText === cond.value;
          case "not_equals":
            return answerText !== cond.value;
          case "less_than":
            return answerNumeric != null && !Number.isNaN(condNum) && answerNumeric < condNum;
          case "greater_than":
            return answerNumeric != null && !Number.isNaN(condNum) && answerNumeric > condNum;
          default:
            return false;
        }
      }
      return checkLogicCondition(cond, cond.blockId, updatedResponses);
    };

    for (const rule of rules) {
      const anyConditionMet = evaluateConditions(
        rule.conditions,
        rule.combinators,
        checkOneRuleCondition,
        "or"
      );

      if (anyConditionMet) {
        if (rule.goToBlockId === "__end__") {
          return "end";
        }
        if (rule.goToBlockId === "__next__") {
          return currentBlockIndex + 1;
        }
        const targetIndex = studyData.blocks.findIndex(b => b.id === rule.goToBlockId);
        if (targetIndex !== undefined && targetIndex >= 0) {
          return targetIndex;
        }
      }
    }

    // Если ничего не подошло, используем else
    if (elseGoToBlockId) {
      if (elseGoToBlockId === "__end__") {
        return "end";
      }
      if (elseGoToBlockId === "__next__") {
        return currentBlockIndex + 1;
      }
      const targetIndex = studyData.blocks.findIndex(b => b.id === elseGoToBlockId);
      if (targetIndex !== undefined && targetIndex >= 0) {
        return targetIndex;
      }
    }

    // По умолчанию - следующий блок
    return currentBlockIndex + 1;
  }, [studyData, currentBlockIndex, allResponses, checkLogicCondition, getAnswerTextAndNumeric, evaluateConditions]);

  const handleNextBlock = useCallback(async (submittedAnswer?: any) => {
    if (!studyData || !runId) return;

    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;

    // Объединённые ответы: только что отправленный сразу учитывается при проверке видимости блоков
    const nextResponses = { ...allResponses, [currentBlock.id]: submittedAnswer };

    // Обновляем ответы после сохранения
    if (submittedAnswer) {
      setAllResponses(prev => ({
        ...prev,
        [currentBlock.id]: submittedAnswer
      }));
    }

    // Получаем следующий блок с учетом логики
    const nextBlockIndex = getNextBlockWithLogic(currentBlock, submittedAnswer);

    if (nextBlockIndex === "end" || (typeof nextBlockIndex === "number" && nextBlockIndex >= studyData.blocks.length)) {
      try {
        await supabase.rpc("rpc_finish_run", { p_run_id: runId });
      } catch (err) {
        console.error("Error finishing run:", err);
      }
      setFinished(true);
      return;
    }

    if (typeof nextBlockIndex === "number") {
      // Пропускаем блоки, которые должны быть скрыты (используем nextResponses, чтобы видеть только что отправленный ответ)
      let actualNextIndex = nextBlockIndex;
      while (actualNextIndex < studyData.blocks.length) {
        const nextBlock = studyData.blocks[actualNextIndex];
        if (shouldShowBlock(nextBlock, nextResponses)) {
          break;
        }
        actualNextIndex++;
      }

      if (actualNextIndex >= studyData.blocks.length) {
        try {
          await supabase.rpc("rpc_finish_run", { p_run_id: runId });
        } catch (err) {
          console.error("Error finishing run:", err);
        }
        setFinished(true);
        return;
      }

      setCurrentBlockIndex(actualNextIndex);
      const nextBlock = studyData.blocks[actualNextIndex];

      if (nextBlock.type === "prototype" && nextBlock.prototype_id) {
        await createSessionForBlock(nextBlock.prototype_id, nextBlock.id, studyData.study.id, runId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyData, runId, currentBlockIndex, createSessionForBlock, allResponses, getNextBlockWithLogic, shouldShowBlock]); // createSessionForBlock from store

  const handlePrototypeComplete = async () => {
    // Для прототипов ответ уже сохранен в TestView, просто переходим
    await handleNextBlock({});
  };

  const handleGiveUp = useCallback(async (sessionId: string) => {
    if (!studyData || !runId) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    try {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ completed: false, aborted: true })
        .eq("id", sessionId);
      if (updateError) {
        console.error("StudyRunView: failed to update session aborted", updateError);
      }
      const { error: insertError } = await supabase.from("events").insert({
        session_id: sessionId,
        event_type: "aborted",
        run_id: runId,
        block_id: currentBlock.id,
        study_id: studyData.study.id,
        user_id: null,
      });
      if (insertError) {
        console.error("StudyRunView: failed to insert aborted event", insertError);
      }
    } catch (err) {
      console.error("StudyRunView: error on give up", err);
    }
    await handleNextBlock({});
  }, [studyData, runId, currentBlockIndex, handleNextBlock]);

  const submitBlockResponse = async (blockId: string, answer: any, durationMs: number) => {
    if (!runId) {
      const error = new Error("Не удалось сохранить ответ: отсутствует идентификатор сессии");
      console.error("StudyRunView: Cannot submit response - runId is missing", {
        block_id: blockId,
        answer,
        duration_ms: durationMs
      });
      throw error;
    }
    
    // Логирование перед отправкой
    console.log("StudyRunView: Submitting block response:", {
      run_id: runId,
      block_id: blockId,
      answer_type: typeof answer,
      answer_keys: typeof answer === "object" ? Object.keys(answer) : null,
      duration_ms: durationMs
    });

    const { data, error: submitError } = await supabase.rpc("rpc_submit_block_response", {
      p_run_id: runId,
      p_block_id: blockId,
      p_answer: answer,
      p_duration_ms: durationMs
    });
    
    if (submitError) {
      console.error("StudyRunView: Error submitting response:", {
        error: submitError,
        errorMessage: submitError.message,
        errorDetails: submitError.details,
        errorHint: submitError.hint,
        errorCode: submitError.code,
        run_id: runId,
        block_id: blockId,
        answer: answer,
        answerStringified: JSON.stringify(answer)
      });
      throw submitError;
    }

    // Логирование успешного сохранения
    console.log("StudyRunView: Successfully submitted block response:", {
      run_id: runId,
      block_id: blockId,
      duration_ms: durationMs,
      rpc_result: data
    });
  };

  const handleOpenQuestionSubmit = async (answer: string, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    const answerObj = { text: answer };
    await submitBlockResponse(currentBlock.id, answerObj, durationMs);
    await handleNextBlock(answerObj);
  };

  const handleChoiceSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleScaleSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handlePreferenceSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleUmuxLiteSubmit = async (item1: number, item2: number, feedback: string, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    
    const umuxLiteScore = ((item1 - 1 + item2 - 1) / 12) * 100;
    const susScore = 0.65 * ((item1 + item2 - 2) * (100 / 12)) + 22.9;
    
    const answerObj = {
      item1,
      item2,
      feedback,
      umux_lite_score: Math.round(umuxLiteScore * 100) / 100,
      sus_score: Math.round(susScore * 100) / 100
    };
    await submitBlockResponse(currentBlock.id, answerObj, durationMs);
    await handleNextBlock(answerObj);
  };

  const handleTreeTestingSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleFirstClickSubmit = async (answer: { x: number; y: number }, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleCardSortingSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleMatrixSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  const handleAgreementSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock(answer);
  };

  // Рендеринг
  console.log("StudyRunView: Render state", { 
    studyRunLoading, 
    studyRunError, 
    finished, 
    hasStudyData: !!studyData, 
    runId, 
    currentBlockIndex,
    blocksCount: studyData?.blocks?.length,
    currentBlockType: studyData?.blocks?.[currentBlockIndex]?.type,
    currentBlockId: studyData?.blocks?.[currentBlockIndex]?.id,
    currentBlockSessionId,
    token
  });

  if (studyRunLoading) {
    console.log("StudyRunView: Rendering loading state");
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "var(--color-foreground, #213547)" }}>Загрузка теста...</h1>
      </div>
    );
  }

  if (studyRunError) {
    if (studyRunError === "STUDY_NOT_FOUND") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600, color: "#1f1f1f" }}>Страница не найдена</h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#6b6b6b" }}>Простите, здесь ничего нет</p>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px" }}>
        <div style={{ maxWidth: "500px", padding: "24px", background: "#ffebee", color: "#c62828", borderRadius: "8px", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 16px 0" }}>Ошибка</h2>
          <p style={{ margin: 0 }}>{studyRunError}</p>
        </div>
      </div>
    );
  }

  if (finished) {
    console.log("StudyRunView: Rendering finished state");
    return <ThankYouPage />;
  }

  if (!studyData || !runId) {
    console.warn("StudyRunView: Missing studyData or runId", { hasStudyData: !!studyData, runId });
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Тест не найден</div>;
  }

  const currentBlock = studyData.blocks[currentBlockIndex];
  console.log("StudyRunView: Current block check", { 
    currentBlockIndex, 
    blocksCount: studyData.blocks.length,
    hasCurrentBlock: !!currentBlock,
    currentBlockType: currentBlock?.type,
    currentBlockId: currentBlock?.id,
    allBlockTypes: studyData.blocks.map(b => ({ type: b.type, id: b.id }))
  });
  
  if (!currentBlock) {
    console.error("StudyRunView: Current block is null!", { currentBlockIndex, blocksCount: studyData.blocks.length });
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Блок не найден</div>;
  }
  
  console.log("StudyRunView: Rendering block", { type: currentBlock.type, id: currentBlock.id });

  const progress = ((currentBlockIndex + 1) / studyData.blocks.length) * 100;

  const prototypeConfig = (currentBlock.config || {}) as {
    eye_tracking_enabled?: boolean;
    record_screen?: boolean;
    record_camera?: boolean;
    record_audio?: boolean;
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", minHeight: "100vh", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      {/* Progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "4px", background: "#e0e0e0", zIndex: 1000 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#007AFF", transition: "width 0.3s ease" }} />
      </div>

      {/* Block indicator */}
      <div style={{ position: "fixed", top: "12px", right: "12px", padding: "8px 16px", background: "rgba(0,0,0,0.7)", color: "white", borderRadius: "20px", fontSize: "12px", fontWeight: 600, zIndex: 1000 }}>
        {currentBlockIndex + 1} / {studyData.blocks.length}
      </div>

      {/* Render current block */}
      {currentBlock.type === "prototype" ? (
        (() => {
          console.log("StudyRunView: Rendering prototype block", { 
            prototypeId: currentBlock.prototype_id, 
            currentBlockSessionId,
            hasSessionId: !!currentBlockSessionId,
            recordScreen: !!prototypeConfig.record_screen,
            recordCamera: !!prototypeConfig.record_camera,
            recordAudio: !!prototypeConfig.record_audio,
            eyeTracking: !!prototypeConfig.eye_tracking_enabled,
            config: prototypeConfig
          });
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StudyRunView.tsx:prototype block',message:'block config for recording',data:{record_screen:prototypeConfig.record_screen,record_camera:prototypeConfig.record_camera,record_audio:prototypeConfig.record_audio,configKeys:currentBlock.config?Object.keys(currentBlock.config):[]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          return (
            <PrototypeBlockWrapper
              key={currentBlock.id}
              prototypeId={currentBlock.prototype_id!}
              instructions={currentBlock.instructions}
              description={currentBlock.config?.description}
              sessionId={currentBlockSessionId}
              runId={runId}
              blockId={currentBlock.id}
              studyId={studyData.study.id}
              enableEyeTracking={!!prototypeConfig.eye_tracking_enabled}
              recordScreen={!!prototypeConfig.record_screen}
              recordCamera={!!prototypeConfig.record_camera}
              recordAudio={!!prototypeConfig.record_audio}
              onComplete={handlePrototypeComplete}
              onGiveUp={handleGiveUp}
            />
          );
        })()
      ) : currentBlock.type === "open_question" ? (
        <OpenQuestionBlock
          key={currentBlock.id}
          question={currentBlock.config?.question || "Вопрос"}
          optional={currentBlock.config?.optional}
          imageUrl={currentBlock.config?.imageUrl}
          onSubmit={handleOpenQuestionSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "choice" ? (
        <ChoiceBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleChoiceSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "context" ? (
        <ContextBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onNext={handleNextBlock}
        />
      ) : currentBlock.type === "scale" ? (
        <ScaleBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleScaleSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "preference" ? (
        <PreferenceBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handlePreferenceSubmit}
        />
      ) : currentBlock.type === "five_seconds" ? (
        <FiveSecondsBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onComplete={handleNextBlock}
        />
      ) : currentBlock.type === "umux_lite" ? (
        <UmuxLiteBlock key={currentBlock.id} onSubmit={handleUmuxLiteSubmit} />
      ) : currentBlock.type === "card_sorting" ? (
        <CardSortingBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleCardSortingSubmit}
        />
      ) : currentBlock.type === "matrix" ? (
        <MatrixBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleMatrixSubmit}
          onSkip={currentBlock.config?.optional ? handleNextBlock : undefined}
        />
      ) : currentBlock.type === "agreement" ? (
        <AgreementBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleAgreementSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "tree_testing" ? (
        <TreeTestingBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleTreeTestingSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "first_click" ? (
        <FirstClickBlock
          key={currentBlock.id}
          config={currentBlock.config}
          onSubmit={handleFirstClickSubmit}
        />
      ) : null}
    </div>
  );
}

// ============= Wrapper для прототипа =============
// Сайдбар слева: задание, описание, Начать (intro) / Сдаться (active).
// Оверлей затемняет и размывает прототип под сайдбаром.
// Кнопка «Показать задание» — выступает слева, открывает сайдбар во время прохождения.
interface PrototypeBlockWrapperProps {
  prototypeId: string;
  instructions: string | null;
  description?: string | null;
  sessionId: string | null;
  runId: string;
  blockId: string;
  studyId: string;
  enableEyeTracking: boolean;
  recordScreen: boolean;
  recordCamera: boolean;
  recordAudio: boolean;
  onComplete: () => void;
  /** Вызывается при нажатии «Сдаться»: обновить сессию (aborted) и записать событие, затем вызвать onComplete */
  onGiveUp?: (sessionId: string) => Promise<void>;
}

const SIDEBAR_WIDTH = 320;
const OVERLAY_BLUR = "blur(12px)";

function PrototypeBlockWrapper({
  prototypeId,
  instructions,
  description,
  sessionId,
  runId,
  blockId,
  studyId,
  enableEyeTracking,
  recordScreen,
  recordCamera,
  recordAudio,
  onComplete,
  onGiveUp,
}: PrototypeBlockWrapperProps) {
  const hasRecordingOptions = recordScreen || recordCamera || recordAudio;
  const [phase, setPhase] = useState<"permissions" | "intro" | "active">(
    hasRecordingOptions ? "permissions" : "intro"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLabelOnTrigger, setShowLabelOnTrigger] = useState(false);
  const labelTimeoutRef = useRef<number | null>(null);

  const handleStart = () => {
    // Время в отчётах считаем с момента нажатия «Начать» респондентом
    if (sessionId) {
      supabase
        .from("sessions")
        .update({ started_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(({ error }) => {
          if (error) console.warn("StudyRunView: failed to set session started_at", error);
        });
    }
    setPhase("active");
  };

  const handleShowTask = () => {
    setSidebarOpen(true);
  };

  const handleHideSidebar = () => {
    setSidebarOpen(false);
    setShowLabelOnTrigger(true);
    if (labelTimeoutRef.current) clearTimeout(labelTimeoutRef.current);
    labelTimeoutRef.current = window.setTimeout(() => {
      setShowLabelOnTrigger(false);
      labelTimeoutRef.current = null;
    }, SHOW_TASK_LABEL_DURATION_MS) as unknown as number;
  };

  useEffect(() => () => {
    if (labelTimeoutRef.current) clearTimeout(labelTimeoutRef.current);
  }, []);

  const taskText = instructions || "Выполните задание в прототипе.";
  const showSidebar = phase === "intro" || sidebarOpen;

  const sidebarContent = (
    <aside
      style={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        background: "white",
        boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div>
        <p style={{ margin: 0, color: "#333", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{taskText}</p>
        {description && (
          <p style={{ margin: "12px 0 0 0", color: "#666", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{description}</p>
        )}
      </div>
      {phase === "intro" ? (
        <button
          onClick={handleStart}
          style={{
            padding: "14px 24px",
            background: "#007AFF",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Начать
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handleHideSidebar}
            style={{
              padding: "14px 24px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Продолжить
          </button>
          <button
            onClick={async () => {
              if (sessionId && onGiveUp) {
                await onGiveUp(sessionId);
              } else {
                onComplete();
              }
            }}
            style={{
              padding: "14px 24px",
              background: "#e0e0e0",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Сдаться
          </button>
        </div>
      )}
    </aside>
  );

  const overlayContent = showSidebar && (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: OVERLAY_BLUR,
        WebkitBackdropFilter: OVERLAY_BLUR,
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );

  const handlePermissionsComplete = () => {
    setPhase("intro");
  };

  const testViewContent = (
    <TestView
      sessionId={sessionId}
      prototypeIdOverride={prototypeId}
      instructionsOverride={instructions}
      runIdOverride={runId}
      blockIdOverride={blockId}
      studyIdOverride={studyId}
      enableEyeTracking={enableEyeTracking}
      recordScreen={recordScreen}
      recordCamera={recordCamera}
      recordAudio={recordAudio}
      onComplete={onComplete}
      onPermissionsComplete={hasRecordingOptions ? handlePermissionsComplete : undefined}
      hideTaskAbove={true}
      hideGiveUpBelow={true}
      startRecordingWhenReady={phase === "active"}
    />
  );

  // Z-index constants removed - not used

  const showTaskSidebar = phase === "intro" || (phase === "active" && sidebarOpen);

  return (
    <>
      <div style={{ display: "flex", width: "100%", height: "100vh", minHeight: "100vh", overflow: "hidden", background: "#f5f5f7", position: "relative" }}>
        {showTaskSidebar && sidebarContent}
        <div style={{ flex: 1, position: "relative", height: "100%", minHeight: 0 }}>
          <div style={{ position: "absolute", inset: 0 }}>
            {testViewContent}
          </div>
          {showTaskSidebar && overlayContent}
        </div>
      </div>
      {phase === "active" && (
        <ShowTaskTrigger onClick={handleShowTask} showLabel={showLabelOnTrigger} />
      )}
    </>
  );
}
