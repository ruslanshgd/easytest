-- FigmaTest: full schema (no data). Run in Supabase SQL Editor or via Supabase CLI.
-- Order: extensions → tables (FK-safe) → no data.

-- ---------------------------------------------------------------------------
-- Extensions (Supabase Cloud usually has these; self-hosted may need them)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables (dependency order: auth.users is provided by Supabase)
-- ---------------------------------------------------------------------------

-- Teams (created_by → auth.users)
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id)
);

-- Folders
CREATE TABLE IF NOT EXISTS public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_id uuid REFERENCES public.teams(id),
  created_at timestamptz DEFAULT now(),
  parent_id uuid REFERENCES public.folders(id)
);

COMMENT ON TABLE public.folders IS 'Папки для организации тестов (studies)';

-- Studies
CREATE TABLE IF NOT EXISTS public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  folder_id uuid REFERENCES public.folders(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stopped')),
  created_at timestamptz DEFAULT now(),
  share_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'base64'),
  team_id uuid REFERENCES public.teams(id),
  published_blocks_snapshot jsonb
);

COMMENT ON TABLE public.studies IS 'Studies container for organizing prototype and question blocks';

-- Prototypes
CREATE TABLE IF NOT EXISTS public.prototypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  task_description text,
  single_session_only boolean DEFAULT false,
  team_id uuid REFERENCES public.teams(id),
  CONSTRAINT prototypes_ownership_check CHECK (
    ((user_id IS NOT NULL) AND (team_id IS NULL)) OR 
    ((user_id IS NULL) AND (team_id IS NOT NULL))
  )
);

COMMENT ON COLUMN public.prototypes.task_description IS 'Описание задания для респондента (макс. 250 символов)';
COMMENT ON COLUMN public.prototypes.single_session_only IS 'Если true, то для этого прототипа разрешена только одна сессия';

-- Study blocks
CREATE TABLE IF NOT EXISTS public.study_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id),
  type text NOT NULL CHECK (type IN (
    'prototype', 'open_question', 'umux_lite', 'choice', 'context', 'scale', 'preference',
    'five_seconds', 'card_sorting', 'tree_testing', 'first_click', 'matrix', 'agreement'
  )),
  order_index integer NOT NULL,
  prototype_id uuid REFERENCES public.prototypes(id),
  instructions text,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.study_blocks IS 'Blocks within a study (prototype or question type)';
COMMENT ON COLUMN public.study_blocks.instructions IS 'Instructions for prototype block (NOT stored in prototypes.task_description)';
COMMENT ON COLUMN public.study_blocks.config IS 'JSON configuration for question blocks (e.g., { question: "..." })';

-- Study shares
CREATE TABLE IF NOT EXISTS public.study_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id),
  token text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('respond', 'view')),
  access text NOT NULL CHECK (access IN ('draft_only', 'published_only', 'any')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

COMMENT ON TABLE public.study_shares IS 'Share tokens for public access to studies';

-- Study runs
CREATE TABLE IF NOT EXISTS public.study_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id),
  share_id uuid REFERENCES public.study_shares(id),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'finished', 'abandoned')),
  client_meta jsonb NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.study_runs IS 'Runs (прохождения) studies через share tokens';

-- Study block responses
CREATE TABLE IF NOT EXISTS public.study_block_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.study_runs(id),
  block_id uuid NOT NULL REFERENCES public.study_blocks(id),
  created_at timestamptz DEFAULT now(),
  duration_ms integer,
  answer jsonb NOT NULL DEFAULT '{}',
  UNIQUE (run_id, block_id)
);

COMMENT ON TABLE public.study_block_responses IS 'Responses to question blocks within a study run';

-- Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  prototype_id uuid REFERENCES public.prototypes(id),
  user_id uuid REFERENCES auth.users(id),
  umux_lite_item1 integer CHECK (umux_lite_item1 >= 1 AND umux_lite_item1 <= 7),
  umux_lite_item2 integer CHECK (umux_lite_item2 >= 1 AND umux_lite_item2 <= 7),
  umux_lite_score numeric,
  umux_lite_sus_score numeric,
  feedback_text text,
  run_id uuid REFERENCES public.study_runs(id),
  block_id uuid REFERENCES public.study_blocks(id),
  study_id uuid REFERENCES public.studies(id),
  completed boolean DEFAULT false,
  aborted boolean DEFAULT false,
  recording_url text,
  recording_screen_url text
);

COMMENT ON COLUMN public.sessions.umux_lite_item1 IS 'UMUX Lite вопрос 1: Возможности прототипа полностью удовлетворяют потребностям (1-7)';
COMMENT ON COLUMN public.sessions.umux_lite_item2 IS 'UMUX Lite вопрос 2: Прототип было легко использовать (1-7)';
COMMENT ON COLUMN public.sessions.umux_lite_score IS 'UMUX Lite итоговый score: ((item1-1 + item2-1) / 12) * 100';
COMMENT ON COLUMN public.sessions.umux_lite_sus_score IS 'UMUX Lite приведенный к SUS: 0.65 * ((item1 + item2 - 2) * (100/12)) + 22.9';
COMMENT ON COLUMN public.sessions.feedback_text IS 'Свободный текст фидбэка от респондента после прохождения теста';
COMMENT ON COLUMN public.sessions.run_id IS 'Link to study run (nullable, для legacy compatibility)';
COMMENT ON COLUMN public.sessions.block_id IS 'Link to study block (nullable, для legacy compatibility)';
COMMENT ON COLUMN public.sessions.study_id IS 'Link to study (nullable, для legacy compatibility)';
COMMENT ON COLUMN public.sessions.completed IS 'Флаг завершения сессии (достигнут финальный экран)';
COMMENT ON COLUMN public.sessions.aborted IS 'Флаг прерывания сессии (пользователь нажал "Сдаться")';
COMMENT ON COLUMN public.sessions.recording_url IS 'URL of the uploaded video recording from the test session (stored in Supabase Storage)';

-- Events
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id),
  event_type text,
  screen_id text,
  hotspot_id text,
  timestamp timestamptz DEFAULT now(),
  x double precision,
  y double precision,
  user_id uuid REFERENCES auth.users(id),
  scroll_x double precision,
  scroll_y double precision,
  scroll_depth_x double precision,
  scroll_depth_y double precision,
  scroll_direction text,
  is_nested boolean,
  frame_id text,
  scroll_type text,
  overlay_id text,
  overlay_position text,
  overlay_close_method text,
  overlay_old_id text,
  overlay_new_id text,
  metadata jsonb,
  run_id uuid REFERENCES public.study_runs(id),
  block_id uuid REFERENCES public.study_blocks(id),
  study_id uuid REFERENCES public.studies(id)
);

COMMENT ON COLUMN public.events.x IS 'Координата X клика в пикселях (для кликов в пустую область)';
COMMENT ON COLUMN public.events.y IS 'Координата Y клика в пикселях (для кликов в пустую область)';
COMMENT ON COLUMN public.events.scroll_x IS 'Координата X скролла (scrollLeft)';
COMMENT ON COLUMN public.events.scroll_y IS 'Координата Y скролла (scrollTop)';
COMMENT ON COLUMN public.events.scroll_depth_x IS 'Глубина скролла по X в процентах (0-100)';
COMMENT ON COLUMN public.events.scroll_depth_y IS 'Глубина скролла по Y в процентах (0-100)';
COMMENT ON COLUMN public.events.scroll_direction IS 'Направление скролла: up, down, left, right';
COMMENT ON COLUMN public.events.is_nested IS 'Является ли скролл вложенного фрейма (true) или основного экрана (false)';
COMMENT ON COLUMN public.events.frame_id IS 'ID фрейма, который скроллится (для вложенных фреймов)';
COMMENT ON COLUMN public.events.scroll_type IS 'Тип скролла: vertical (вертикальный), horizontal (горизонтальный), both (оба направления)';
COMMENT ON COLUMN public.events.overlay_id IS 'ID экрана-оверлея (для overlay_open, overlay_close, overlay_swap)';
COMMENT ON COLUMN public.events.overlay_position IS 'Позиция оверлея (CENTERED, TOP_LEFT, ...)';
COMMENT ON COLUMN public.events.overlay_close_method IS 'Метод закрытия оверлея: button, outside_click, swap';
COMMENT ON COLUMN public.events.overlay_old_id IS 'ID старого оверлея (для overlay_swap)';
COMMENT ON COLUMN public.events.overlay_new_id IS 'ID нового оверлея (для overlay_swap)';
COMMENT ON COLUMN public.events.metadata IS 'Расширяемые метаданные события (renderer, proto_version, transition данные и т.д.)';
COMMENT ON COLUMN public.events.run_id IS 'Link to study run (nullable, для legacy compatibility)';
COMMENT ON COLUMN public.events.block_id IS 'Link to study block (nullable, для legacy compatibility)';
COMMENT ON COLUMN public.events.study_id IS 'Link to study (nullable, для legacy compatibility)';

-- Gaze points
CREATE TABLE IF NOT EXISTS public.gaze_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  run_id uuid NOT NULL REFERENCES public.study_runs(id),
  study_id uuid NOT NULL REFERENCES public.studies(id),
  block_id uuid NOT NULL REFERENCES public.study_blocks(id),
  screen_id text,
  ts_ms bigint NOT NULL,
  x_norm real NOT NULL,
  y_norm real NOT NULL
);

-- Team members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- Team invitations
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'base64'),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz
);

-- Index for events by session (analytics queries)
CREATE INDEX IF NOT EXISTS idx_events_session_id ON public.events(session_id);
