#!/bin/sh
# Скрипт для установки pre-commit hook

GIT_DIR="../../.git"
HOOK_FILE="$GIT_DIR/hooks/pre-commit"

if [ ! -d "$GIT_DIR" ]; then
  echo "⚠️  Git репозиторий не найден. Pre-commit hook не установлен."
  echo "💡 Для установки вручную скопируйте содержимое check-hardcoded-colors.sh в .git/hooks/pre-commit"
  exit 0
fi

# Создаем директорию hooks если её нет
mkdir -p "$GIT_DIR/hooks"

# Создаем pre-commit hook
cat > "$HOOK_FILE" << 'EOF'
#!/bin/sh
# Pre-commit hook для проверки захардкоженных цветов

cd figma-analytics

# Запускаем проверку
./scripts/check-hardcoded-colors.sh

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Коммит отклонен из-за захардкоженных цветов."
  echo "💡 Исправьте ошибки или используйте --no-verify для пропуска проверки (не рекомендуется)."
  exit $EXIT_CODE
fi

exit 0
EOF

chmod +x "$HOOK_FILE"
echo "✅ Pre-commit hook установлен в $HOOK_FILE"
echo "💡 Hook будет проверять захардкоженные цвета перед каждым коммитом."
