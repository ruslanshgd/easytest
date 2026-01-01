// ===== MAIN CODE (Figma plugin) =====
// Текущая конфигурация (будет загружена из clientStorage)
// При первом запуске все значения пустые - показывается форма онбординга
let CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  VIEWER_URL: "",
  ANALYTICS_URL: "",
  ACCESS_TOKEN: "",
  FIGMA_ACCESS_TOKEN: ""
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
        ACCESS_TOKEN: savedConfig.ACCESS_TOKEN || "",
        FIGMA_ACCESS_TOKEN: savedConfig.FIGMA_ACCESS_TOKEN || ""
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
        ACCESS_TOKEN: msg.config.ACCESS_TOKEN || "",
        FIGMA_ACCESS_TOKEN: msg.config.FIGMA_ACCESS_TOKEN || ""
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
        ACCESS_TOKEN: "",
        FIGMA_ACCESS_TOKEN: ""
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
          ACCESS_TOKEN: "",
          FIGMA_ACCESS_TOKEN: ""
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
  
  if (msg.type === "GET_STARTING_POINTS") {
    // Получаем starting points (flows) через Plugin API
    // Согласно документации: page.flowStartingPoints - это массив { nodeId: string; name: string }
    // https://developers.figma.com/docs/plugins/api/properties/PageNode-flowstartingpoints/
    try {
      console.log("Getting starting points via Plugin API (using page.flowStartingPoints)");
      
      // ВАЖНО: Ищем flows на ВСЕХ страницах файла
      const startingPoints = [];
      
      // ВАЖНО: Загружаем все страницы перед использованием свойств
      // При documentAccess: dynamic-page страницы не загружаются автоматически
      await figma.loadAllPagesAsync();
      console.log("All pages loaded");
      
      // Получаем все страницы в файле через figma.root.children
      const allPages = figma.root.children.filter((n) => n.type === "PAGE");
      console.log("Total pages in file:", allPages.length);
      
      // Обходим все страницы и собираем flows из page.flowStartingPoints
      for (const page of allPages) {
        console.log(`Checking page: "${page.name}"`);
        
        // Используем page.flowStartingPoints (ReadonlyArray<{ nodeId: string; name: string }>)
        // Это правильный способ получения flows согласно документации Figma
        const pageFlows = page.flowStartingPoints;
        console.log(`  Found ${pageFlows.length} flow(s) on page "${page.name}"`);
        
        // Добавляем все flows с этой страницы
        pageFlows.forEach(flow => {
          // Проверяем, не дубликат ли это (flows могут быть на разных страницах с одинаковыми nodeId)
          const existing = startingPoints.find(sp => sp.nodeId === flow.nodeId);
          if (!existing) {
            startingPoints.push({
              nodeId: flow.nodeId,
              name: flow.name || `Flow ${startingPoints.length + 1}`
            });
            console.log(`  ✓ Added flow: "${flow.name}" (${flow.nodeId}) from page "${page.name}"`);
          } else {
            console.log(`  ⊙ Skipped duplicate flow: "${flow.name}" (${flow.nodeId})`);
          }
        });
      }
      
      console.log("Found starting points via Plugin API:", startingPoints.length, startingPoints);
      
      // Отправляем starting points в UI
      figma.ui.postMessage({
        type: "STARTING_POINTS",
        data: startingPoints
      });
      
    } catch (error) {
      console.error("Error getting starting points:", error);
      figma.ui.postMessage({
        type: "STARTING_POINTS_ERROR",
        error: error.message
      });
    }
  }
  
  if (msg.type === "FETCH_FIGMA_FILE") {
    // Получаем данные файла через REST API из code.js (обход CSP)
    try {
      const fileKey = msg.fileKey;
      const figmaToken = CONFIG.FIGMA_ACCESS_TOKEN || msg.figmaToken;
      
      if (!figmaToken) {
        figma.ui.postMessage({
          type: "FIGMA_FILE_FETCH_ERROR",
          error: "Figma Personal Access Token не указан. Добавьте его в настройках."
        });
        return;
      }
      
      console.log("Fetching Figma file data via REST API, fileKey:", fileKey);
      
      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
        headers: {
          'X-Figma-Token': figmaToken
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`REST API error: ${response.status} - ${errorText}`);
      }
      
      const fileData = await response.json();
      
      // Отправляем данные обратно в UI
      figma.ui.postMessage({
        type: "FIGMA_FILE_FETCHED",
        fileData: fileData
      });
      
    } catch (error) {
      console.error("Error fetching Figma file data:", error);
      figma.ui.postMessage({
        type: "FIGMA_FILE_FETCH_ERROR",
        error: error.message
      });
    }
  }
  
  if (msg.type === "GENERATE_FROM_REST_API") {
    // Генерируем прототип из данных REST API
    try {
      const fileData = msg.fileData;
      const selectedFlowId = msg.selectedFlowId;
      
      console.log("Generating prototype from REST API data, flow ID:", selectedFlowId);
      
      // Запускаем генерацию прототипа из REST API данных
      await generateFromRESTAPI(fileData, selectedFlowId);
      
    } catch (error) {
      console.error("Error generating from REST API:", error);
      figma.notify("❌ Ошибка генерации из REST API: " + error.message);
    }
  }
};

// Функция для парсинга overlay action из reaction
// Поддерживает как Plugin API, так и REST API структуры
// overlayFrame - опциональный фрейм-оверлей, из которого можно прочитать overlayPositionType, overlayBackground, overlayBackgroundInteraction
function parseOverlayAction(reaction, overlayFrame) {
  // ОТЛАДКА: Логируем входные данные
  console.log("parseOverlayAction: Input", {
    hasReaction: !!reaction,
    hasAction: !!(reaction && reaction.action),
    reaction: reaction,
    action: reaction && reaction.action ? reaction.action : null,
    actionType: reaction && reaction.action && reaction.action.type ? reaction.action.type : null
  });
  
  if (!reaction || !reaction.action) {
    console.log("parseOverlayAction: No reaction or action, returning null");
    return null;
  }
  
  const action = reaction.action;
  const actionType = action.type || null;
  const navigation = action.navigation || null;
  
  console.log("parseOverlayAction: Checking actionType and navigation", {
    actionType: actionType,
    navigation: navigation,
    isNodeWithOverlay: actionType === "NODE" && navigation === "OVERLAY",
    isNodeWithSwap: actionType === "NODE" && navigation === "SWAP",
    isClose: actionType === "CLOSE",
    isOpenOverlay: actionType === "OPEN_OVERLAY",
    isSwapOverlay: actionType === "SWAP_OVERLAY",
    isCloseOverlay: actionType === "CLOSE_OVERLAY", // Старый формат для обратной совместимости
    fullAction: action // Полный объект action для отладки
  });
  
  // ВАЖНО: В Figma Plugin API действие "CLOSE" определено как action.type === "CLOSE"
  // Согласно документации: https://developers.figma.com/docs/plugins/api/Action/#close-action
  // "This action closes the current topmost overlay (applicable only on overlays)."
  // Также поддерживаем старый формат CLOSE_OVERLAY для обратной совместимости
  let overlayType = null;
  let overlayId = null;
  
  // ВАЖНО: Проверяем CLOSE ПЕРЕД другими проверками, так как это не требует overlayId
  // Согласно Figma API: action.type === "CLOSE" закрывает текущий overlay
  if (actionType === "CLOSE" || actionType === "CLOSE_OVERLAY") {
    // Figma Plugin API формат (CLOSE) или старый формат (CLOSE_OVERLAY для обратной совместимости)
    console.log("parseOverlayAction: Parsed CLOSE action", {
      actionType: actionType,
      format: actionType === "CLOSE" ? "PLUGIN_API" : "LEGACY"
    });
    return {
      type: "CLOSE_OVERLAY" // Используем внутреннее представление "CLOSE_OVERLAY" для viewer
    };
  } else if (actionType === "NODE" && navigation === "OVERLAY") {
    // Figma Plugin API формат: NODE с navigation === "OVERLAY"
    overlayType = "OPEN_OVERLAY";
    overlayId = action.destinationId || null;
  } else if (actionType === "NODE" && navigation === "SWAP") {
    // Figma Plugin API формат: NODE с navigation === "SWAP"
    overlayType = "SWAP_OVERLAY";
    overlayId = action.destinationId || null;
  } else if (actionType === "OPEN_OVERLAY" || actionType === "SWAP_OVERLAY") {
    // REST API формат (старый)
    overlayType = actionType;
    overlayId = action.overlayId || action.destinationId || null;
  }
  
  if (overlayType && overlayId) {
    // Парсим позицию overlay
    // ВАЖНО: overlayPositionType - это свойство overlay-фрейма, а не action
    // Приоритет - сначала overlayFrame (свойства overlay-фрейма), потом action (для обратной совместимости)
    let position = "CENTER"; // По умолчанию CENTER (не CENTERED!)
    let positionX = null;
    let positionY = null;
    
    // ВАЖНО: Сначала проверяем overlayFrame (свойства overlay-фрейма имеют приоритет)
    if (overlayFrame && overlayFrame.overlayPositionType) {
      // Читаем из свойств overlay-фрейма (основной источник)
      position = overlayFrame.overlayPositionType;
      console.log("parseOverlayAction: Using overlayPositionType from overlay frame", position);
      
      // ВАЖНО: Если позиция MANUAL, координаты должны быть в action.overlayRelativePosition
      // Согласно документации Figma, для MANUAL позиции координаты хранятся в action, а не в overlay-фрейме
      if (position === "MANUAL") {
        // Пробуем прочитать координаты из разных источников
        if (action.overlayRelativePosition) {
          positionX = action.overlayRelativePosition.x;
          positionY = action.overlayRelativePosition.y;
          console.log("parseOverlayAction: Using overlayRelativePosition from action for MANUAL position", { positionX, positionY });
        } else if (action.overlayPosition && typeof action.overlayPosition === "object" && action.overlayPosition.x !== undefined && action.overlayPosition.y !== undefined) {
          // Возможен вариант, когда координаты в action.overlayPosition как объект {x, y}
          positionX = action.overlayPosition.x;
          positionY = action.overlayPosition.y;
          console.log("parseOverlayAction: Using overlayPosition object from action for MANUAL position", { positionX, positionY });
        } else {
          console.warn("parseOverlayAction: MANUAL position but no coordinates found in action", {
            hasOverlayRelativePosition: !!action.overlayRelativePosition,
            overlayRelativePosition: action.overlayRelativePosition,
            overlayPosition: action.overlayPosition
          });
        }
      }
    } else if (action.overlayRelativePosition) {
      // Fallback: проверяем overlayRelativePosition в action (для MANUAL позиции)
      position = "MANUAL";
      positionX = action.overlayRelativePosition.x;
      positionY = action.overlayRelativePosition.y;
      console.log("parseOverlayAction: Using overlayRelativePosition from action (fallback)", { positionX, positionY });
    } else if (action.overlayPosition) {
      // Fallback: может быть строка типа "CENTER", "TOP_LEFT" и т.д.
      position = action.overlayPosition;
      console.log("parseOverlayAction: Using overlayPosition from action (fallback)", position);
    }
    
    // Нормализуем позицию: CENTER -> CENTERED для совместимости с viewer
    if (position === "CENTER") {
      position = "CENTERED";
    }
    
    // Парсим background overlay
    // ВАЖНО: Согласно документации Figma, overlayBackground - это свойство overlay-фрейма, а не action
    // overlayBackground может быть type: "NONE" или type: "SOLID_COLOR"
    // Если overlayBackground отсутствует или type === "NONE", фон не показывается
    // См. https://developers.figma.com/docs/plugins/api/Overlay/#overlay-background
    // ВАЖНО: Приоритет - сначала overlayFrame (свойства overlay-фрейма), потом action (для обратной совместимости)
    let background = false; // По умолчанию false (без фона)
    let backgroundColor = "000000"; // По умолчанию черный (если фон включен)
    let backgroundOpacity = 70; // По умолчанию 70% (если фон включен)
    
    // ВАЖНО: Сначала проверяем overlayFrame (свойства overlay-фрейма имеют приоритет), потом action (для обратной совместимости)
    let overlayBackgroundToUse = null;
    if (overlayFrame && overlayFrame.overlayBackground) {
      // Читаем из свойств overlay-фрейма (основной источник)
      overlayBackgroundToUse = overlayFrame.overlayBackground;
      console.log("parseOverlayAction: Using overlayBackground from overlay frame", overlayBackgroundToUse);
    } else if (action.overlayBackground) {
      // Fallback: читаем из action (для обратной совместимости со старыми данными)
      overlayBackgroundToUse = action.overlayBackground;
      console.log("parseOverlayAction: Using overlayBackground from action (fallback)", overlayBackgroundToUse);
    }
    
    if (overlayBackgroundToUse) {
      if (overlayBackgroundToUse.type === "NONE") {
        // Фон не показывается
        background = false;
      } else if (overlayBackgroundToUse.type === "SOLID_COLOR" && overlayBackgroundToUse.color) {
        // Фон показывается с указанным цветом
        background = true;
        // Конвертируем RGBA в hex
        const r = Math.round(overlayBackgroundToUse.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(overlayBackgroundToUse.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(overlayBackgroundToUse.color.b * 255).toString(16).padStart(2, '0');
        backgroundColor = r + g + b;
        backgroundOpacity = Math.round((overlayBackgroundToUse.color.a || 1) * 100);
      }
    } else {
      // Если overlayBackground не найден ни в overlayFrame, ни в action - фон не показывается
      background = false;
      console.log("parseOverlayAction: overlayBackground not found, background = false");
    }
    
    // Логируем результат парсинга фона
    console.log("parseOverlayAction: Parsed overlay background", {
      background: background,
      backgroundColor: backgroundColor,
      backgroundOpacity: backgroundOpacity,
      overlayBackgroundType: overlayBackgroundToUse ? overlayBackgroundToUse.type : "not set"
    });
    
    // Парсим closeOnOutsideClick
    // ВАЖНО: overlayBackgroundInteraction - это свойство overlay-фрейма, а не action
    // Приоритет - сначала overlayFrame (свойства overlay-фрейма), потом action (для обратной совместимости)
    let closeOnOutsideClick = false;
    if (overlayFrame && overlayFrame.overlayBackgroundInteraction === "CLOSE_ON_CLICK_OUTSIDE") {
      // Читаем из свойств overlay-фрейма (основной источник)
      closeOnOutsideClick = true;
      console.log("parseOverlayAction: Using overlayBackgroundInteraction from overlay frame", closeOnOutsideClick);
    } else if (action.overlayBackgroundInteraction === "CLOSE_ON_CLICK_OUTSIDE") {
      // Fallback: читаем из action (для обратной совместимости)
      closeOnOutsideClick = true;
      console.log("parseOverlayAction: Using overlayBackgroundInteraction from action (fallback)", closeOnOutsideClick);
    }
    
    // Если позиция MANUAL, но нет координат, используем CENTERED как fallback
    // ВАЖНО: Проверяем и null, и undefined, так как координаты могут быть не установлены
    if (position === "MANUAL" && (positionX === null || positionX === undefined || positionY === null || positionY === undefined)) {
      console.warn("parseOverlayAction: Overlay with MANUAL position but no coordinates, using CENTERED", {
        positionX: positionX,
        positionY: positionY,
        actionOverlayRelativePosition: action.overlayRelativePosition,
        actionOverlayPosition: action.overlayPosition
      });
      position = "CENTERED";
      positionX = undefined;
      positionY = undefined;
    }
    
    const result = {
      type: overlayType,
      overlayId: overlayId,
      position: position,
      positionX: positionX,
      positionY: positionY,
      background: background,
      backgroundColor: backgroundColor,
      backgroundOpacity: backgroundOpacity,
      closeOnOutsideClick: closeOnOutsideClick
    };
    
    console.log("parseOverlayAction: Parsed overlay action", result);
    return result;
  }
  
  console.log("parseOverlayAction: Not an overlay action, returning null", {
    actionType: actionType,
    navigation: navigation,
    action: action
  });
  return null;
}

// Функция для получения фона фрейма (fills)
// Возвращает CSS-совместимое значение для background
function getFrameBackground(frame) {
  // Проверяем fills фрейма
  if (!frame.fills || !Array.isArray(frame.fills) || frame.fills.length === 0) {
    // Если fills нет, возвращаем прозрачный фон
    return null;
  }
  
  // Берем первый fill (обычно это основной фон)
  const fill = frame.fills[0];
  
  // Обрабатываем разные типы fills
  if (fill.type === "SOLID") {
    // Solid color fill
    const color = fill.color;
    const opacity = fill.opacity !== undefined ? fill.opacity : 1;
    
    // Конвертируем из RGB (0-1) в RGB (0-255) и создаем rgba строку
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = opacity;
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } else if (fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL" || fill.type === "GRADIENT_ANGULAR" || fill.type === "GRADIENT_DIAMOND") {
    // Gradient fills - для простоты возвращаем первый цвет градиента
    // В будущем можно реализовать полную поддержку градиентов
    if (fill.gradientStops && fill.gradientStops.length > 0) {
      const firstStop = fill.gradientStops[0];
      const color = firstStop.color;
      const opacity = firstStop.opacity !== undefined ? firstStop.opacity : 1;
      
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = opacity;
      
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return null;
  } else if (fill.type === "IMAGE") {
    // Image fill - возвращаем null, так как изображение нужно экспортировать отдельно
    // В будущем можно реализовать экспорт изображения фона
    return null;
  }
  
  // Неизвестный тип fill
  return null;
}

// Функция для вычисления размеров контента фрейма
function getContentBounds(frame) {
  // Инициализируем границы размером самого фрейма (viewport)
  let minX = 0;
  let minY = 0;
  let maxX = frame.width;
  let maxY = frame.height;
  
  // Получаем абсолютные координаты фрейма
  const frameX = frame.absoluteTransform[0][2];
  const frameY = frame.absoluteTransform[1][2];
  
  // Находим только прямых детей фрейма (не используем findAll, чтобы не включать сам фрейм)
  // Исключаем вложенные фреймы со скроллом - они обрабатываются отдельно
  const directChildren = frame.children || [];
  
  for (let i = 0; i < directChildren.length; i++) {
    const child = directChildren[i];
    
    // Пропускаем вложенные фреймы со скроллом - они обрабатываются отдельно через processNestedFrames
    if (child.type === "FRAME" && child.overflowDirection && child.overflowDirection !== "NONE") {
      continue;
    }
    
    // Используем absoluteTransform для получения абсолютных координат
    const childX = child.absoluteTransform[0][2];
    const childY = child.absoluteTransform[1][2];
    
    // Вычисляем относительные координаты относительно фрейма
    const relX = childX - frameX;
    const relY = childY - frameY;
    const relRight = relX + child.width;
    const relBottom = relY + child.height;
    
    // Обновляем границы контента
    minX = Math.min(minX, relX);
    minY = Math.min(minY, relY);
    maxX = Math.max(maxX, relRight);
    maxY = Math.max(maxY, relBottom);
  }
  
  // Вычисляем размеры контента
  // contentWidth/Height должны быть минимум размером viewport
  const contentWidth = Math.max(maxX - minX, frame.width);
  const contentHeight = Math.max(maxY - minY, frame.height);
  
  // contentOffsetX/Y могут быть отрицательными, если контент начинается выше/левее viewport
  // Но для правильного отображения нужно, чтобы offset был не меньше 0
  const contentOffsetX = Math.max(0, minX);
  const contentOffsetY = Math.max(0, minY);
  
  const result = {
    contentWidth: contentWidth,
    contentHeight: contentHeight,
    contentOffsetX: contentOffsetX,
    contentOffsetY: contentOffsetY,
    viewportWidth: frame.width,
    viewportHeight: frame.height
  };
  
  console.log("getContentBounds: Result for", frame.name, result);
  
  return result;
}

// Функция для экспорта фрейма с метаданными о скролле
async function exportFrameWithScrollData(frame, isTopLevel = false, excludeNestedScrollableFrames = false) {
  // Читаем свойства скролла
  // ВАЖНО: overflowDirection может быть undefined, если свойство не установлено
  const overflowDirection = frame.overflowDirection || "NONE";
  const clipsContent = frame.clipsContent !== undefined ? frame.clipsContent : true;
  
  // Логируем для отладки
  console.log("Frame:", frame.name, "overflowDirection:", overflowDirection, "isTopLevel:", isTopLevel, "excludeNestedScrollableFrames:", excludeNestedScrollableFrames);
  
  // Для топ-уровневых фреймов скролл может работать автоматически,
  // даже если overflowDirection = "NONE" и фрейм больше экрана
  // (типичные размеры экрана: 375x667 для мобильных)
  // ВАЖНО: canScroll должен быть true если overflowDirection !== "NONE"
  const canScroll = overflowDirection !== "NONE" || (isTopLevel && (frame.width > 375 || frame.height > 667));
  
  console.log("Frame:", frame.name, "canScroll:", canScroll, "overflowDirection:", overflowDirection);
  
  // ВАЖНО: Если excludeNestedScrollableFrames = true, временно скрываем вложенные scrollable фреймы
  // чтобы они не попали в экспорт основного экрана (избегаем дублирования)
  const hiddenNestedFrames = [];
  if (excludeNestedScrollableFrames && frame.children) {
    for (let i = 0; i < frame.children.length; i++) {
      const child = frame.children[i];
      if (child.type === "FRAME" && child.overflowDirection && child.overflowDirection !== "NONE") {
        console.log("  Temporarily hiding nested scrollable frame:", child.name, "for export");
        child.visible = false;
        hiddenNestedFrames.push(child);
      }
    }
  }
  
  // ВАЖНО: Проверяем видимость фрейма перед экспортом
  if (!frame.visible) {
    console.warn("⚠️ WARNING: Frame", frame.name, "is not visible! Setting visible = true before export.");
    frame.visible = true;
  }
  
  // Вычисляем полный размер контента (до скрытия вложенных фреймов)
  const contentBounds = getContentBounds(frame);
  
  // Экспортируем viewport (всегда)
  console.log("  Exporting viewport image for frame:", frame.name, "size:", frame.width, "x", frame.height);
  const viewportBytes = await frame.exportAsync({ 
    format: "PNG", 
    constraint: { type: "SCALE", value: 2 } 
  });
  const viewportBase64 = figma.base64Encode(viewportBytes);
  console.log("  Exported viewport image, base64 length:", viewportBase64.length, "bytes:", viewportBytes.length);
  
  // Пытаемся экспортировать полный контент, если есть скролл
  let fullContentBase64 = viewportBase64;
  let fullContentExported = false;
  
  if (canScroll && (contentBounds.contentWidth > frame.width || contentBounds.contentHeight > frame.height)) {
    try {
      // Пытаемся клонировать фрейм и изменить размер для экспорта полного контента
      const clonedFrame = frame.clone();
      clonedFrame.resize(contentBounds.contentWidth, contentBounds.contentHeight);
      
      console.log("  Exporting full content image for frame:", frame.name, "size:", contentBounds.contentWidth, "x", contentBounds.contentHeight);
      const fullContentBytes = await clonedFrame.exportAsync({ 
        format: "PNG", 
        constraint: { type: "SCALE", value: 2 } 
      });
      fullContentBase64 = figma.base64Encode(fullContentBytes);
      console.log("  Exported full content image, base64 length:", fullContentBase64.length, "bytes:", fullContentBytes.length);
      fullContentExported = true;
      
      clonedFrame.remove();
    } catch (error) {
      console.warn("Failed to export full content for frame " + frame.name + ", using viewport only:", error);
      // Fallback: используем viewport
      fullContentExported = false;
    }
  }
  
  // ВАЖНО: Возвращаем видимость вложенным фреймам
  for (let i = 0; i < hiddenNestedFrames.length; i++) {
    hiddenNestedFrames[i].visible = true;
    console.log("  Restored visibility for nested scrollable frame:", hiddenNestedFrames[i].name);
  }
  
  return {
    image: fullContentBase64, // Полный контент или viewport (fallback)
    viewportImage: viewportBase64, // Всегда viewport для reference
    overflowDirection: overflowDirection,
    clipsContent: clipsContent,
    canScroll: canScroll,
    isTopLevel: isTopLevel,
    viewportWidth: frame.width,
    viewportHeight: frame.height,
    contentWidth: contentBounds.contentWidth,
    contentHeight: contentBounds.contentHeight,
    contentOffsetX: contentBounds.contentOffsetX,
    contentOffsetY: contentBounds.contentOffsetY,
    fullContentExported: fullContentExported
  };
}

// Функция для рекурсивной обработки вложенных фреймов со скроллом
// rootFrame - основной экран, относительно которого вычисляются координаты
// frame - текущий фрейм для обработки
// parentFrameId - ID родительского фрейма для вложенных фреймов
async function processNestedFrames(frame, parentFrameId = null, rootFrame = null) {
  const nestedFrames = [];
  
  // Если rootFrame не указан, используем текущий фрейм как корневой
  // Это нужно для правильного вычисления координат относительно основного экрана
  if (!rootFrame) {
    rootFrame = frame;
  }
  
  // Находим все вложенные фреймы (прямые дети)
  // ВАЖНО: Сначала обрабатываем прямых детей, затем рекурсивно их детей
  const childFrames = frame.children.filter(child => child.type === "FRAME");
  
  console.log("processNestedFrames: Found", childFrames.length, "direct child frames in", frame.name, "rootFrame:", rootFrame.name);
  
  for (let i = 0; i < childFrames.length; i++) {
    const childFrame = childFrames[i];
    const overflowDirection = childFrame.overflowDirection || "NONE";
    const clipsContent = childFrame.clipsContent !== undefined ? childFrame.clipsContent : true;
    
    // Логируем для отладки - включая все уровни вложенности
    const depth = rootFrame === frame ? 0 : 1; // Упрощенная глубина для логирования
    console.log("Nested frame:", childFrame.name, "overflowDirection:", overflowDirection, "parent:", frame.name, "depth:", depth);
    
    // Обрабатываем только фреймы с скроллом
    if (overflowDirection !== "NONE") {
      console.log("✓ Found scrollable nested frame:", childFrame.name, "overflowDirection:", overflowDirection);
      
      // ВАЖНО: Проверяем видимость фрейма перед экспортом
      if (!childFrame.visible) {
        console.warn("⚠️ WARNING: Nested frame", childFrame.name, "is not visible! Setting visible = true before export.");
        childFrame.visible = true;
      }
      
      const nestedData = await exportFrameWithScrollData(childFrame, false);
      
      // Логируем размер экспортированного изображения
      console.log("  Exported image for nested frame:", childFrame.name, {
        imageLength: nestedData.image ? nestedData.image.length : 0,
        imagePrefix: nestedData.image ? nestedData.image.substring(0, 50) : "null",
        hasImage: !!nestedData.image,
        viewportWidth: nestedData.viewportWidth,
        viewportHeight: nestedData.viewportHeight,
        contentWidth: nestedData.contentWidth,
        contentHeight: nestedData.contentHeight
      });
      
      // ВАЖНО: Вычисляем координаты относительно rootFrame (основного экрана), а не текущего родителя
      // Это необходимо для правильного позиционирования глубоко вложенных фреймов
      const rootFrameX = rootFrame.absoluteTransform[0][2];
      const rootFrameY = rootFrame.absoluteTransform[1][2];
      const childX = childFrame.absoluteTransform[0][2];
      const childY = childFrame.absoluteTransform[1][2];
      
      // Координаты относительно основного экрана (rootFrame)
      const relativeX = childX - rootFrameX;
      const relativeY = childY - rootFrameY;
      
      console.log("  Coordinates relative to root:", rootFrame.name, "x:", relativeX, "y:", relativeY);
      console.log("  Content bounds:", {
        frameName: childFrame.name,
        overflowDirection: nestedData.overflowDirection,
        viewportWidth: nestedData.viewportWidth,
        viewportHeight: nestedData.viewportHeight,
        contentWidth: nestedData.contentWidth,
        contentHeight: nestedData.contentHeight,
        contentOffsetX: nestedData.contentOffsetX,
        contentOffsetY: nestedData.contentOffsetY,
        canScrollHorizontal: nestedData.contentWidth > nestedData.viewportWidth,
        canScrollVertical: nestedData.contentHeight > nestedData.viewportHeight,
        contentWidthDiff: nestedData.contentWidth - nestedData.viewportWidth,
        contentHeightDiff: nestedData.contentHeight - nestedData.viewportHeight
      });
      
      // ВАЖНО: Если overflowDirection HORIZONTAL, но contentWidth === viewportWidth, это проблема
      if (nestedData.overflowDirection === "HORIZONTAL" && nestedData.contentWidth <= nestedData.viewportWidth) {
        console.warn("⚠️ WARNING: Frame", childFrame.name, "has HORIZONTAL overflowDirection but contentWidth (" + nestedData.contentWidth + ") <= viewportWidth (" + nestedData.viewportWidth + ")");
        console.warn("  This means horizontal scroll won't work! Check getContentBounds calculation.");
      }
      
      // ВАЖНО: Получаем фон родительского фрейма (rootFrame), чтобы использовать его под scroll-block
      // Это нужно для того, чтобы под scroll-block был фон фрейма, а не дизайн основного экрана
      const parentBackground = getFrameBackground(rootFrame);
      console.log("  Parent frame background for nested frame:", childFrame.name, "background:", parentBackground);
      
      nestedFrames.push({
        id: childFrame.id,
        name: childFrame.name,
        parentFrameId: parentFrameId || rootFrame.id, // Используем rootFrame.id если parentFrameId не указан
        x: relativeX,
        y: relativeY,
        width: nestedData.viewportWidth,
        height: nestedData.viewportHeight,
        // ВАЖНО: Добавляем префикс data:image/png;base64, для правильного отображения в viewer
        image: nestedData.image.startsWith("data:") ? nestedData.image : "data:image/png;base64," + nestedData.image,
        overflowDirection: nestedData.overflowDirection,
        clipsContent: nestedData.clipsContent,
        viewportWidth: nestedData.viewportWidth,
        viewportHeight: nestedData.viewportHeight,
        // Размеры контента должны быть минимум размером viewport
        // ВАЖНО: Для скролла нужно, чтобы contentWidth/Height были больше viewport
        contentWidth: Math.max(nestedData.contentWidth, nestedData.viewportWidth),
        contentHeight: Math.max(nestedData.contentHeight, nestedData.viewportHeight),
        // Отступы не должны быть отрицательными
        contentOffsetX: Math.max(0, nestedData.contentOffsetX),
        contentOffsetY: Math.max(0, nestedData.contentOffsetY),
        // ВАЖНО: Фон родительского фрейма для использования под scroll-block
        parentBackground: parentBackground
      });
    } else {
      console.log("  Skipping frame without scroll:", childFrame.name, "overflowDirection:", overflowDirection);
    }
    
    // Рекурсивно обрабатываем вложенные фреймы внутри вложенного
    // ВАЖНО: Передаем rootFrame дальше, чтобы координаты всегда вычислялись относительно основного экрана
    const deeperNested = await processNestedFrames(childFrame, childFrame.id, rootFrame);
    nestedFrames.push(...deeperNested);
  }
  
  return nestedFrames;
}

// Функция для поиска узла по ID в данных REST API
function findNodeById(node, targetId) {
  if (!node) return null;
  
  if (node.id === targetId) {
    return node;
  }
  
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const found = findNodeById(node.children[i], targetId);
      if (found) return found;
    }
  }
  
  return null;
}

// Функция для обхода прототипа от starting point через connections
function collectPrototypeFrames(fileData, startingPointId) {
  const visited = new Set();
  const framesToProcess = [];
  const allFrames = new Map(); // id -> frame data from REST API
  
  // Рекурсивно собираем все фреймы из документа
  function collectAllFrames(node) {
    if (!node) return;
    
    if (node.type === "FRAME") {
      allFrames.set(node.id, node);
    }
    
    if (node.children) {
      node.children.forEach(child => collectAllFrames(child));
    }
  }
  
  // Собираем все фреймы из документа
  if (fileData.document && fileData.document.children) {
    fileData.document.children.forEach(page => {
      collectAllFrames(page);
    });
  }
  
  // Находим starting point
  const startingPoint = findNodeById(fileData.document, startingPointId);
  if (!startingPoint) {
    throw new Error("Starting point not found: " + startingPointId);
  }
  
  // Начинаем обход от starting point
  const queue = [startingPointId];
  visited.add(startingPointId);
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentFrame = allFrames.get(currentId);
    
    if (!currentFrame) continue;
    
    framesToProcess.push(currentFrame);
    
    // Находим все connections (reactions) из этого фрейма
    function findConnections(node) {
      if (!node) return;
      
      // Проверяем reactions в узле
      if (node.reactions && Array.isArray(node.reactions)) {
        node.reactions.forEach(reaction => {
          if (!reaction.action) return;
          
          const action = reaction.action;
          
          // ВАЖНО: Обрабатываем все типы действий, включая overlay actions
          // 1. Обычные переходы (navigate to) - destinationId
          if (action.destinationId) {
            const targetId = action.destinationId;
            if (!visited.has(targetId) && allFrames.has(targetId)) {
              visited.add(targetId);
              queue.push(targetId);
            }
          }
          
          // 2. Overlay actions (OPEN_OVERLAY, SWAP_OVERLAY) - overlayId или destinationId
          // В REST API формат может быть разным: action.type === "OPEN_OVERLAY" или action.navigation === "OVERLAY"
          if (action.type === "OPEN_OVERLAY" || action.type === "SWAP_OVERLAY" || 
              action.navigation === "OVERLAY" || action.navigation === "SWAP") {
            const overlayId = action.overlayId || action.destinationId;
            if (overlayId && !visited.has(overlayId) && allFrames.has(overlayId)) {
              visited.add(overlayId);
              queue.push(overlayId);
            }
          }
        });
      }
      
      // Рекурсивно проверяем дочерние узлы
      if (node.children) {
        node.children.forEach(child => findConnections(child));
      }
    }
    
    findConnections(currentFrame);
  }
  
  return {
    frames: framesToProcess,
    allFrames: allFrames,
    startingPoint: startingPoint
  };
}

// Функция для генерации прототипа из данных REST API
// ВАЖНО: Использует подход из run() - собирает ВСЕ фреймы на странице, анализирует граф навигации,
// определяет mainScreens, но обрабатывает hotspots для ВСЕХ фреймов
async function generateFromRESTAPI(fileData, selectedFlowId) {
  try {
    figma.notify("🔄 Генерация прототипа из REST API данных...");
    
    // ВАЖНО: Подход из run() - собираем ВСЕ фреймы на странице, а не только из BFS обхода
    const allPageFrames = figma.currentPage.findAll((n) => n.type === "FRAME");
    
    if (!allPageFrames || allPageFrames.length === 0) {
      throw new Error("No frames found on this page.");
    }
    
    console.log("Found", allPageFrames.length, "total frames on page");
    
    // Функция проверки: является ли фрейм топ-уровневым (прямым ребенком страницы)
    function isTopLevelFrame(frame) {
      return frame.parent && frame.parent.type === "PAGE";
    }
    
    // ВАЖНО: Собираем граф навигации для ВСЕХ фреймов (как в run())
    // incomingTargets = фреймы, на которые ведут hotspots (имеют входящие edges)
    // framesWithOutgoing = фреймы, из которых есть исходящие хотспоты
    const incomingTargets = new Set();
    const framesWithOutgoing = new Set();
    const overlayTargets = new Set(); // Фреймы, используемые как overlay
    
    // Сначала проходим по всем фреймам и собираем граф навигации
    for (let i = 0; i < allPageFrames.length; i++) {
      const frame = allPageFrames[i];
      const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);
      
      for (let j = 0; j < interactiveNodes.length; j++) {
        const node = interactiveNodes[j];
        for (let k = 0; k < node.reactions.length; k++) {
          const reaction = node.reactions[k];
          if (!reaction || !reaction.action) continue;
          
          const action = reaction.action;
          
          // Обычные переходы (navigate to)
          const target = action.destinationId;
          if (target) {
            incomingTargets.add(target);
            framesWithOutgoing.add(frame.id);
          }
          
          // Overlay actions - тоже учитываем в графе
          if (action.type === "OPEN_OVERLAY" || action.type === "SWAP_OVERLAY" || 
              action.navigation === "OVERLAY" || action.navigation === "SWAP") {
            const overlayId = action.overlayId || action.destinationId;
            if (overlayId) {
              overlayTargets.add(overlayId);
              framesWithOutgoing.add(frame.id);
            }
          }
        }
      }
    }
    
    // Определяем стартовый фрейм (из selectedFlowId)
    let startFrame = null;
    try {
      startFrame = await figma.getNodeByIdAsync(selectedFlowId);
      if (startFrame && startFrame.type === "FRAME" && isTopLevelFrame(startFrame)) {
        console.log("Using selected flow as start:", startFrame.name);
      } else {
        startFrame = null;
      }
    } catch (error) {
      console.warn("Could not get start frame by ID:", selectedFlowId, error);
    }
    
    // Если не нашли по ID, используем логику из run()
    if (!startFrame) {
      // 1. Ищем топ-уровневый фрейм с маркером [start] или [begin]
      startFrame = allPageFrames.find((f) => {
        if (!isTopLevelFrame(f)) return false;
        const name = f.name.toLowerCase();
        return name.includes("[start]") || name.includes("[begin]");
      });
      if (startFrame) {
        console.log("Using [start] marked frame as start:", startFrame.name);
      }
    }
    
    // 2. Если не нашли по маркеру, используем граф навигации
    if (!startFrame) {
      startFrame = allPageFrames.find((f) => {
        if (!isTopLevelFrame(f)) return false;
        const hasNoIncoming = !incomingTargets.has(f.id);
        const hasOutgoing = framesWithOutgoing.has(f.id);
        return hasNoIncoming && hasOutgoing;
      });
      if (startFrame) {
        console.log("Using frame without incoming edges but with outgoing hotspots as start:", startFrame.name);
      }
    }
    
    // 3. Fallback: топ-уровневый фрейм БЕЗ входящих edges
    if (!startFrame) {
      startFrame = allPageFrames.find((f) => {
        return isTopLevelFrame(f) && !incomingTargets.has(f.id);
      });
      if (startFrame) {
        console.log("Using frame without incoming edges as start:", startFrame.name);
      }
    }
    
    // 4. Последний fallback: первый топ-уровневый фрейм
    if (!startFrame) {
      const topLevelFrames = allPageFrames.filter(isTopLevelFrame);
      if (topLevelFrames.length > 0) {
        startFrame = topLevelFrames[0];
        console.log("Using first top-level frame as start (fallback):", startFrame.name);
      }
    }
    
    if (!startFrame) {
      throw new Error("Could not determine start frame");
    }
    
    // ВАЖНО: Определяем финальный фрейм только среди фреймов, достижимых из startFrame
    // Строим граф достижимости через BFS от startFrame
    const reachableFrameIds = new Set();
    const queue = [startFrame.id];
    reachableFrameIds.add(startFrame.id);
    
    // BFS: обходим все фреймы, достижимые из startFrame
    while (queue.length > 0) {
      const currentFrameId = queue.shift();
      
      // Находим все фреймы, на которые ведут hotspots из текущего фрейма
      for (let i = 0; i < allPageFrames.length; i++) {
        const frame = allPageFrames[i];
        if (frame.id === currentFrameId) {
          const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);
          
          for (let j = 0; j < interactiveNodes.length; j++) {
            const node = interactiveNodes[j];
            for (let k = 0; k < node.reactions.length; k++) {
              const reaction = node.reactions[k];
              if (!reaction || !reaction.action) continue;
              
              const action = reaction.action;
              
              // Обычные переходы
              const target = action.destinationId;
              if (target && !reachableFrameIds.has(target)) {
                reachableFrameIds.add(target);
                queue.push(target);
              }
              
              // Overlay actions (не добавляем в граф навигации, но они могут быть на экранах)
              if (action.type === "OPEN_OVERLAY" || action.type === "SWAP_OVERLAY" || 
                  action.navigation === "OVERLAY" || action.navigation === "SWAP") {
                const overlayId = action.overlayId || action.destinationId;
                if (overlayId && !reachableFrameIds.has(overlayId)) {
                  reachableFrameIds.add(overlayId);
                  queue.push(overlayId);
                }
              }
            }
          }
          break;
        }
      }
    }
    
    console.log("Reachable frames from startFrame:", reachableFrameIds.size, Array.from(reachableFrameIds));
    
    // Ищем final frame только среди достижимых фреймов
    let endFrame = null;
    
    // 1. Сначала ищем по маркеру [final] или [end] среди достижимых
    for (let i = 0; i < allPageFrames.length; i++) {
      const f = allPageFrames[i];
      if (!isTopLevelFrame(f)) continue;
      if (!reachableFrameIds.has(f.id)) continue;
      
      const name = f.name.trim();
      if (/\[final\]/i.test(name) || /\[end\]/i.test(name)) {
        endFrame = f;
        console.log("Found end frame by marker (within reachable):", endFrame.name);
        break;
      }
    }
    
    // 2. Если не нашли по маркеру, используем граф навигации среди достижимых
    if (!endFrame) {
      for (let i = 0; i < allPageFrames.length; i++) {
        const f = allPageFrames[i];
        if (!isTopLevelFrame(f)) continue;
        if (!reachableFrameIds.has(f.id)) continue;
        
        if (incomingTargets.has(f.id) && !framesWithOutgoing.has(f.id)) {
          endFrame = f;
          console.log("Found end frame by graph analysis (target without outgoing, within reachable):", endFrame.name);
          break;
        }
      }
    }
    
    // 3. Если не нашли, берем достижимый фрейм без исходящих хотспотов
    if (!endFrame) {
      for (let i = 0; i < allPageFrames.length; i++) {
        const f = allPageFrames[i];
        if (!isTopLevelFrame(f)) continue;
        if (!reachableFrameIds.has(f.id)) continue;
        
        if (!framesWithOutgoing.has(f.id)) {
          endFrame = f;
          console.log("Found end frame by graph analysis (no outgoing hotspots, within reachable):", endFrame.name);
          break;
        }
      }
    }
    
    // 4. Fallback: последний достижимый топ-уровневый фрейм
    if (!endFrame) {
      const reachableTopLevelFrames = allPageFrames.filter(f => 
        isTopLevelFrame(f) && reachableFrameIds.has(f.id)
      );
      if (reachableTopLevelFrames.length > 0) {
        endFrame = reachableTopLevelFrames[reachableTopLevelFrames.length - 1];
        console.log("Using last reachable top-level frame as end (fallback):", endFrame.name);
      }
    }
    
    if (!endFrame) {
      throw new Error("Could not determine end frame for selected flow");
    }
    
    // Фильтрация основных экранов прототипа ТОЛЬКО из достижимых фреймов
    // Основные экраны - это ТОП-УРОВНЕВЫЕ фреймы, которые:
    // 1. Стартовый и финальный фреймы
    // 2. Фреймы, участвующие в навигации (целевые или имеющие исходящие хотспоты)
    // ВАЖНО: Все экраны должны быть достижимы из startFrame (принадлежать выбранному flow)
    const mainScreenIds = new Set();
    
    // Добавляем стартовый и финальный фреймы
    if (startFrame && isTopLevelFrame(startFrame)) {
      mainScreenIds.add(startFrame.id);
      console.log("Added start frame to main screens:", startFrame.name);
    }
    if (endFrame && isTopLevelFrame(endFrame)) {
      mainScreenIds.add(endFrame.id);
      console.log("Added end frame to main screens:", endFrame.name);
    }
    
    // Добавляем только топ-уровневые фреймы, которые участвуют в навигации И достижимы из startFrame
    for (let i = 0; i < allPageFrames.length; i++) {
      const frame = allPageFrames[i];
      if (isTopLevelFrame(frame) && reachableFrameIds.has(frame.id)) {
        if (incomingTargets.has(frame.id) || framesWithOutgoing.has(frame.id) || overlayTargets.has(frame.id)) {
          mainScreenIds.add(frame.id);
        }
      }
    }
    
    // Фильтруем frames - оставляем только основные экраны
    const mainFrames = allPageFrames.filter(frame => mainScreenIds.has(frame.id));
    
    console.log("Filtered frames: " + allPageFrames.length + " total -> " + mainFrames.length + " main screens");
    
    // Создаем frameIdMap для быстрого доступа ко всем фреймам (нужен для получения overlayFrame при парсинге hotspots)
    const frameIdMap = new Map();
    for (let i = 0; i < allPageFrames.length; i++) {
      frameIdMap.set(allPageFrames[i].id, allPageFrames[i]);
    }
    
    // ВАЖНО: Собираем overlay frames, которые упоминаются в reactions, чтобы добавить их в mainScreens
    // (overlay-фреймы могут не быть топ-уровневыми, но должны быть в screens)
    const overlayFrameIds = new Set();
    for (let i = 0; i < allPageFrames.length; i++) {
      const frame = allPageFrames[i];
      const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);
      
      for (let j = 0; j < interactiveNodes.length; j++) {
        const node = interactiveNodes[j];
        for (let k = 0; k < node.reactions.length; k++) {
          const reaction = node.reactions[k];
          if (!reaction || !reaction.action) continue;
          
          const action = reaction.action;
          if (action.type === "OPEN_OVERLAY" || action.type === "SWAP_OVERLAY" || 
              action.navigation === "OVERLAY" || action.navigation === "SWAP") {
            const overlayId = action.overlayId || action.destinationId;
            if (overlayId) {
              overlayFrameIds.add(overlayId);
            }
          }
        }
      }
    }
    
    // Добавляем overlay-фреймы в mainFrames, если они еще не добавлены
    for (const overlayId of overlayFrameIds) {
      if (!mainScreenIds.has(overlayId)) {
        try {
          const overlayFrame = await figma.getNodeByIdAsync(overlayId);
          if (overlayFrame && overlayFrame.type === "FRAME") {
            mainScreenIds.add(overlayId);
            if (!mainFrames.includes(overlayFrame)) {
              console.log("Found overlay frame to add to main screens:", overlayFrame.name, overlayFrame.id);
              mainFrames.push(overlayFrame);
            }
          }
        } catch (error) {
          console.warn("Could not get overlay frame for screens:", overlayId, error);
        }
      }
    }
    
    // Собираем screens с экспортом изображений (только mainFrames + overlay frames)
    const screens = [];
    for (let i = 0; i < mainFrames.length; i++) {
      const frame = mainFrames[i];
      const isTopLevel = frame.parent && frame.parent.type === "PAGE";
      
      // Экспортируем фрейм с метаданными о скролле
      // ВАЖНО: При экспорте основного экрана исключаем вложенные scrollable фреймы,
      // чтобы они не попали в изображение (избегаем дублирования)
      const scrollData = await exportFrameWithScrollData(frame, isTopLevel, true);
      
      // Обрабатываем вложенные фреймы со скроллом (рекурсивно)
      // ВАЖНО: processNestedFrames рекурсивно обрабатывает все вложенные фреймы, включая глубоко вложенные
      const nestedFrames = await processNestedFrames(frame, frame.id);
      
      console.log("generateFromRESTAPI: Frame", frame.name, "has", nestedFrames.length, "nested scrollable frames");
      
      screens.push({
        id: frame.id,
        name: frame.name,
        // Используем viewport размеры как основные размеры экрана
        width: scrollData.viewportWidth || frame.width,
        height: scrollData.viewportHeight || frame.height,
        image: "data:image/png;base64," + scrollData.image,
        overflowDirection: scrollData.overflowDirection,
        clipsContent: scrollData.clipsContent,
        canScroll: scrollData.canScroll,
        isTopLevel: scrollData.isTopLevel,
        viewportWidth: scrollData.viewportWidth,
        viewportHeight: scrollData.viewportHeight,
        // Размеры контента должны быть минимум размером viewport
        contentWidth: Math.max(scrollData.contentWidth, scrollData.viewportWidth),
        contentHeight: Math.max(scrollData.contentHeight, scrollData.viewportHeight),
        // Отступы не должны быть отрицательными
        contentOffsetX: Math.max(0, scrollData.contentOffsetX),
        contentOffsetY: Math.max(0, scrollData.contentOffsetY),
        nestedFrames: nestedFrames.length > 0 ? nestedFrames : undefined
      });
    }
    
    // ВАЖНО: Hotspots собираются для ВСЕХ фреймов (как в run()), а не только для mainFrames
    // Это критично, так как hotspots могут быть во вложенных фреймах
    const hotspots = [];
    const edges = [];
    
    console.log("generateFromRESTAPI: Processing hotspots for ALL frames:", allPageFrames.length, "frames");
    
    // Обрабатываем hotspots для ВСЕХ фреймов на странице (как в run())
    for (let i = 0; i < allPageFrames.length; i++) {
      const frame = allPageFrames[i];
      
      // Находим все интерактивные узлы в этом фрейме (как в run())
      const interactiveNodes = frame.findAll((n) => n.reactions && n.reactions.length > 0);
      
      for (let j = 0; j < interactiveNodes.length; j++) {
        const node = interactiveNodes[j];
        
        // Получаем координаты узла относительно фрейма
        const absX = node.absoluteTransform[0][2];
        const absY = node.absoluteTransform[1][2];
        const frameX = frame.absoluteTransform[0][2];
        const frameY = frame.absoluteTransform[1][2];
        
        const x = absX - frameX;
        const y = absY - frameY;
        const w = node.width;
        const h = node.height;
        
        // Обрабатываем все reactions этого узла
        for (let k = 0; k < node.reactions.length; k++) {
          const reaction = node.reactions[k];
          
          if (!reaction || !reaction.action) continue;
          
          const trigger = reaction.trigger && reaction.trigger.type ? reaction.trigger.type : null;
          const action = reaction.action;
          
          // Парсим overlay action, если есть
          // ВАЖНО: Проверяем все возможные форматы overlay actions:
          // 1. action.type === "NODE" && action.navigation === "OVERLAY" (Plugin API)
          // 2. action.type === "NODE" && action.navigation === "SWAP" (Plugin API)
          // 3. action.type === "OPEN_OVERLAY" (REST API / legacy)
          // 4. action.type === "SWAP_OVERLAY" (REST API / legacy)
          let overlayFrame = null;
          let overlayIdToGet = null;
          
          if ((action.type === "NODE" && (action.navigation === "OVERLAY" || action.navigation === "SWAP")) ||
              action.type === "OPEN_OVERLAY" || action.type === "SWAP_OVERLAY") {
            // Определяем overlayId в зависимости от формата
            if (action.type === "NODE" && action.destinationId) {
              overlayIdToGet = action.destinationId;
            } else if (action.overlayId || action.destinationId) {
              overlayIdToGet = action.overlayId || action.destinationId;
            }
            
            if (overlayIdToGet) {
              try {
                overlayFrame = frameIdMap.get(overlayIdToGet);
                if (!overlayFrame) {
                  overlayFrame = await figma.getNodeByIdAsync(overlayIdToGet);
                  // Кэшируем найденный overlayFrame в frameIdMap для последующего использования
                  if (overlayFrame && overlayFrame.type === "FRAME") {
                    frameIdMap.set(overlayIdToGet, overlayFrame);
                  }
                }
                if (overlayFrame && overlayFrame.type !== "FRAME") {
                  overlayFrame = null;
                }
                
                // Логируем для отладки
                if (overlayFrame) {
                  console.log("generateFromRESTAPI: Got overlay frame for background parsing", {
                    overlayId: overlayIdToGet,
                    frameName: overlayFrame.name,
                    hasOverlayBackground: !!overlayFrame.overlayBackground,
                    overlayBackgroundType: overlayFrame.overlayBackground ? overlayFrame.overlayBackground.type : "not set",
                    overlayBackground: overlayFrame.overlayBackground
                  });
                }
              } catch (e) {
                console.warn("Could not get overlay frame:", overlayIdToGet, e);
              }
            }
          }
          
          const overlayAction = parseOverlayAction(reaction, overlayFrame);
          
          // Определяем target для обычных переходов
          let target = null;
          if (!overlayAction || overlayAction.type === "CLOSE_OVERLAY") {
            if (action.destinationId) {
              target = action.destinationId;
            }
          }
          
          // Создаем hotspot
          const hotspot = {
            id: node.id,
            name: node.name || node.id,
            frame: frame.id,
            trigger: trigger,
            x: x,
            y: y,
            w: w,
            h: h,
            target: target
          };
          
          // Добавляем overlayAction, если есть
          if (overlayAction) {
            hotspot.overlayAction = overlayAction;
          }
          
          hotspots.push(hotspot);
          
          // Для обычных переходов добавляем edge
          if (target) {
            edges.push({
              from: frame.id,
              to: target,
              id: node.id,
              trigger: trigger
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
      protoVersion: "v2",
      start: startFrame.id,
      end: endFrame.id,
      flowId: selectedFlowId, // Сохраняем ID выбранного flow
      screens: screens,
      hotspots: hotspots,
      edges: edges,
      targets: targets
    };
    
    // Отправляем данные в UI
    const endFrameFoundByMarker = /\[final\]/i.test(endFrame.name) || /\[end\]/i.test(endFrame.name);
    
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
    
    figma.notify("✓ Прототип успешно сгенерирован из REST API данных!");
    
  } catch (error) {
    console.error("Error in generateFromRESTAPI:", error);
    throw error;
  }
}

