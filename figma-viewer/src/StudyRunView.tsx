import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { v4 as uuidv4 } from "uuid";
import TestView from "./TestView.tsx";

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

  return (
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
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {showNavigation && onPrev && (
          <button
            onClick={onPrev}
            style={{
              position: "absolute",
              left: -60,
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
            }}
          >
            ‹
          </button>
        )}
        <img
          src={imageUrl}
          alt=""
          style={{
            maxWidth: "100%",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: 8
          }}
        />
        {showNavigation && onNext && (
          <button
            onClick={onNext}
            style={{
              position: "absolute",
              right: -60,
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
            }}
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

// Все типы блоков
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds";

interface StudyData {
  study: {
    id: string;
    title: string;
    status: string;
  };
  blocks: Array<{
    id: string;
    type: BlockType;
    order_index: number;
    prototype_id: string | null;
    instructions: string | null;
    config: any;
  }>;
}

// ============= Компонент "Открытый вопрос" =============
interface OpenQuestionBlockProps {
  question: string;
  optional?: boolean;
  imageUrl?: string;
  onSubmit: (answer: string, durationMs: number) => Promise<void>;
  onSkip?: () => Promise<void>;
}

function OpenQuestionBlock({ question, optional, imageUrl, onSubmit, onSkip }: OpenQuestionBlockProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [showImageModal, setShowImageModal] = useState(false);

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

  const handleSkip = async () => {
    if (!optional || !onSkip) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {showImageModal && imageUrl && (
        <ImageModal imageUrl={imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "900px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          {imageUrl && (
            <div style={{ marginBottom: 24, borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setShowImageModal(true)}>
              <img src={imageUrl} alt="" style={{ width: "100%", maxHeight: 500, objectFit: "contain", background: "#f5f5f5" }} />
              <div style={{ textAlign: "center", marginTop: 8, color: "#666", fontSize: 13 }}>Нажмите для увеличения</div>
            </div>
          )}
        <h2 style={{ margin: "0 0 24px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{question || "Вопрос"}</h2>
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Введите ваш ответ..." style={{ width: "100%", minHeight: "150px", padding: "12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "16px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "20px" }} />
        <div style={{ display: "flex", gap: 12 }}>
          {optional && (
            <button onClick={handleSkip} disabled={submitting} style={{ flex: 1, padding: "12px 24px", background: "#f5f5f5", color: "#666", border: "none", borderRadius: "8px", fontSize: "16px", cursor: submitting ? "not-allowed" : "pointer" }}>
              Пропустить
            </button>
          )}
          <button onClick={handleSubmit} disabled={(!answer.trim() && !optional) || submitting} style={{ flex: 1, padding: "12px 24px", background: (answer.trim() || optional) && !submitting ? "#007AFF" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: (answer.trim() || optional) && !submitting ? "pointer" : "not-allowed" }}>
            {submitting ? "Сохранение..." : "Далее"}
          </button>
        </div>
      </div>
    </div>
    </>
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

  const handleSkip = async () => {
    if (!config.optional || !onSkip) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnswer = selected.length > 0 || (showOther && otherText.trim()) || noneSelected;

  return (
    <>
      {showImageModal && config.imageUrl && (
        <ImageModal imageUrl={config.imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
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
            <button key={i} onClick={() => handleSelect(option)} disabled={noneSelected} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", marginBottom: 8, border: selected.includes(option) ? "2px solid #007AFF" : "1px solid #ddd", borderRadius: 8, background: selected.includes(option) ? "#e3f2fd" : "white", cursor: noneSelected ? "not-allowed" : "pointer", textAlign: "left", fontSize: 15, opacity: noneSelected ? 0.5 : 1 }}>
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
        
        <div style={{ display: "flex", gap: 12 }}>
          {config.optional && (
            <button onClick={handleSkip} disabled={submitting} style={{ flex: 1, padding: "12px 24px", background: "#f5f5f5", color: "#666", border: "none", borderRadius: "8px", fontSize: "16px", cursor: submitting ? "not-allowed" : "pointer" }}>Пропустить</button>
          )}
          <button onClick={handleSubmit} disabled={(!hasAnswer && !config.optional) || submitting} style={{ flex: 1, padding: "12px 24px", background: (hasAnswer || config.optional) && !submitting ? "#007AFF" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: (hasAnswer || config.optional) && !submitting ? "pointer" : "not-allowed" }}>
            {submitting ? "Сохранение..." : "Далее"}
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
      <div style={{ maxWidth: "600px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>{config.title}</h2>
        {config.description && <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "16px", lineHeight: 1.6 }}>{config.description}</p>}
        <button onClick={onNext} style={{ width: "100%", padding: "12px 24px", background: "#007AFF", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer" }}>Далее</button>
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

  const handleSkip = async () => {
    if (!config.optional || !onSkip) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  const renderNumeric = () => {
    const min = config.min ?? 1;
    const max = config.max ?? 5;
    const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#999" }}>{config.minLabel || min}</span>
          <span style={{ fontSize: 13, color: "#999" }}>{config.maxLabel || max}</span>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {values.map(v => (
            <button key={v} onClick={() => setValue(v)} style={{ width: 44, height: 44, borderRadius: 8, border: value === v ? "2px solid #007AFF" : "1px solid #ddd", background: value === v ? "#007AFF" : "white", color: value === v ? "white" : "#333", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>{v}</button>
          ))}
        </div>
      </div>
    );
  };

  const renderEmoji = () => {
    const emojis3 = ["😞", "😐", "😊"];
    const emojis5 = ["😠", "😞", "😐", "😊", "😄"];
    const emojis = config.emojiCount === 3 ? emojis3 : emojis5;
    
    return (
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {emojis.map((emoji, i) => (
          <button key={i} onClick={() => setValue(i + 1)} style={{ width: 56, height: 56, borderRadius: 12, border: value === i + 1 ? "3px solid #007AFF" : "1px solid #ddd", background: value === i + 1 ? "#e3f2fd" : "white", fontSize: 28, cursor: "pointer", transition: "transform 0.2s", transform: value === i + 1 ? "scale(1.1)" : "scale(1)" }}>{emoji}</button>
        ))}
      </div>
    );
  };

  const renderStars = () => {
    return (
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} onClick={() => setValue(star)} style={{ background: "none", border: "none", fontSize: 36, cursor: "pointer", color: value !== null && star <= value ? "#ffc107" : "#ddd", transition: "transform 0.2s", transform: value !== null && star <= value ? "scale(1.1)" : "scale(1)" }}>★</button>
        ))}
      </div>
    );
  };

  return (
    <>
      {showImageModal && config.imageUrl && (
        <ImageModal imageUrl={config.imageUrl} onClose={() => setShowImageModal(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "900px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
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
        
        <div style={{ display: "flex", gap: 12 }}>
          {config.optional && (
            <button onClick={handleSkip} disabled={submitting} style={{ flex: 1, padding: "12px 24px", background: "#f5f5f5", color: "#666", border: "none", borderRadius: "8px", fontSize: "16px", cursor: submitting ? "not-allowed" : "pointer" }}>Пропустить</button>
          )}
          <button onClick={handleSubmit} disabled={(value === null && !config.optional) || submitting} style={{ flex: 1, padding: "12px 24px", background: (value !== null || config.optional) && !submitting ? "#007AFF" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: (value !== null || config.optional) && !submitting ? "pointer" : "not-allowed" }}>
            {submitting ? "Сохранение..." : "Далее"}
          </button>
        </div>
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
      newResults.forEach((winner, i) => {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
      <div style={{ maxWidth: "1200px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 24px 0", fontSize: "24px", fontWeight: 600, color: "#333", textAlign: "center" }}>{config.question}</h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shuffledImages.length, 4)}, 1fr)`, gap: 20 }}>
          {shuffledImages.map((img, i) => (
            <button key={i} onClick={() => handleSelectAll(i)} disabled={submitting} style={{ padding: 0, border: selected === i ? "3px solid #007AFF" : "2px solid #ddd", borderRadius: 12, overflow: "hidden", cursor: submitting ? "not-allowed" : "pointer", background: selected === i ? "#e3f2fd" : "white", transition: "all 0.2s" }}>
              <img src={img.url} alt={`Вариант ${i + 1}`} style={{ width: "100%", height: 250, objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='250'%3E%3Crect fill='%23f0f0f0' width='200' height='250'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНет изображения%3C/text%3E%3C/svg%3E"; }} />
              <div style={{ padding: 16, fontWeight: 500, fontSize: 15, textAlign: "center" }}>Вариант {String.fromCharCode(65 + i)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f5f5f7" }}>
        <div style={{ maxWidth: "600px", width: "100%", background: "white", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>Тест на {config.duration} секунд</h2>
          <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "16px", lineHeight: 1.6 }}>{config.instruction}</p>
          <p style={{ margin: "0 0 24px 0", color: "#999", fontSize: "14px" }}>Изображение будет показано на {config.duration} секунд. Постарайтесь запомнить как можно больше деталей.</p>
          <button onClick={startViewing} style={{ padding: "14px 32px", background: "#007AFF", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer" }}>Начать</button>
        </div>
      </div>
    );
  }

  if (phase === "viewing") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 0, background: "#f5f5f7" }}>
        <div style={{ position: "fixed", top: 20, right: 20, padding: "12px 24px", background: "rgba(0,0,0,0.7)", color: "white", borderRadius: 30, fontSize: 24, fontWeight: 700, fontFamily: "monospace", zIndex: 100 }}>{timeLeft}</div>
        <img src={config.imageUrl} alt="Test image" style={{ width: "100%", height: "100vh", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EНе удалось загрузить изображение%3C/text%3E%3C/svg%3E"; }} />
      </div>
    );
  }

  return null;
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
  const params = useParams<{ token: string }>();
  const token = params.token || null;

  const [studyData, setStudyData] = useState<StudyData | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBlockSessionId, setCurrentBlockSessionId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Токен не указан в URL");
      setLoading(false);
      return;
    }
    loadStudyAndStartRun();
  }, [token]);

  const loadStudyAndStartRun = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const { data: studyDataResult, error: studyError } = await supabase.rpc("rpc_get_public_study", { p_token: token });

      if (studyError) {
        if (studyError.message?.includes("stopped")) {
          setError("Тестирование завершено. Этот тест больше не принимает ответы.");
        } else {
          setError(`Ошибка загрузки теста: ${studyError.message}`);
        }
        setLoading(false);
        return;
      }

      if (!studyDataResult) {
        setError("Тест не найден или токен недействителен");
        setLoading(false);
        return;
      }

      setStudyData(studyDataResult as StudyData);

      const clientMeta = {
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        timestamp: new Date().toISOString()
      };

      const { data: runIdResult, error: runError } = await supabase.rpc("rpc_start_public_run", {
        p_token: token,
        p_client_meta: JSON.stringify(clientMeta)
      });

      if (runError) {
        setError(`Ошибка создания прохождения: ${runError.message}`);
        setLoading(false);
        return;
      }

      if (!runIdResult) {
        setError("Не удалось создать прохождение");
        setLoading(false);
        return;
      }

      setRunId(runIdResult as string);

      const blocks = (studyDataResult as StudyData).blocks;
      if (blocks.length > 0 && blocks[0].type === "prototype" && blocks[0].prototype_id) {
        await createSessionForBlock(blocks[0].prototype_id, blocks[0].id, studyDataResult.study.id, runIdResult as string);
      }
    } catch (err) {
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const createSessionForBlock = async (prototypeId: string, blockId: string, studyId: string, runIdParam: string) => {
    try {
      const newSessionId = uuidv4();
      const { error: insertError } = await supabase.from("sessions").insert([{
        id: newSessionId,
        prototype_id: prototypeId,
        user_id: null,
        run_id: runIdParam,
        block_id: blockId,
        study_id: studyId
      }]);

      if (insertError) console.error("Error creating session:", insertError);
      setCurrentBlockSessionId(newSessionId);
    } catch (err) {
      console.error("Unexpected error creating session:", err);
    }
  };

  const handleNextBlock = useCallback(async () => {
    if (!studyData || !runId) return;

    const nextIndex = currentBlockIndex + 1;

    if (nextIndex >= studyData.blocks.length) {
      try {
        await supabase.rpc("rpc_finish_run", { p_run_id: runId });
      } catch (err) {
        console.error("Error finishing run:", err);
      }
      setFinished(true);
      return;
    }

    setCurrentBlockIndex(nextIndex);
    const nextBlock = studyData.blocks[nextIndex];

    if (nextBlock.type === "prototype" && nextBlock.prototype_id) {
      await createSessionForBlock(nextBlock.prototype_id, nextBlock.id, studyData.study.id, runId);
    }
  }, [studyData, runId, currentBlockIndex]);

  const handlePrototypeComplete = async () => {
    await handleNextBlock();
  };

  const submitBlockResponse = async (blockId: string, answer: any, durationMs: number) => {
    if (!runId) return;
    const { error: submitError } = await supabase.rpc("rpc_submit_block_response", {
      p_run_id: runId,
      p_block_id: blockId,
      p_answer: answer,
      p_duration_ms: durationMs
    });
    if (submitError) {
      console.error("Error submitting response:", submitError);
      throw submitError;
    }
  };

  const handleOpenQuestionSubmit = async (answer: string, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, { text: answer }, durationMs);
    await handleNextBlock();
  };

  const handleChoiceSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock();
  };

  const handleScaleSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock();
  };

  const handlePreferenceSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock();
  };

  const handleUmuxLiteSubmit = async (item1: number, item2: number, feedback: string, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    
    const umuxLiteScore = ((item1 - 1 + item2 - 1) / 12) * 100;
    const susScore = 0.65 * ((item1 + item2 - 2) * (100 / 12)) + 22.9;
    
    await submitBlockResponse(currentBlock.id, {
      item1,
      item2,
      feedback,
      umux_lite_score: Math.round(umuxLiteScore * 100) / 100,
      sus_score: Math.round(susScore * 100) / 100
    }, durationMs);
    await handleNextBlock();
  };

  // Рендеринг

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Загрузка теста...</div>;
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px" }}>
        <div style={{ maxWidth: "500px", padding: "24px", background: "#ffebee", color: "#c62828", borderRadius: "8px", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 16px 0" }}>Ошибка</h2>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (finished) return <ThankYouPage />;

  if (!studyData || !runId) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Тест не найден</div>;
  }

  const currentBlock = studyData.blocks[currentBlockIndex];
  if (!currentBlock) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Блок не найден</div>;
  }

  const progress = ((currentBlockIndex + 1) / studyData.blocks.length) * 100;

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
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
        <PrototypeBlockWrapper
          prototypeId={currentBlock.prototype_id!}
          instructions={currentBlock.instructions}
          sessionId={currentBlockSessionId}
          runId={runId}
          blockId={currentBlock.id}
          studyId={studyData.study.id}
          onComplete={handlePrototypeComplete}
        />
      ) : currentBlock.type === "open_question" ? (
        <OpenQuestionBlock
          question={currentBlock.config?.question || "Вопрос"}
          optional={currentBlock.config?.optional}
          imageUrl={currentBlock.config?.imageUrl}
          onSubmit={handleOpenQuestionSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "choice" ? (
        <ChoiceBlock
          config={currentBlock.config}
          onSubmit={handleChoiceSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "context" ? (
        <ContextBlock
          config={currentBlock.config}
          onNext={handleNextBlock}
        />
      ) : currentBlock.type === "scale" ? (
        <ScaleBlock
          config={currentBlock.config}
          onSubmit={handleScaleSubmit}
          onSkip={handleNextBlock}
        />
      ) : currentBlock.type === "preference" ? (
        <PreferenceBlock
          config={currentBlock.config}
          onSubmit={handlePreferenceSubmit}
        />
      ) : currentBlock.type === "five_seconds" ? (
        <FiveSecondsBlock
          config={currentBlock.config}
          onComplete={handleNextBlock}
        />
      ) : currentBlock.type === "umux_lite" ? (
        <UmuxLiteBlock onSubmit={handleUmuxLiteSubmit} />
      ) : null}
    </div>
  );
}

// ============= Wrapper для прототипа =============
interface PrototypeBlockWrapperProps {
  prototypeId: string;
  instructions: string | null;
  sessionId: string | null;
  runId: string;
  blockId: string;
  studyId: string;
  onComplete: () => void;
}

function PrototypeBlockWrapper({ prototypeId, instructions, sessionId, runId, blockId, studyId, onComplete }: PrototypeBlockWrapperProps) {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <TestView 
        sessionId={sessionId}
        prototypeIdOverride={prototypeId}
        instructionsOverride={instructions}
        runIdOverride={runId}
        blockIdOverride={blockId}
        studyIdOverride={studyId}
        onComplete={onComplete}
      />
    </div>
  );
}
