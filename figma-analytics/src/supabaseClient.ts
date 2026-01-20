// supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// Используем переменные окружения (БЕЗ fallback значений для безопасности)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// КРИТИЧНО: Проверяем наличие ключей и выбрасываем ошибку, если они отсутствуют
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missingVars = [];
  if (!SUPABASE_URL) missingVars.push("VITE_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missingVars.push("VITE_SUPABASE_ANON_KEY");
  
  throw new Error(
    `❌ Supabase credentials are missing! Please set the following environment variables in .env file: ${missingVars.join(", ")}\n` +
    `Create .env file in the root directory with:\n` +
    `VITE_SUPABASE_URL=your_supabase_url\n` +
    `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
  );
}

// Диагностика: проверяем формат URL (только в development)
if (import.meta.env.DEV) {
  console.log('🔍 Supabase Configuration Check:');
  console.log('  - URL:', SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : '❌ MISSING');
  console.log('  - Anon Key:', SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : '❌ MISSING');
  
  // Проверяем, что URL начинается с https://
  if (SUPABASE_URL && !SUPABASE_URL.startsWith('https://')) {
    console.warn('⚠️ WARNING: SUPABASE_URL should start with https://');
  }
  
  // Проверяем, что URL заканчивается на .supabase.co
  if (SUPABASE_URL && !SUPABASE_URL.includes('.supabase.co')) {
    console.warn('⚠️ WARNING: SUPABASE_URL should contain .supabase.co');
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Добавляем retry для сетевых ошибок
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'figma-analytics@1.0.0',
    },
  },
});

