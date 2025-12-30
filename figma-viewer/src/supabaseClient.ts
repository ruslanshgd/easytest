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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

