-- =============================================================================
-- 006_cascade_delete_studies.sql
--
-- Каскадное удаление: при удалении теста (study) или сессии (session)
-- удаляются связанные блоки, прогоны, ответы, events, gaze_points и т.д.
-- Без этого удаление теста или сессии даёт нарушение FK (409 Conflict).
-- =============================================================================

ALTER TABLE public.study_blocks
  DROP CONSTRAINT IF EXISTS study_blocks_study_id_fkey,
  ADD CONSTRAINT study_blocks_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE CASCADE;

ALTER TABLE public.study_shares
  DROP CONSTRAINT IF EXISTS study_shares_study_id_fkey,
  ADD CONSTRAINT study_shares_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE CASCADE;

ALTER TABLE public.study_runs
  DROP CONSTRAINT IF EXISTS study_runs_study_id_fkey,
  ADD CONSTRAINT study_runs_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE CASCADE;

ALTER TABLE public.study_block_responses
  DROP CONSTRAINT IF EXISTS study_block_responses_run_id_fkey,
  ADD CONSTRAINT study_block_responses_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.study_runs(id) ON DELETE CASCADE;

ALTER TABLE public.study_block_responses
  DROP CONSTRAINT IF EXISTS study_block_responses_block_id_fkey,
  ADD CONSTRAINT study_block_responses_block_id_fkey
    FOREIGN KEY (block_id) REFERENCES public.study_blocks(id) ON DELETE CASCADE;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_run_id_fkey,
  ADD CONSTRAINT sessions_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.study_runs(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_block_id_fkey,
  ADD CONSTRAINT sessions_block_id_fkey
    FOREIGN KEY (block_id) REFERENCES public.study_blocks(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_study_id_fkey,
  ADD CONSTRAINT sessions_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE SET NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_run_id_fkey,
  ADD CONSTRAINT events_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.study_runs(id) ON DELETE SET NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_block_id_fkey,
  ADD CONSTRAINT events_block_id_fkey
    FOREIGN KEY (block_id) REFERENCES public.study_blocks(id) ON DELETE SET NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_study_id_fkey,
  ADD CONSTRAINT events_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE SET NULL;

ALTER TABLE public.gaze_points
  DROP CONSTRAINT IF EXISTS gaze_points_run_id_fkey,
  ADD CONSTRAINT gaze_points_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.study_runs(id) ON DELETE CASCADE;

ALTER TABLE public.gaze_points
  DROP CONSTRAINT IF EXISTS gaze_points_study_id_fkey,
  ADD CONSTRAINT gaze_points_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE CASCADE;

ALTER TABLE public.gaze_points
  DROP CONSTRAINT IF EXISTS gaze_points_block_id_fkey,
  ADD CONSTRAINT gaze_points_block_id_fkey
    FOREIGN KEY (block_id) REFERENCES public.study_blocks(id) ON DELETE CASCADE;

-- events.session_id → sessions(id) ON DELETE CASCADE
-- Без этого удаление сессии (DELETE FROM sessions) даёт 409 Conflict,
-- потому что events ссылаются на sessions(id).
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_session_id_fkey,
  ADD CONSTRAINT events_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- gaze_points.session_id → sessions(id) ON DELETE CASCADE
ALTER TABLE public.gaze_points
  DROP CONSTRAINT IF EXISTS gaze_points_session_id_fkey,
  ADD CONSTRAINT gaze_points_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
