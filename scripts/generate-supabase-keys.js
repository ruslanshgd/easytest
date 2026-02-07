#!/usr/bin/env node
/**
 * Генерирует ANON_KEY и SERVICE_ROLE_KEY в формате JWT для self-hosted Supabase.
 * Требуется JWT_SECRET из ~/supabase/docker/.env (или переменная окружения).
 *
 * Использование:
 *   JWT_SECRET=ваш_секрет node scripts/generate-supabase-keys.js
 *   или из каталога, где лежит supabase/docker/.env:
 *   node scripts/generate-supabase-keys.js  # прочитает $HOME/supabase/docker/.env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signatureInput}.${signature}`;
}

function main() {
  let jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    const envPath = path.join(process.env.HOME || '/root', 'supabase/docker/.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const m = content.match(/^JWT_SECRET=(.+)$/m);
      if (m) jwtSecret = m[1].trim();
    }
  }

  if (!jwtSecret) {
    console.error(
      'Ошибка: JWT_SECRET не найден. Укажите: JWT_SECRET=ваш_секрет node scripts/generate-supabase-keys.js'
    );
    process.exit(1);
  }

  const anonPayload = { role: 'anon', iss: 'supabase' };
  const servicePayload = { role: 'service_role', iss: 'supabase' };

  const anonKey = signJwt(anonPayload, jwtSecret);
  const serviceRoleKey = signJwt(servicePayload, jwtSecret);

  console.log('# Добавьте в ~/supabase/docker/.env (замените ANON_KEY и SERVICE_ROLE_KEY):');
  console.log('');
  console.log('ANON_KEY=' + anonKey);
  console.log('SERVICE_ROLE_KEY=' + serviceRoleKey);
  console.log('');
  console.log('# Для figma-viewer и figma-analytics .env.production:');
  console.log('VITE_SUPABASE_ANON_KEY=' + anonKey);
}

main();
