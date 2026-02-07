-- =============================================================================
-- 004_send_email_hook.sql
--
-- Send Email Hook для Supabase Auth (GoTrue): отправка писем через HTTP API
-- вместо SMTP. На многих VPS (Reg.ru и др.) порты 587/465 заблокированы;
-- Resend/Brevo API (порт 443) обходит эту проблему.
--
-- ПОДДЕРЖИВАЕМЫЕ ПРОВАЙДЕРЫ: Resend (рекомендуется), Brevo (ex-Sendinblue).
-- ИНСТРУКЦИЯ: Замените YOUR_RESEND_API_KEY на ключ с resend.com, выполните
-- SQL, настройте GOTRUE_HOOK_* в docker-compose auth, перезапустите auth/kong.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.send_email_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_email text;
  email_action_type text;
  token text;
  token_hash text;
  subject_line text;
  html_body text;
  request_id bigint;
  resend_api_key text := 'YOUR_RESEND_API_KEY';
  sender_from text := 'IziTest <onboarding@resend.dev>';
BEGIN
  user_email := event->'user'->>'email';
  email_action_type := event->'email_data'->>'email_action_type';
  token := event->'email_data'->>'token';
  token_hash := event->'email_data'->>'token_hash';

  CASE email_action_type
    WHEN 'signup' THEN
      subject_line := 'Подтверждение регистрации — IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<h2 style="color: #333;">Добро пожаловать в IziTest!</h2>'
        '<p>Ваш код подтверждения:</p>'
        '<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">'
        '<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">%s</span>'
        '</div>'
        '<p style="color: #666; font-size: 14px;">Введите этот код на странице регистрации.</p>'
        '</div>',
        token
      );
    WHEN 'magiclink' THEN
      subject_line := 'Код входа — IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<h2 style="color: #333;">Вход в IziTest</h2>'
        '<p>Ваш код для входа:</p>'
        '<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">'
        '<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">%s</span>'
        '</div>'
        '<p style="color: #666; font-size: 14px;">Введите этот код на странице входа. Код действует 10 минут.</p>'
        '</div>',
        token
      );
    WHEN 'recovery' THEN
      subject_line := 'Восстановление пароля — IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<h2 style="color: #333;">Восстановление пароля</h2>'
        '<p>Ваш код для восстановления:</p>'
        '<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">'
        '<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">%s</span>'
        '</div>'
        '<p style="color: #666; font-size: 14px;">Если вы не запрашивали восстановление, проигнорируйте это письмо.</p>'
        '</div>',
        token
      );
    WHEN 'invite' THEN
      subject_line := 'Приглашение в IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<h2 style="color: #333;">Вас пригласили в IziTest!</h2>'
        '<p>Ваш код приглашения:</p>'
        '<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">'
        '<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">%s</span>'
        '</div>'
        '</div>',
        token
      );
    WHEN 'email_change' THEN
      subject_line := 'Подтверждение смены email — IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<h2 style="color: #333;">Смена email</h2>'
        '<p>Ваш код подтверждения:</p>'
        '<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">'
        '<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">%s</span>'
        '</div>'
        '</div>',
        token
      );
    ELSE
      subject_line := 'Уведомление от IziTest';
      html_body := format(
        '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">'
        '<p>Ваш код: <strong>%s</strong></p>'
        '</div>',
        token
      );
  END CASE;

  SELECT INTO request_id net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', sender_from,
      'to', jsonb_build_array(user_email),
      'subject', subject_line,
      'html', html_body
    ),
    headers := jsonb_build_object(
      'Authorization', format('Bearer %s', resend_api_key),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );

  RETURN '{}'::jsonb;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.send_email_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.send_email_hook(jsonb) FROM authenticated, anon, public;
GRANT USAGE ON SCHEMA net TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA net TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA net TO supabase_auth_admin;
