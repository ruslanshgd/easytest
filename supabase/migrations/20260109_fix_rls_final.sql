-- Удаляем ВСЕ политики
DROP POLICY IF EXISTS "Team creator full access" ON teams;
DROP POLICY IF EXISTS "View own membership" ON team_members;
DROP POLICY IF EXISTS "Team creator manages members" ON team_members;

-- TEAMS: простая политика - создатель видит свою команду
CREATE POLICY "teams_creator_access" ON teams
FOR ALL USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- TEAM_MEMBERS: разделяем SELECT и остальные операции
-- SELECT: пользователь видит только свои записи (без подзапросов!)
CREATE POLICY "team_members_select_own" ON team_members
FOR SELECT USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: создатель команды может управлять
CREATE POLICY "team_members_manage" ON team_members
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.created_by = auth.uid())
);

CREATE POLICY "team_members_update" ON team_members
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.created_by = auth.uid())
);

CREATE POLICY "team_members_delete" ON team_members
FOR DELETE USING (
  EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.created_by = auth.uid())
);
