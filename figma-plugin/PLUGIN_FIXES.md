# Исправления в плагине Figma для синхронизации экранов

## Проблема
Плагин сохранял `screen.id` и `hotspot.frame` как `frame.id`, но `figmaNodeId` мог отличаться от `frame.id` (если `frame.id` не содержал pageId). Это приводило к проблемам синхронизации в viewer:
- `PRESENTED_NODE_CHANGED` приходит с `figmaNodeId` = "123:456"
- Но `screen.id` = "456" (без pageId)
- Экран не находится при поиске по `figmaNodeId`

## Исправления

### 1. Унификация screen.id с figmaNodeId
**Файл:** `figma-plugin/code.js` (строка ~1626)
- `screen.id` теперь использует `figmaNodeId` вместо `frame.id`
- Это гарантирует совпадение `screen.id` с `figmaNodeId` из `PRESENTED_NODE_CHANGED`

### 2. Унификация scene.id с figmaNodeId
**Файл:** `figma-plugin/code.js` (строка ~1669)
- `scene.id` обновляется на `figmaNodeId`, если они отличаются
- Это гарантирует совпадение `scene.id` с `figmaNodeId`

### 3. Унификация hotspot.frame с screen.id
**Файл:** `figma-plugin/code.js` (строка ~1794)
- Создан маппинг `frameIdToScreenIdMap` для связи `frame.id` -> `screenId` (figmaNodeId)
- `hotspot.frame` теперь использует `screenId` из маппинга вместо `frame.id`
- Это гарантирует совпадение `hotspot.frame` с `screen.id`

### 4. Унификация edge.from и edge.to с screen.id
**Файл:** `figma-plugin/code.js` (строка ~1823)
- `edge.from` и `edge.to` теперь используют `screenId` из маппинга
- Это гарантирует правильную связь edges с экранами

### 5. Унификация output.start и output.end с screen.id
**Файл:** `figma-plugin/code.js` (строка ~1900)
- `output.start` и `output.end` теперь используют `screenId` из маппинга
- Это гарантирует правильную инициализацию прототипа

## Результат
Теперь все идентификаторы унифицированы:
- `screen.id` = `figmaNodeId` (формат: "pageId:nodeId")
- `scene.id` = `figmaNodeId` (формат: "pageId:nodeId")
- `hotspot.frame` = `screen.id` (через маппинг)
- `edge.from` = `screen.id` (через маппинг)
- `edge.to` = `screen.id` (через маппинг)
- `output.start` = `screen.id` (через маппинг)
- `output.end` = `screen.id` (через маппинг)

Это гарантирует правильную синхронизацию экранов в viewer через `PRESENTED_NODE_CHANGED`.

## Тестирование
После этих изменений нужно:
1. Переэкспортировать прототип через плагин
2. Проверить, что `screen.id` совпадает с `figmaNodeId`
3. Проверить, что `hotspot.frame` совпадает с `screen.id`
4. Проверить синхронизацию экранов в viewer

