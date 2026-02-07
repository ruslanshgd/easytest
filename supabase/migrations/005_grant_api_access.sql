-- =============================================================================
-- 005_grant_api_access.sql
--
-- GRANT для ролей anon и authenticated. Без них Data API (PostgREST) не
-- обращается к таблицам, даже при корректных RLS. Выполнить в SQL Editor.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.prototypes TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO anon;
GRANT SELECT, INSERT ON public.events TO anon;
GRANT INSERT ON public.gaze_points TO anon;
GRANT SELECT ON public.team_invitations TO anon;
GRANT SELECT ON public.studies TO anon;
GRANT SELECT ON public.study_blocks TO anon;
GRANT SELECT ON public.study_shares TO anon;
GRANT SELECT, INSERT, UPDATE ON public.study_runs TO anon;
GRANT SELECT, INSERT ON public.study_block_responses TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_block_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prototypes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.gaze_points TO authenticated;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_in_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_user_in_team(uuid, uuid) TO anon;
