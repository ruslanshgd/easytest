-- FigmaTest: functions, triggers, RPCs, RLS. Run after 001_full_schema.sql.
-- No data; schema only.

-- ---------------------------------------------------------------------------
-- Helper functions (must exist before RLS policies that use them)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
    AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.check_user_in_team(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
    AND user_id = p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_TABLE_NAME = 'prototypes' THEN
    IF NEW.user_id IS NOT NULL THEN
      NEW.user_id := auth.uid();
    END IF;
  ELSE
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers (set user_id on insert)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_user_id_sessions ON public.sessions;
CREATE TRIGGER set_user_id_sessions
  BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS set_user_id_events ON public.events;
CREATE TRIGGER set_user_id_events
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS set_user_id_prototypes ON public.prototypes;
CREATE TRIGGER set_user_id_prototypes
  BEFORE INSERT ON public.prototypes
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- ---------------------------------------------------------------------------
-- RPC: study run lifecycle (callable by anon for public links)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_get_public_study(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_study_id uuid;
  v_study_status text;
  v_study_title text;
  v_snapshot jsonb;
  v_blocks jsonb;
  v_token_norm text;
BEGIN
  v_token_norm := TRIM(BOTH '/' FROM TRIM(COALESCE(p_token, '')));
  IF v_token_norm = '' THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  SELECT id, status, title, published_blocks_snapshot
  INTO v_study_id, v_study_status, v_study_title, v_snapshot
  FROM studies
  WHERE TRIM(BOTH '/' FROM TRIM(share_token)) = v_token_norm;

  IF v_study_id IS NULL THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  IF v_study_status IS NULL OR v_study_status NOT IN ('published', 'stopped', 'draft') THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  IF v_study_status IN ('published', 'stopped') AND v_snapshot IS NOT NULL AND jsonb_array_length(v_snapshot) > 0 THEN
    v_blocks := v_snapshot;
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'type', sb.type,
        'order_index', sb.order_index,
        'prototype_id', sb.prototype_id,
        'instructions', sb.instructions,
        'config', sb.config
      ) ORDER BY sb.order_index
    ) INTO v_blocks
    FROM study_blocks sb
    WHERE sb.study_id = v_study_id AND (sb.deleted_at IS NULL);
  END IF;

  RETURN jsonb_build_object(
    'study', jsonb_build_object(
      'id', v_study_id,
      'title', v_study_title,
      'status', v_study_status
    ),
    'blocks', COALESCE(v_blocks, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_start_public_run(p_token text, p_client_meta jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_study_id uuid;
  v_study_status text;
  v_run_id uuid;
  v_token_norm text;
BEGIN
  v_token_norm := TRIM(BOTH '/' FROM TRIM(COALESCE(p_token, '')));
  IF v_token_norm = '' THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  SELECT id, status INTO v_study_id, v_study_status
  FROM studies
  WHERE TRIM(BOTH '/' FROM TRIM(share_token)) = v_token_norm;

  IF v_study_id IS NULL THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  IF v_study_status IS NULL OR v_study_status NOT IN ('published', 'stopped', 'draft') THEN
    RAISE EXCEPTION 'Study not found or token invalid';
  END IF;

  INSERT INTO study_runs (study_id, client_meta)
  VALUES (v_study_id, COALESCE(p_client_meta, '{}'::jsonb))
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finish_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  run_record study_runs%ROWTYPE;
BEGIN
  SELECT * INTO run_record
  FROM study_runs
  WHERE id = p_run_id AND status = 'started';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found or already finished';
  END IF;

  UPDATE study_runs
  SET status = 'finished', finished_at = now()
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_block_response(p_run_id uuid, p_block_id uuid, p_answer jsonb, p_duration_ms integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  run_record study_runs%ROWTYPE;
  block_record study_blocks%ROWTYPE;
BEGIN
  SELECT * INTO run_record
  FROM study_runs
  WHERE id = p_run_id AND status = 'started';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found or already finished';
  END IF;

  SELECT * INTO block_record
  FROM study_blocks
  WHERE id = p_block_id AND study_id = run_record.study_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block not found or does not belong to study';
  END IF;

  IF block_record.type NOT IN ('open_question', 'umux_lite', 'choice', 'scale', 'preference', 'card_sorting', 'tree_testing', 'first_click', 'agreement', 'matrix') THEN
    RAISE EXCEPTION 'Block type % does not accept responses', block_record.type;
  END IF;

  INSERT INTO study_block_responses (run_id, block_id, answer, duration_ms)
  VALUES (p_run_id, p_block_id, p_answer, p_duration_ms)
  ON CONFLICT (run_id, block_id)
  DO UPDATE SET
    answer = EXCLUDED.answer,
    duration_ms = EXCLUDED.duration_ms,
    created_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_public_results(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  share_record study_shares%ROWTYPE;
  study_record studies%ROWTYPE;
  runs_count int;
  finished_count int;
  completion_rate numeric;
  responses_array jsonb;
  prototype_metrics jsonb;
  result jsonb;
BEGIN
  SELECT * INTO share_record
  FROM study_shares
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  IF share_record.mode != 'view' THEN
    RAISE EXCEPTION 'Token mode must be "view" to access results';
  END IF;

  SELECT * INTO study_record
  FROM studies
  WHERE id = share_record.study_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study not found';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'finished')::int
  INTO runs_count, finished_count
  FROM study_runs
  WHERE study_id = share_record.study_id;

  IF runs_count > 0 THEN
    completion_rate := ROUND((finished_count::numeric / runs_count::numeric) * 100, 2);
  ELSE
    completion_rate := 0;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'block_id', block_id,
      'block_type', (SELECT type FROM study_blocks WHERE id = block_id),
      'responses_count', COUNT(*),
      'avg_duration_ms', AVG(duration_ms),
      'sample_responses', jsonb_agg(
        jsonb_build_object(
          'run_id', run_id,
          'answer', answer,
          'duration_ms', duration_ms,
          'created_at', created_at
        ) ORDER BY created_at DESC
      ) FILTER (WHERE COUNT(*) <= 10)
    )
  ) INTO responses_array
  FROM study_block_responses
  WHERE run_id IN (SELECT id FROM study_runs WHERE study_id = share_record.study_id)
  GROUP BY block_id;

  SELECT jsonb_build_object(
    'total_events', COUNT(*),
    'events_by_type', jsonb_object_agg(event_type, count) FILTER (WHERE event_type IS NOT NULL),
    'sessions_count', COUNT(DISTINCT session_id),
    'avg_events_per_session', CASE
      WHEN COUNT(DISTINCT session_id) > 0
      THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT session_id), 2)
      ELSE 0
    END
  ) INTO prototype_metrics
  FROM (
    SELECT event_type, COUNT(*) as count, session_id
    FROM events
    WHERE run_id IN (SELECT id FROM study_runs WHERE study_id = share_record.study_id)
    GROUP BY event_type, session_id
  ) subq;

  result := jsonb_build_object(
    'study', jsonb_build_object(
      'id', study_record.id,
      'title', study_record.title,
      'status', study_record.status
    ),
    'runs', jsonb_build_object(
      'total', runs_count,
      'finished', finished_count,
      'completion_rate', completion_rate
    ),
    'block_responses', COALESCE(responses_array, '[]'::jsonb),
    'prototype_metrics', COALESCE(prototype_metrics, '{}'::jsonb)
  );

  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: team (auth required where noted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_team_members_safe(p_team_id uuid)
RETURNS TABLE(id uuid, member_user_id uuid, role text, joined_at timestamptz, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT
    tm.id,
    tm.user_id,
    tm.role,
    tm.joined_at,
    u.email
  FROM team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
  AND (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team_id AND t.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm2 WHERE tm2.team_id = p_team_id AND tm2.user_id = auth.uid())
  )
  ORDER BY tm.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_team_invitations(p_team_id uuid)
RETURNS TABLE(id uuid, team_id uuid, email text, status text, token text, invited_by uuid, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = p_team_id AND t.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT ti.id, ti.team_id, ti.email, ti.status, ti.token, ti.invited_by, ti.created_at, ti.expires_at
  FROM team_invitations ti
  WHERE ti.team_id = p_team_id AND ti.status = 'pending' AND ti.expires_at > NOW()
  ORDER BY ti.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_team_and_migrate_resources(p_team_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = v_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'User already has a team';
  END IF;

  INSERT INTO teams (name, created_by)
  VALUES (p_team_name, v_user_id)
  RETURNING id INTO v_team_id;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_team_id, v_user_id, 'owner');

  UPDATE studies SET team_id = v_team_id, user_id = NULL WHERE user_id = v_user_id;
  UPDATE prototypes SET team_id = v_team_id, user_id = NULL WHERE user_id = v_user_id;

  RETURN v_team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_team_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = v_current_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only team owner can remove members';
  END IF;

  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove team owner';
  END IF;

  DELETE FROM team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation team_invitations%ROWTYPE;
  v_user_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invitation
  FROM team_invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or expired';
  END IF;

  IF v_invitation.email != v_user_email THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = v_invitation.team_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this team';
  END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_invitation.team_id, v_user_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE team_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN v_invitation.team_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_block_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prototypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaze_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS policies: teams
-- ---------------------------------------------------------------------------

CREATE POLICY "Team creator full access" ON public.teams
  FOR ALL TO public
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Team members can view teams" ON public.teams
  FOR SELECT TO public
  USING ((created_by = auth.uid()) OR is_team_member(id, auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS policies: team_members
-- ---------------------------------------------------------------------------

CREATE POLICY "View own membership" ON public.team_members
  FOR SELECT TO public
  USING (user_id = auth.uid());

CREATE POLICY "Team creator manages members" ON public.team_members
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.created_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS policies: team_invitations
-- ---------------------------------------------------------------------------

CREATE POLICY "Owners can view team invitations" ON public.team_invitations
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_invitations.team_id AND teams.created_by = auth.uid()));

CREATE POLICY "Owners can create invitations" ON public.team_invitations
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_invitations.team_id AND teams.created_by = auth.uid()));

CREATE POLICY "Owners can delete team invitations" ON public.team_invitations
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_invitations.team_id AND teams.created_by = auth.uid()));

CREATE POLICY "Anyone can view invitation by token" ON public.team_invitations
  FOR SELECT TO public
  USING ((status = 'pending') AND (expires_at > now()));

-- ---------------------------------------------------------------------------
-- RLS policies: folders
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view folders" ON public.folders
  FOR SELECT TO public
  USING ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid()));

CREATE POLICY "Users can create folders" ON public.folders
  FOR INSERT TO public
  WITH CHECK ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid()));

CREATE POLICY "Users can update folders" ON public.folders
  FOR UPDATE TO public
  USING ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid()));

CREATE POLICY "Users can delete folders" ON public.folders
  FOR DELETE TO public
  USING ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS policies: studies
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view studies" ON public.studies
  FOR SELECT TO public
  USING ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

CREATE POLICY "Users can create studies" ON public.studies
  FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

CREATE POLICY "Users can update studies" ON public.studies
  FOR UPDATE TO public
  USING ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

CREATE POLICY "Users can delete studies" ON public.studies
  FOR DELETE TO public
  USING ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

-- ---------------------------------------------------------------------------
-- RLS policies: study_blocks
-- ---------------------------------------------------------------------------

CREATE POLICY "Team members can view study blocks" ON public.study_blocks
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_blocks.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Team members can insert study blocks" ON public.study_blocks
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_blocks.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Team members can update study blocks" ON public.study_blocks
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_blocks.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Team members can delete study blocks" ON public.study_blocks
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_blocks.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

-- ---------------------------------------------------------------------------
-- RLS policies: study_shares
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view own study shares" ON public.study_shares
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_shares.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Users can insert own study shares" ON public.study_shares
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_shares.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Users can update own study shares" ON public.study_shares
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_shares.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Users can delete own study shares" ON public.study_shares
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_shares.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

-- ---------------------------------------------------------------------------
-- RLS policies: study_runs
-- ---------------------------------------------------------------------------

CREATE POLICY "Team members can view study runs" ON public.study_runs
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_runs.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Team members can delete study runs" ON public.study_runs
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM studies s WHERE s.id = study_runs.study_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

-- ---------------------------------------------------------------------------
-- RLS policies: study_block_responses
-- ---------------------------------------------------------------------------

CREATE POLICY "Team members can view study block responses" ON public.study_block_responses
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM study_runs sr JOIN studies s ON s.id = sr.study_id WHERE sr.id = study_block_responses.run_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

CREATE POLICY "Team members can delete study block responses" ON public.study_block_responses
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM study_runs sr JOIN studies s ON s.id = sr.study_id WHERE sr.id = study_block_responses.run_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))));

-- ---------------------------------------------------------------------------
-- RLS policies: prototypes
-- ---------------------------------------------------------------------------

CREATE POLICY "Anyone can read prototypes" ON public.prototypes
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Team members can insert prototypes" ON public.prototypes
  FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL) AND ((user_id = auth.uid()) OR (user_id IS NULL) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid()))));

CREATE POLICY "Team members can update prototypes" ON public.prototypes
  FOR UPDATE TO public
  USING ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

CREATE POLICY "Team members can delete prototypes" ON public.prototypes
  FOR DELETE TO public
  USING ((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND is_team_member(team_id, auth.uid())));

-- ---------------------------------------------------------------------------
-- RLS policies: sessions
-- ---------------------------------------------------------------------------

CREATE POLICY "Anonymous can insert sessions" ON public.sessions
  FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NULL) AND (user_id IS NULL) AND ((prototype_id IS NULL) OR (prototype_id IN (SELECT id FROM prototypes))));

CREATE POLICY "Anonymous can read anonymous sessions" ON public.sessions
  FOR SELECT TO public
  USING ((auth.uid() IS NULL) AND (user_id IS NULL) AND ((prototype_id IS NULL) OR (prototype_id IN (SELECT id FROM prototypes))));

CREATE POLICY "Anonymous can update anonymous sessions" ON public.sessions
  FOR UPDATE TO public
  USING ((auth.uid() IS NULL) AND (user_id IS NULL))
  WITH CHECK ((auth.uid() IS NULL) AND (user_id IS NULL));

CREATE POLICY "Users can insert own sessions" ON public.sessions
  FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.sessions
  FOR UPDATE TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team members can read sessions" ON public.sessions
  FOR SELECT TO public
  USING (
    (user_id IS NULL) OR (user_id = auth.uid())
    OR (EXISTS (SELECT 1 FROM prototypes p WHERE p.id = sessions.prototype_id AND ((p.user_id = auth.uid()) OR ((p.team_id IS NOT NULL) AND is_team_member(p.team_id, auth.uid()))))
    OR (EXISTS (SELECT 1 FROM study_blocks sb JOIN studies s ON s.id = sb.study_id WHERE sb.id = sessions.block_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))))
  );

CREATE POLICY "Team members can delete sessions" ON public.sessions
  FOR DELETE TO public
  USING (
    (EXISTS (SELECT 1 FROM prototypes p WHERE p.id = sessions.prototype_id AND ((p.user_id = auth.uid()) OR ((p.team_id IS NOT NULL) AND is_team_member(p.team_id, auth.uid())))))
    OR (EXISTS (SELECT 1 FROM study_blocks sb JOIN studies s ON s.id = sb.study_id WHERE sb.id = sessions.block_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))))
  );

-- ---------------------------------------------------------------------------
-- RLS policies: events
-- ---------------------------------------------------------------------------

CREATE POLICY "Anonymous can insert events for anonymous sessions" ON public.events
  FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NULL) AND (user_id IS NULL) AND (session_id IN (
    SELECT id FROM sessions WHERE (user_id IS NULL) AND ((prototype_id IS NULL) OR (prototype_id IN (SELECT id FROM prototypes)))
  )));

CREATE POLICY "Anonymous can read events for anonymous sessions" ON public.events
  FOR SELECT TO public
  USING ((auth.uid() IS NULL) AND (user_id IS NULL) AND (session_id IN (
    SELECT id FROM sessions WHERE (user_id IS NULL) AND ((prototype_id IS NULL) OR (prototype_id IN (SELECT id FROM prototypes)))
  )));

CREATE POLICY "Users can insert events for own sessions" ON public.events
  FOR INSERT TO public
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Team members can read events" ON public.events
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM sessions ses
    WHERE ses.id = events.session_id
    AND (
      (ses.user_id IS NULL) OR (ses.user_id = auth.uid())
      OR (EXISTS (SELECT 1 FROM prototypes p WHERE p.id = ses.prototype_id AND ((p.user_id = auth.uid()) OR ((p.team_id IS NOT NULL) AND is_team_member(p.team_id, auth.uid()))))
      OR (EXISTS (SELECT 1 FROM study_blocks sb JOIN studies s ON s.id = sb.study_id WHERE sb.id = ses.block_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))))
    )
  ));

CREATE POLICY "Team members can delete events" ON public.events
  FOR DELETE TO public
  USING (EXISTS (
    SELECT 1 FROM sessions ses
    WHERE ses.id = events.session_id
    AND (
      (EXISTS (SELECT 1 FROM prototypes p WHERE p.id = ses.prototype_id AND ((p.user_id = auth.uid()) OR ((p.team_id IS NOT NULL) AND is_team_member(p.team_id, auth.uid()))))
      OR (EXISTS (SELECT 1 FROM study_blocks sb JOIN studies s ON s.id = sb.study_id WHERE sb.id = ses.block_id AND ((s.user_id = auth.uid()) OR ((s.team_id IS NOT NULL) AND is_team_member(s.team_id, auth.uid())))))
    )
  ));

-- ---------------------------------------------------------------------------
-- RLS policies: gaze_points
-- ---------------------------------------------------------------------------

CREATE POLICY "Anonymous can insert gaze_points for any study" ON public.gaze_points
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM sessions s WHERE s.id = gaze_points.session_id));

CREATE POLICY "Anon cannot select gaze_points" ON public.gaze_points
  FOR SELECT TO anon
  USING (false);

CREATE POLICY "Users can select gaze_points for their studies" ON public.gaze_points
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM studies st
    WHERE st.id = gaze_points.study_id
    AND ((st.user_id = auth.uid()) OR (st.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())))
  ));
