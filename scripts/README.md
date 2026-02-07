# Скрипты для деплоя (Self-hosted Supabase)

Используются при развёртывании Supabase на своём сервере (см. [INSTALLATION_RU.md](../INSTALLATION_RU.md), Часть 5.4).

- **setup_env.sh** — создаёт файл `.env` в каталоге Supabase (`supabase/docker`) с сгенерированными секретами (POSTGRES_PASSWORD, JWT_SECRET, SECRET_KEY_BASE и т.д.). Запуск: `bash scripts/setup_env.sh /opt/supabase/docker` (подставьте свой путь к `supabase/docker`).

- **generate-supabase-keys.js** — генерирует **ANON_KEY** и **SERVICE_ROLE_KEY** в формате JWT. В Supabase эти ключи должны быть JWT, подписанные вашим `JWT_SECRET`, а не случайные строки. После создания `.env` скриптом `setup_env.sh` обязательно замените в `.env` значения ANON_KEY и SERVICE_ROLE_KEY на вывод этого скрипта.

**Порядок:**

1. На сервере: клонировать Supabase, перейти в `supabase/docker`.
2. Скопировать и запустить: `bash /path/to/figmaTest/scripts/setup_env.sh /opt/supabase/docker` (или ваш путь).
3. Сгенерировать JWT-ключи: `JWT_SECRET=$(grep ^JWT_SECRET .env | cut -d= -f2-) node /path/to/figmaTest/scripts/generate-supabase-keys.js`
4. Скопировать из вывода строки `ANON_KEY=...` и `SERVICE_ROLE_KEY=...` в `supabase/docker/.env`, заменив текущие значения.
5. Запустить Supabase: `docker compose up -d`.

Подробнее — в основной инструкции (Часть 5.4 и 5.6).
