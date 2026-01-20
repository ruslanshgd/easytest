import { useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { v4 as uuidv4 } from "uuid";
import TestView from "./TestView.tsx";
import { useViewerStore } from "./store";

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
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds" | "card_sorting" | "tree_testing";

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

  // Выбрать узел
  const selectNode = (nodeId: string) => {
    const path = findPathToNode(config.tree, nodeId);
    if (path) {
      setSelectedPath(path);
      // Развернуть всех родителей
      const newExpanded = new Set(expandedNodes);
      path.forEach(id => newExpanded.add(id));
      setExpandedNodes(newExpanded);
    }
  };

  // Отправить ответ
  const handleSubmit = async () => {
    if (selectedPath.length === 0) return;
    
    setSubmitting(true);
    const durationMs = Date.now() - startTime;
    const selectedNodeId = selectedPath[selectedPath.length - 1];
    const isCorrect = config.correctAnswers.includes(selectedNodeId);
    
    try {
      await onSubmit({
        selectedNodeId,
        selectedPath,
        pathNames: getPathNames(selectedPath),
        isCorrect
      }, durationMs);
    } catch (err) {
      console.error("Error submitting tree testing:", err);
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
      minHeight: "100vh",
      padding: "20px",
      background: "#f5f5f7"
    }}>
      <div style={{
        maxWidth: "800px",
        width: "100%",
        margin: "0 auto",
        background: "white",
        borderRadius: "12px",
        padding: "32px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
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
        <div style={{ display: "flex", gap: 12 }}>
          {config.allowSkip && (
            <button
              onClick={handleSkip}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "14px 24px",
                background: "#f5f5f5",
                color: "#666",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: submitting ? "not-allowed" : "pointer"
              }}
            >
              Пропустить
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!hasSelection || submitting}
            style={{
              flex: 1,
              padding: "14px 24px",
              background: hasSelection && !submitting ? "#007AFF" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: 600,
              cursor: hasSelection && !submitting ? "pointer" : "not-allowed"
            }}
          >
            {submitting ? "Сохранение..." : "Подтвердить выбор"}
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
  
  // Показать зону создания категории
  const [showCreateCategoryZone, setShowCreateCategoryZone] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingCardForNewCategory, setPendingCardForNewCategory] = useState<CardSortingCard | null>(null);
  
  const allCategories = [...shuffledCategories, ...userCategories];
  const sortedCount = shuffledCards.length - unsortedCards.length;
  
  const handleStart = () => {
    setPhase("sorting");
    setStartTime(Date.now());
  };
  
  const handleDragStart = (card: CardSortingCard) => {
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
    setPendingCardForNewCategory(draggingCard);
    setDraggingCard(null);
    setShowCreateCategoryZone(false);
    setNewCategoryName("");
  };
  
  const handleCreateCategory = () => {
    if (!newCategoryName.trim() || !pendingCardForNewCategory) return;
    
    const newCat: CardSortingCategory = {
      id: crypto.randomUUID(),
      name: newCategoryName.trim()
    };
    
    setUserCategories(prev => [...prev, newCat]);
    
    // Удаляем карточку из несортированных
    setUnsortedCards(prev => prev.filter(c => c.id !== pendingCardForNewCategory.id));
    
    // Добавляем в новую категорию
    setSortedCards(prev => ({
      ...prev,
      [newCat.id]: [pendingCardForNewCategory]
    }));
    
    setPendingCardForNewCategory(null);
    setNewCategoryName("");
  };
  
  const handleCancelCreateCategory = () => {
    setPendingCardForNewCategory(null);
    setNewCategoryName("");
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
  
  // Intro phase
  if (phase === "intro") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20, background: "#f5f5f7" }}>
        <div style={{ maxWidth: 600, width: "100%", background: "white", borderRadius: 12, padding: 32, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 24px 0", fontSize: 28, fontWeight: 700, color: "#333" }}>Сортировка карточек</h2>
          <p style={{ margin: "0 0 16px 0", color: "#666", fontSize: 16, lineHeight: 1.6 }}>
            Отсортируйте каждую карточку в категорию, которая вам кажется наиболее подходящей. Перетащите карточки в правую часть страницы, чтобы создать категории.
          </p>
          <p style={{ margin: "0 0 32px 0", color: "#999", fontSize: 14 }}>
            Просто делайте то, что кажется вам наиболее подходящим, нет правильных или неправильных ответов.
          </p>
          <button
            onClick={handleStart}
            style={{
              padding: "14px 32px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Начать
          </button>
        </div>
      </div>
    );
  }
  
  // Modal for creating new category
  if (pendingCardForNewCategory) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20, background: "#f5f5f7" }}>
        <div style={{ maxWidth: 400, width: "100%", background: "white", borderRadius: 12, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>Создать новую категорию</h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 14, color: "#666" }}>
            Карточка: <strong>{pendingCardForNewCategory.title}</strong>
          </p>
          <input
            type="text"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            placeholder="Название категории"
            autoFocus
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 16,
              boxSizing: "border-box"
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && newCategoryName.trim()) {
                handleCreateCategory();
              }
            }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleCancelCreateCategory}
              style={{
                flex: 1,
                padding: "10px",
                background: "#f5f5f5",
                color: "#666",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              Отмена
            </button>
            <button
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim()}
              style={{
                flex: 1,
                padding: "10px",
                background: newCategoryName.trim() ? "#007AFF" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: newCategoryName.trim() ? "pointer" : "not-allowed"
              }}
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Sorting phase
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f5f5f7" }}>
      {/* Left side - Unsorted cards */}
      <div style={{ width: 280, padding: 20, borderRight: "1px solid #e0e0e0", background: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>{config.task}</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Карточки</div>
          <div style={{ fontSize: 13, color: "#999" }}>{sortedCount} / {shuffledCards.length}</div>
          <div style={{ marginTop: 8, height: 4, background: "#e0e0e0", borderRadius: 2 }}>
            <div style={{ height: "100%", background: "#007AFF", borderRadius: 2, width: `${(sortedCount / shuffledCards.length) * 100}%`, transition: "width 0.3s" }} />
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: "auto" }}>
          {unsortedCards.map(card => (
            <div
              key={card.id}
              draggable
              onDragStart={() => handleDragStart(card)}
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
                {config.showImages && card.imageUrl && (
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
          {submitting ? "Сохранение..." : "Завершить"}
        </button>
      </div>
      
      {/* Right side - Categories */}
      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
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
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</span>
                  {isUserCreated && (
                    <button
                      onClick={() => handleRemoveCategory(cat.id)}
                      style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 18 }}
                      title="Удалить категорию"
                    >
                      ×
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
                        style={{
                          padding: "10px 12px",
                          background: "#f7f7f5",
                          borderRadius: 6,
                          fontSize: 13,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0 }}>
                          {config.showImages && card.imageUrl && (
                            <img src={card.imageUrl} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
                        </div>
                        <button
                          onClick={() => handleReturnCard(card, cat.id)}
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
          
          {/* Create new category zone (only for open sorting) */}
          {config.sortingType === "open" && (
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

  // Store selectors
  const {
    studyData,
    runId,
    currentBlockIndex,
    studyRunLoading,
    studyRunError,
    currentBlockSessionId,
    finished,
    setStudyData,
    setRunId,
    setCurrentBlockIndex,
    setStudyRunLoading,
    setStudyRunError,
    setCurrentBlockSessionId,
    setFinished,
    loadStudyAndStartRun,
    createSessionForBlock,
  } = useViewerStore();

  useEffect(() => {
    if (!token) {
      setStudyRunError("Токен не указан в URL");
      setStudyRunLoading(false);
      return;
    }
    loadStudyAndStartRun(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Functions from store are stable

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyData, runId, currentBlockIndex, createSessionForBlock]); // createSessionForBlock from store

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

  const handleTreeTestingSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock();
  };

  const handleCardSortingSubmit = async (answer: any, durationMs: number) => {
    if (!studyData) return;
    const currentBlock = studyData.blocks[currentBlockIndex];
    if (!currentBlock) return;
    await submitBlockResponse(currentBlock.id, answer, durationMs);
    await handleNextBlock();
  };

  // Рендеринг

  if (studyRunLoading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: "18px", color: "#666" }}>Загрузка теста...</div>;
  }

  if (studyRunError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px" }}>
        <div style={{ maxWidth: "500px", padding: "24px", background: "#ffebee", color: "#c62828", borderRadius: "8px", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 16px 0" }}>Ошибка</h2>
          <p style={{ margin: 0 }}>{studyRunError}</p>
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
      ) : currentBlock.type === "card_sorting" ? (
        <CardSortingBlock
          config={currentBlock.config}
          onSubmit={handleCardSortingSubmit}
        />
      ) : currentBlock.type === "tree_testing" ? (
        <TreeTestingBlock
          config={currentBlock.config}
          onSubmit={handleTreeTestingSubmit}
          onSkip={handleNextBlock}
        />
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
