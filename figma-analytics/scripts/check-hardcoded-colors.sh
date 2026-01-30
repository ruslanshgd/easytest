#!/bin/sh
# Скрипт для проверки захардкоженных цветов

EXIT_CODE=0

echo "🔍 Проверка захардкоженных цветов..."

# Проверка hex цветов (исключая index.css и styleUtils.ts)
HEX_COLORS=$(grep -r "#[0-9a-fA-F]\{3,6\}" src/ --exclude-dir=node_modules --exclude="index.css" --exclude="styleUtils.ts" 2>/dev/null | grep -v "^src/index.css" | grep -v "^src/lib/styleUtils.ts" || true)

if [ -n "$HEX_COLORS" ]; then
  echo "❌ Обнаружены захардкоженные hex цвета:"
  echo "$HEX_COLORS"
  EXIT_CODE=1
fi

# Проверка Tailwind arbitrary values
ARBITRARY_VALUES=$(grep -r "bg-\[#\|text-\[#\|border-\[#" src/ --exclude-dir=node_modules 2>/dev/null || true)

if [ -n "$ARBITRARY_VALUES" ]; then
  echo "❌ Обнаружены Tailwind arbitrary values с hex цветами:"
  echo "$ARBITRARY_VALUES"
  EXIT_CODE=1
fi

# Проверка rgb/rgba в inline styles (кроме комментариев)
RGB_COLORS=$(grep -r "rgb(" src/ --exclude-dir=node_modules --exclude="index.css" --exclude="styleUtils.ts" 2>/dev/null | grep -v "//" | grep -v "var(--" || true)

if [ -n "$RGB_COLORS" ]; then
  echo "❌ Обнаружены захардкоженные rgb/rgba цвета:"
  echo "$RGB_COLORS"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Захардкоженные цвета не обнаружены!"
else
  echo ""
  echo "💡 Используйте CSS переменные или Tailwind классы вместо захардкоженных цветов."
  echo "📖 См. DESIGN_SYSTEM_GUIDE.md для подробностей."
fi

exit $EXIT_CODE
