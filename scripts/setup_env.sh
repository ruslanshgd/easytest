#!/bin/bash
# Создаёт .env для Supabase self-hosted с сгенерированными секретами.
# Запуск: передайте путь к каталогу supabase/docker, например:
#   bash scripts/setup_env.sh /opt/supabase/docker
# После создания .env обязательно замените ANON_KEY и SERVICE_ROLE_KEY на вывод
#   node scripts/generate-supabase-keys.js  (нужен JWT_SECRET из созданного .env).

SUPABASE_DOCKER="${1:-.}"
cd "$SUPABASE_DOCKER" || exit 1

POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
ANON_KEY=$(openssl rand -base64 32)
SERVICE_ROLE_KEY=$(openssl rand -base64 32)
SECRET_KEY_BASE=$(openssl rand -base64 32)
VAULT_ENC_KEY=$(openssl rand -base64 32)
PG_META_CRYPTO_KEY=$(openssl rand -base64 32)
DASHBOARD_PASSWORD="${DASHBOARD_PASSWORD:-Izitest2026Secure!}"

cat > .env << EOF
########### # Secrets # YOU MUST CHANGE THESE BEFORE GOING INTO PRODUCTION ############
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}
PG_META_CRYPTO_KEY=${PG_META_CRYPTO_KEY}

########### # Database # ############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
# default user is postgres
EOF

echo ".env создан в $(pwd)."
echo "Важно: замените ANON_KEY и SERVICE_ROLE_KEY на JWT из скрипта: JWT_SECRET=\$(grep JWT_SECRET .env | cut -d= -f2) node /path/to/figmaTest/scripts/generate-supabase-keys.js"
echo "Вывод скрипта вставьте в этот .env вместо текущих ANON_KEY и SERVICE_ROLE_KEY."
echo "Затем: docker compose up -d"
echo "Done."
