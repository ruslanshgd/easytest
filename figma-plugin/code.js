// ===== MAIN CODE (Figma plugin) =====
// Текущая конфигурация (будет загружена из clientStorage)
// При первом запуске все значения пустые - показывается форма онбординга
let CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  VIEWER_URL: "",
  ANALYTICS_URL: "",
  ACCESS_TOKEN: ""
};

figma.showUI(__html__, { width: 400, height: 500 });

// Загружаем сохраненную конфигурацию из clientStorage
(async () => {
  try {
    const savedConfig = await figma.clientStorage.getAsync("pluginConfig");
    if (savedConfig && savedConfig.SUPABASE_URL && savedConfig.SUPABASE_ANON_KEY && savedConfig.VIEWER_URL) {
      CONFIG = {
        SUPABASE_URL: savedConfig.SUPABASE_URL || "",
        SUPABASE_ANON_KEY: savedConfig.SUPABASE_ANON_KEY || "",
        VIEWER_URL: savedConfig.VIEWER_URL || "",
        ANALYTICS_URL: savedConfig.ANALYTICS_URL || "",
        ACCESS_TOKEN: savedConfig.ACCESS_TOKEN || ""
      };
      console.log("Loaded config from storage:", CONFIG);
    } else {
      console.log("No saved config found, showing onboarding");
      // CONFIG остается с пустыми значениями - покажется форма онбординга
    }
  } catch (error) {
    console.log("No saved config found, showing onboarding");
    // CONFIG остается с пустыми значениями - покажется форма онбординга
  }
  
  // Отправляем конфигурацию в UI
  figma.ui.postMessage({
    type: "CONFIG",
    config: CONFIG
  });
})();

// Обработка сообщений от UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === "SAVE_CONFIG") {
    try {
      // Сохраняем конфигурацию в clientStorage
      await figma.clientStorage.setAsync("pluginConfig", msg.config);
      CONFIG = {
        SUPABASE_URL: msg.config.SUPABASE_URL || "",
        SUPABASE_ANON_KEY: msg.config.SUPABASE_ANON_KEY || "",
        VIEWER_URL: msg.config.VIEWER_URL || "",
        ANALYTICS_URL: msg.config.ANALYTICS_URL || "",
        ACCESS_TOKEN: msg.config.ACCESS_TOKEN || ""
      };
      console.log("Config saved:", CONFIG);
      
      // Отправляем обновленную конфигурацию обратно в UI
      figma.ui.postMessage({
        type: "CONFIG",
        config: CONFIG
      });
      
      figma.notify("✓ Настройки сохранены!");
    } catch (error) {
      console.error("Error saving config:", error);
      figma.notify("❌ Ошибка сохранения настроек");
    }
  }
  
  if (msg.type === "RESET_CONFIG") {
    try {
      // Удаляем сохраненную конфигурацию
      await figma.clientStorage.deleteAsync("pluginConfig");
      CONFIG = {
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: "",
        VIEWER_URL: "",
        ANALYTICS_URL: "",
        ACCESS_TOKEN: ""
      };
      console.log("Config reset - showing onboarding:", CONFIG);
      
      // Отправляем пустую конфигурацию в UI (чтобы показать форму онбординга)
      figma.ui.postMessage({
        type: "CONFIG",
        config: {
          SUPABASE_URL: "",
          SUPABASE_ANON_KEY: "",
          VIEWER_URL: "",
          ANALYTICS_URL: "",
          ACCESS_TOKEN: ""
        }
      });
      
      figma.notify("✓ Настройки сброшены!");
    } catch (error) {
      console.error("Error resetting config:", error);
      figma.notify("❌ Ошибка сброса настроек");
    }
  }
  
  if (msg.type === "OPEN_AUTH") {
    // Открываем браузер для авторизации
    console.log("Opening external URL:", msg.url);
    try {
      figma.openExternal(msg.url);
      console.log("Successfully opened external URL");
      figma.notify("✓ Открываю Analytics в браузере...");
    } catch (error) {
      console.error("Error opening external URL:", error);
      figma.notify("❌ Ошибка при открытии браузера");
    }
  }
};

async function run() {
  // Найти все фреймы
  const frames = figma.currentPage.findAll((n) => n.type === "FRAME");

  if (!frames || frames.length === 0) {
    figma.notify("No frames found on this page.");
    return;
  }

  // Функция проверки: является ли фрейм топ-уровневым (прямым ребенком страницы)
  function isTopLevelFrame(frame) {
    return frame.parent && frame.parent.type === "PAGE";
  }

  // Собираем граф навигации один раз для анализа стартового и финального фреймов
  // incomingTargets = фреймы, на которые ведут хотспоты (имеют входящие edges)
  // framesWithOutgoing = фреймы, из которых есть исходящие хотспоты
  const incomingTargets = new Set();
  const framesWithOutgoing = new Set();
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);
    
    for (let j = 0; j < interactiveNodes.length; j++) {
      const node = interactiveNodes[j];
      for (let k = 0; k < node.reactions.length; k++) {
        const reaction = node.reactions[k];
        const target = reaction && reaction.action && reaction.action.destinationId
          ? reaction.action.destinationId
          : null;
        
        if (target) {
          incomingTargets.add(target); // Этот фрейм является целевым (имеет входящие edges)
          framesWithOutgoing.add(frame.id); // Этот фрейм имеет исходящие хотспоты
        }
      }
    }
  }

  // Стартовый фрейм: приоритет определения (только топ-уровневые фреймы)
  let startFrame = null;
  
  // 1. Проверяем выделенный фрейм (если он есть и является топ-уровневым фреймом)
  const sel = figma.currentPage.selection;
  if (sel && sel.length > 0 && sel[0].type === "FRAME" && isTopLevelFrame(sel[0])) {
    startFrame = sel[0];
    console.log("Using selected frame as start:", startFrame.name);
  }
  
  // 2. Если нет выделенного, ищем топ-уровневый фрейм с маркером [start] или [begin]
  if (!startFrame) {
    startFrame = frames.find((f) => {
      if (!isTopLevelFrame(f)) return false;
      const name = f.name.toLowerCase();
      return name.includes("[start]") || name.includes("[begin]");
    });
    if (startFrame) {
      console.log("Using [start] marked frame as start:", startFrame.name);
    }
  }
  
  // 3. Если не нашли по маркеру, используем граф навигации (только топ-уровневые):
  // Стартовый фрейм = топ-уровневый фрейм БЕЗ входящих edges, НО с исходящими хотспотами
  if (!startFrame) {
    startFrame = frames.find((f) => {
      if (!isTopLevelFrame(f)) return false;
      // Фрейм не является целевым для других фреймов (нет входящих edges)
      const hasNoIncoming = !incomingTargets.has(f.id);
      // Фрейм имеет исходящие хотспоты (есть взаимодействия)
      const hasOutgoing = framesWithOutgoing.has(f.id);
      return hasNoIncoming && hasOutgoing;
    });
    if (startFrame) {
      console.log("Using frame without incoming edges but with outgoing hotspots as start:", startFrame.name);
    }
  }
  
  // 4. Если не нашли по графу, ищем топ-уровневый фрейм БЕЗ входящих edges
  if (!startFrame) {
    startFrame = frames.find((f) => {
      return isTopLevelFrame(f) && !incomingTargets.has(f.id);
    });
    if (startFrame) {
      console.log("Using frame without incoming edges as start:", startFrame.name);
    }
  }
  
  // 5. Если все еще не нашли, ищем топ-уровневый "Frame 1" или фрейм с номером 1 в названии
  if (!startFrame) {
    startFrame = frames.find((f) => {
      if (!isTopLevelFrame(f)) return false;
      const name = f.name.trim();
      return /frame\s*1\b/i.test(name) || /^1\b/i.test(name);
    });
    if (startFrame) {
      console.log("Using Frame 1 as start:", startFrame.name);
    }
  }
  
  // 6. Последний fallback: сортируем топ-уровневые фреймы по имени и берем первый
  if (!startFrame) {
    const topLevelFrames = frames.filter(isTopLevelFrame);
    const sortedFrames = topLevelFrames.slice().sort((a, b) => {
      const nameA = a.name.trim().toLowerCase();
      const nameB = b.name.trim().toLowerCase();
      
      // Извлекаем числа из названий для сортировки
      const matchA = nameA.match(/\d+/);
      const matchB = nameB.match(/\d+/);
      const numA = matchA ? parseInt(matchA[0]) : 999;
      const numB = matchB ? parseInt(matchB[0]) : 999;
      
      if (numA !== numB) {
        return numA - numB;
      }
      
      // Если числа одинаковые или отсутствуют, сортируем по алфавиту
      return nameA.localeCompare(nameB);
    });
    
    if (sortedFrames.length > 0) {
      startFrame = sortedFrames[0];
      console.log("Using first frame by name order as start (fallback):", startFrame.name);
    }
  }

  // Финальный фрейм: ищем по маркеру [final] в названии (только топ-уровневые фреймы)
  let endFrame = frames.find((f) => {
    if (!isTopLevelFrame(f)) return false;
    const name = f.name.trim();
    // Поддерживаем разные варианты: "[final]", "[FINAL]", "frame 4 [final]", "frame4[final]" и т.д.
    // Используем регулярное выражение для гибкого поиска
    return /\[final\]/i.test(name) || /\[end\]/i.test(name);
  });
  
  if (endFrame) {
    console.log("Found end frame by marker:", endFrame.name);
  }

  // Если не нашли по маркеру, определяем автоматически (только топ-уровневые):
  // финальный экран - это топ-уровневый экран, на который ведут хотспоты, но из которого нет исходящих
  if (!endFrame) {
    console.log("End frame not found by marker, using graph analysis...");
    // Используем уже собранный граф навигации (incomingTargets и framesWithOutgoing)

    // Финальный экран - это топ-уровневый экран, который является целевым, но не имеет исходящих хотспотов
    endFrame = frames.find((f) => {
      return isTopLevelFrame(f) && incomingTargets.has(f.id) && !framesWithOutgoing.has(f.id);
    });

    if (endFrame) {
      console.log("Found end frame by graph analysis (target without outgoing):", endFrame.name);
    }

    // Если не нашли, ищем топ-уровневый экран без исходящих хотспотов
    if (!endFrame) {
      endFrame = frames.find((f) => {
        return isTopLevelFrame(f) && !framesWithOutgoing.has(f.id);
      });
      
      if (endFrame) {
        console.log("Found end frame by graph analysis (no outgoing hotspots):", endFrame.name);
      }
    }

    // Если все топ-уровневые экраны имеют исходящие хотспоты, используем последний топ-уровневый как fallback
    if (!endFrame) {
      const topLevelFrames = frames.filter(isTopLevelFrame);
      if (topLevelFrames.length > 0) {
        endFrame = topLevelFrames[topLevelFrames.length - 1];
        console.log("Using last top-level frame as end (fallback):", endFrame.name);
        figma.notify("⚠️ Финальный экран не найден автоматически. Используется последний топ-уровневый фрейм. Добавьте [final] в название финального фрейма для точности.");
      }
    }
  }

  // Фильтрация основных экранов прототипа (исключаем вложенные фреймы)
  // Основные экраны - это ТОП-УРОВНЕВЫЕ фреймы (прямые дети страницы), которые:
  // 1. Стартовый и финальный фреймы
  // 2. Фреймы, участвующие в навигации (целевые или имеющие исходящие хотспоты)
  const mainScreenIds = new Set();
  
  // Добавляем стартовый и финальный фреймы (только если они топ-уровневые)
  if (startFrame && isTopLevelFrame(startFrame)) {
    mainScreenIds.add(startFrame.id);
    console.log("Added start frame to main screens:", startFrame.name);
  }
  if (endFrame && isTopLevelFrame(endFrame)) {
    mainScreenIds.add(endFrame.id);
    console.log("Added end frame to main screens:", endFrame.name);
  }
  
  // Добавляем только топ-уровневые фреймы, которые участвуют в навигации
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    // Проверяем, что фрейм топ-уровневый И участвует в навигации
    if (isTopLevelFrame(frame)) {
      if (incomingTargets.has(frame.id) || framesWithOutgoing.has(frame.id)) {
        mainScreenIds.add(frame.id);
      }
    }
  }
  
  // Фильтруем frames - оставляем только основные экраны
  const mainFrames = frames.filter(frame => mainScreenIds.has(frame.id));
  
  console.log("Filtered frames: " + frames.length + " total -> " + mainFrames.length + " main screens");
  console.log("Main screens:");
  mainFrames.forEach(function(frame, idx) {
    var isStart = (startFrame && frame.id === startFrame.id) ? " [START]" : "";
    var isEnd = (endFrame && frame.id === endFrame.id) ? " [END]" : "";
    console.log("  " + (idx + 1) + ". " + frame.name + isStart + isEnd);
  });
  
  if (frames.length > mainFrames.length) {
    const filteredOut = frames.filter(frame => !mainScreenIds.has(frame.id));
    // Убираем дубликаты названий для более читаемого вывода
    const uniqueFilteredNames = Array.from(new Set(filteredOut.map(function(f) { return f.name || "Unnamed"; })));
    console.log("Filtered out nested frames: " + filteredOut.length + " (" + uniqueFilteredNames.length + " unique names)");
    if (uniqueFilteredNames.length <= 20) {
      console.log("  Examples: " + uniqueFilteredNames.slice(0, 10).join(", ") + (uniqueFilteredNames.length > 10 ? "..." : ""));
    }
  }

  // Собрать screens только из основных фреймов
  const screens = [];
  for (let i = 0; i < mainFrames.length; i++) {
    const frame = mainFrames[i];
    const bytes = await frame.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 }
    });
    
    const base64 = figma.base64Encode(bytes);

    screens.push({
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      image: "data:image/png;base64," + base64
    });
  }

  // Hotspots + edges
  const hotspots = [];
  const edges = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);

    for (let j = 0; j < interactiveNodes.length; j++) {
      const node = interactiveNodes[j];
      const absX = node.absoluteTransform[0][2];
      const absY = node.absoluteTransform[1][2];

      const frameX = frame.absoluteTransform[0][2];
      const frameY = frame.absoluteTransform[1][2];

      const x = absX - frameX;
      const y = absY - frameY;
      const w = node.width;
      const h = node.height;

      for (let k = 0; k < node.reactions.length; k++) {
        const reaction = node.reactions[k];

        const trigger =
          reaction && reaction.trigger && reaction.trigger.type
            ? reaction.trigger.type
            : null;
        const target =
          reaction && reaction.action && reaction.action.destinationId
            ? reaction.action.destinationId
            : null;

        hotspots.push({
          id: node.id,
          name: node.name || node.id, // Добавляем название элемента
          frame: frame.id,
          trigger,
          x,
          y,
          w,
          h,
          target
        });

        if (target) {
          edges.push({
            from: frame.id,
            to: target,
            id: node.id,
            trigger
          });
        }
      }
    }
  }

  const targets = Array.from(
    new Set(
      hotspots
        .map(function (h) { return h.target; })
        .filter(function (t) { return !!t; })
    )
  );

  const output = {
    protoVersion: "v1",
    start: startFrame.id,
    end: endFrame.id,
    screens: screens,
    hotspots: hotspots,
    edges: edges,
    targets: targets
  };

  // Отправляем информацию о выбранных фреймах в UI
  const endFrameFoundByMarker = /\[final\]/i.test(endFrame.name) || /\[end\]/i.test(endFrame.name);
  
  if (!endFrameFoundByMarker) {
    figma.notify("💡 Совет: Добавьте [final] в название финального фрейма для точного определения. Сейчас используется: " + endFrame.name);
  }

  figma.ui.postMessage({ 
    type: "EXPORT_JSON", 
    data: output,
    info: {
      startFrameName: startFrame.name,
      endFrameName: endFrame.name,
      endFrameId: endFrame.id,
      endFrameFoundByMarker: endFrameFoundByMarker
    }
  });
}

run();
