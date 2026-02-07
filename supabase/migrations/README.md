# FigmaTest — миграции Supabase (без данных)

Эти файлы создают **чистую схему** для нового проекта: таблицы, RLS, RPC, Storage. **Данных нет** — только установка с нуля.

## Порядок выполнения

Выполняйте файлы **строго по очереди** в Supabase SQL Editor (или через Supabase CLI):

1. **001_full_schema.sql** — расширения, все таблицы `public`, внешние ключи, индекс.
2. **002_functions_triggers_rls.sql** — функции, триггеры, RPC, включение RLS, все политики для таблиц `public`.
3. **003_storage.sql** — ведра Storage (`recordings`, `study-images`), RLS на `storage.buckets` и политики для `storage.objects`.
4. **004_send_email_hook.sql** — Send Email Hook для Auth: отправка писем через HTTP API (Resend/Brevo) вместо SMTP. Требует pg_net и настройки GoTrue в docker-compose.
5. **005_grant_api_access.sql** — GRANT для ролей `anon` и `authenticated`; без них Data API не обращается к таблицам.
6. **006_cascade_delete_studies.sql** — каскадное удаление при удалении теста (study) или сессии (session): блоки, прогоны, ответы, events, gaze_points и т.д.

## Как применить

### Вариант A: SQL Editor в Supabase Dashboard

1. Создайте проект в [Supabase Cloud](https://supabase.com) или разверните self-hosted Supabase.
2. Откройте **SQL Editor** в Dashboard.
3. Скопируйте целиком содержимое `001_full_schema.sql` → **Run**, затем по очереди `002` … `006`.

Если какой-то шаг выдаст ошибку (например, «relation already exists»), значит объект уже создан — можно править скрипт (например, заменить `CREATE TABLE` на `CREATE TABLE IF NOT EXISTS`) или пропустить соответствующую часть.

### Вариант B: Supabase CLI

В корне репозитория (где лежит папка `supabase/`):

```bash
# Привязать к своему проекту (подставьте project-ref из Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Применить миграции
supabase db push
```

Файлы в `supabase/migrations/` должны быть с именами в формате `YYYYMMDDHHMMSS_name.sql`. Если вы кладёте туда `001_full_schema.sql` и т.д., CLI может ожидать timestamp в имени — тогда переименуйте или добавьте версионные миграции с датой.

## Что создаётся

- **Таблицы:** `teams`, `folders`, `studies`, `study_blocks`, `study_shares`, `study_runs`, `study_block_responses`, `prototypes`, `sessions`, `events`, `gaze_points`, `team_members`, `team_invitations`.
- **Расширения:** `uuid-ossp`, `pgcrypto` (в схеме `extensions`).
- **RPC:** `rpc_get_public_study`, `rpc_start_public_run`, `rpc_finish_run`, `rpc_submit_block_response`, `rpc_get_public_results`, `get_team_members_safe`, `get_team_invitations`, `create_team_and_migrate_resources`, `remove_team_member`, `accept_team_invitation`, плюс вспомогательные `is_team_member`, `check_user_in_team`, `set_user_id`.
- **Storage:** ведра `recordings` (видео сессий) и `study-images` (изображения в блоках теста), с политиками доступа.

## После миграций

1. В **Dashboard → Settings → API** возьмите **Project URL** и **anon public** ключ.
2. В проектах **figma-analytics** и **figma-viewer** в `.env` задайте:
   - `VITE_SUPABASE_URL=<Project URL>`
   - `VITE_SUPABASE_ANON_KEY=<anon key>`
3. Дальше — по основной инструкции (Часть 2 и далее): регистрация, Figma OAuth, запуск приложений.

## Английская версия

See [INSTALLATION_EN.md](../../INSTALLATION_EN.md) Part 5 for the same steps in English.
