# React Code Audit Report

**Date:** 2026-01-26  
**Scope:** figma-analytics и figma-viewer проекты  
**Rules Source:** `.cursor/data/react.csv`

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ (High Severity)

### Rule 7: Specify dependencies correctly (High)
**Файл:** `figma-analytics/src/components/StudyResultsTab.tsx`  
**Строка:** 173-182

**Проблема:**
```typescript
useEffect(() => {
  if (selectedRuns.size > 0) {
    loadSessionsAndEvents();  // ❌ Функция не в зависимостях
    loadResponses();          // ❌ Функция не в зависимостях
  } else {
    setSessions([]);
    setEvents([]);
    setResponses([]);
  }
}, [selectedRuns, studyId]); // ❌ Отсутствуют loadSessionsAndEvents и loadResponses
```

**Решение:**
Обернуть `loadSessionsAndEvents` и `loadResponses` в `useCallback` или добавить их в зависимости. Рекомендуется использовать `useCallback` для стабильности ссылок.

**Код исправления:**
```typescript
const loadSessionsAndEvents = useCallback(async () => {
  // ... существующий код
}, [selectedRuns, studyId]);

const loadResponses = useCallback(async () => {
  // ... существующий код
}, [selectedRuns]);

useEffect(() => {
  if (selectedRuns.size > 0) {
    loadSessionsAndEvents();
    loadResponses();
  } else {
    setSessions([]);
    setEvents([]);
    setResponses([]);
  }
}, [selectedRuns, studyId, loadSessionsAndEvents, loadResponses]);
```

---

### Rule 10: Use keys properly (High)
**Файлы:**
- `figma-analytics/src/components/StudyResultsTab.tsx` (строки 2854, 3742, 3860)
- `figma-viewer/src/StudyRunView.tsx` (строки 382, 520, 722)

**Проблема:**
Использование индексов массива в качестве ключей для динамических списков.

**Примеры:**
```typescript
// ❌ Плохо
{clicks.map((c, i) => (
  <div key={i}>...</div>
))}

{sessionClicks.map((click, idx) => (
  <div key={idx}>...</div>
))}

{shuffledOptions.map((option, i) => (
  <button key={i}>...</button>
))}
```

**Решение:**
Использовать стабильные уникальные идентификаторы. Если объекты не имеют ID, создать составной ключ или использовать стабильные свойства.

**Код исправления:**
```typescript
// ✅ Хорошо - для кликов используем координаты + индекс как составной ключ
{clicks.map((c, i) => (
  <div key={`click-${c.x}-${c.y}-${i}`}>...</div>
))}

// ✅ Хорошо - для опций используем значение опции
{shuffledOptions.map((option, i) => (
  <button key={typeof option === 'string' ? option : `option-${i}-${option.id || option.value}`}>...</button>
))}
```

---

### Rule 40: Handle async errors (High)
**Файл:** `figma-viewer/src/StudyRunView.tsx`  
**Строка:** 2360-2379

**Проблема:**
Асинхронная функция `loadResponses` внутри `useEffect` не имеет обработки ошибок.

```typescript
useEffect(() => {
  if (!runId) return;
  
  const loadResponses = async () => {
    const { data, error } = await supabase
      .from("study_block_responses")
      .select("block_id, answer")
      .eq("run_id", runId);
    
    if (!error && data) {
      // ... обработка данных
    }
    // ❌ Нет обработки ошибки
  };
  
  loadResponses();
}, [runId]);
```

**Решение:**
Добавить обработку ошибок в async функцию.

**Код исправления:**
```typescript
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
```

---

## 🟡 СРЕДНИЕ ПРОБЛЕМЫ (Medium Severity)

### Rule 14: Avoid inline object/array creation in JSX (Medium)
**Файл:** `figma-viewer/src/StudyRunView.tsx`  
**Множественные места:** строки 32, 48, 61, 86, 96, 382, 520, 722, 766-772, 780

**Проблема:**
Создание объектов стилей непосредственно в JSX создает новые объекты при каждом рендере.

**Примеры:**
```typescript
// ❌ Плохо
<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
<button style={{ padding: "14px 32px", background: "#007AFF", color: "white" }}>
```

**Решение:**
Вынести стили в константы вне компонента или использовать CSS классы (Tailwind уже используется в проекте).

**Код исправления:**
```typescript
// ✅ Хорошо - использовать Tailwind классы
<div className="flex flex-col items-center justify-center">
<button className="px-8 py-3.5 bg-blue-600 text-white rounded-lg">

// Или вынести в константы
const modalStyles = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "20px",
  background: "#f5f5f7"
};
```

---

### Rule 12: Memoize callbacks passed to children (Medium)
**Файл:** `figma-analytics/src/components/StudyResultsTab.tsx`  
**Строка:** 197-420

**Проблема:**
Функции `loadRuns`, `loadSessionsAndEvents`, `loadResponses` определены внутри компонента без `useCallback`, что создает новые ссылки при каждом рендере.

**Решение:**
Обернуть функции в `useCallback` с правильными зависимостями.

**Код исправления:**
```typescript
const loadRuns = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    // ... существующий код
  } catch (err) {
    console.error("Unexpected error loading runs:", err);
    setError(err instanceof Error ? err.message : "Ошибка загрузки");
  } finally {
    setLoading(false);
  }
}, [studyId]);

const loadSessionsAndEvents = useCallback(async () => {
  // ... существующий код
}, [selectedRuns, studyId, blocks]);

const loadResponses = useCallback(async () => {
  // ... существующий код
}, [selectedRuns]);
```

---

### Rule 11: Memoize expensive calculations (Medium)
**Файл:** `figma-analytics/src/components/StudyResultsTab.tsx`  
**Множественные места:** вычисления статистики, фильтрации, сортировки

**Проблема:**
Вычисления статистики и фильтрации выполняются при каждом рендере без мемоизации.

**Примеры:**
- Подсчет `cellCounts` в MatrixView (строка ~1257)
- Подсчет `optionCounts` в ChoiceView (строка ~1054)
- Фильтрация `blocksWithResponses` в AllBlocksReportView (строка ~3964)

**Решение:**
Использовать `useMemo` для дорогих вычислений.

**Код исправления:**
```typescript
// В MatrixView
const cellCounts = useMemo(() => {
  const counts: Record<string, Record<string, number>> = {};
  responses.forEach(r => {
    // ... логика подсчета
  });
  return counts;
}, [responses, rows, columns]);

// В AllBlocksReportView
const blocksWithResponses = useMemo(() => {
  return blocks.filter(block => {
    if (block.type === "prototype") {
      return sessions.some(s => s.block_id === block.id);
    } else {
      return responses.some(r => r.block_id === block.id);
    }
  });
}, [blocks, sessions, responses]);
```

---

## 🟢 НИЗКИЕ ПРОБЛЕМЫ (Low Severity)

### Rule 14: Inline styles (Low)
**Файл:** `figma-analytics/src/components/StudyResultsTab.tsx`  
**Строки:** 1032, 1136, 1258, 1925

**Проблема:**
Использование inline стилей для динамических значений (width в процентах).

**Примечание:**
Это допустимо для динамических значений, но можно улучшить, используя CSS переменные или Tailwind утилиты.

---

### Rule 18: Use fragments to avoid extra DOM (Low)
**Файл:** `figma-analytics/src/components/StudyResultsTab.tsx`  
**Множественные места**

**Статус:** ✅ Хорошо - фрагменты используются правильно (`<>...</>`)

---

## ✅ ПОЛОЖИТЕЛЬНЫЕ МОМЕНТЫ

1. **Rule 6: Clean up effects** ✅
   - `ImageModal` в `StudyRunView.tsx` правильно очищает event listeners (строка 27)
   - `FiveSecondsBlock` правильно очищает таймер (строка 761)

2. **Rule 22: Validate props with TypeScript** ✅
   - Все компоненты используют TypeScript интерфейсы для пропсов
   - Примеры: `StudyResultsTabProps`, `BlockReportViewProps`, `OpenQuestionViewProps`

3. **Rule 47: Type component props** ✅
   - Все пропсы типизированы через интерфейсы

4. **Rule 48: Type state properly** ✅
   - `useState` используется с типами: `useState<StudyRun[]>([])`, `useState<string | null>(null)`

5. **Rule 29: Follow rules of hooks** ✅
   - Хуки вызываются только на верхнем уровне компонентов

6. **Zustand Store** ✅
   - Store файлы правильно структурированы
   - Используются типизированные интерфейсы
   - Actions правильно определены
   - Store правильно разделен по доменам (auth, studies, analytics, etc.)
   - Используется devtools middleware для отладки

7. **Rule 34: Memoize context values** ✅
   - Zustand store не использует Context API, что исключает проблемы с мемоизацией значений контекста
   - Store функции стабильны благодаря архитектуре Zustand

---

## ⚠️ ДОПОЛНИТЕЛЬНЫЕ ЗАМЕЧАНИЯ

### Zustand Store в useEffect

**Файлы:**
- `figma-analytics/src/App.tsx` (строка 20-29)
- `figma-viewer/src/StudyRunView.tsx` (строка 2349-2357)

**Статус:** ✅ Приемлемо
- Функции из Zustand store стабильны благодаря архитектуре библиотеки
- Использование `eslint-disable-next-line react-hooks/exhaustive-deps` с комментарием объясняет решение
- Это стандартная практика для Zustand

**Примечание:** Если в будущем функции из store будут зависеть от других значений, их нужно будет добавить в зависимости или использовать селекторы.

---

## 📊 СТАТИСТИКА

**Всего проверено файлов:**
- TSX файлов: 35
- Store файлов: 10

**Найдено проблем:**
- 🔴 Критические (High): 3
- 🟡 Средние (Medium): 3
- 🟢 Низкие (Low): 2

**Положительные моменты:** 6

---

## 🎯 РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТАМ

1. **Высокий приоритет:**
   - Исправить зависимости useEffect в `StudyResultsTab.tsx` (Rule 7)
   - Заменить индексы на стабильные ключи (Rule 10)
   - Добавить обработку ошибок в async функции (Rule 40)

2. **Средний приоритет:**
   - Мемоизировать функции через useCallback (Rule 12)
   - Мемоизировать дорогие вычисления через useMemo (Rule 11)
   - Вынести inline стили в константы или использовать Tailwind (Rule 14)

3. **Низкий приоритет:**
   - Оптимизировать использование inline стилей для динамических значений

---

## 📝 ЗАМЕТКИ

- Zustand store файлы соответствуют лучшим практикам
- TypeScript используется правильно во всех компонентах
- Обработка ошибок присутствует в большинстве async операций, но есть пропуски
- Проект использует современные React паттерны (hooks, функциональные компоненты)

---

**Аудит проведен согласно правилам из `.cursor/data/react.csv`**
