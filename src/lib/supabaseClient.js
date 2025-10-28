// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('[Supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
}

export const supabase =
  globalThis.__supabase ??
  (globalThis.__supabase = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,  // deja true si usas OAuth/PKCE
      // flowType: 'pkce',        // activa solo si haces OAuth (Google, etc.)
      storageKey: 'sb-webpsico-auth',
    },
    global: {
      headers: { 'x-client-info': 'web-psicologica/ia' },
    },
  }));

/* Helpers opcionales */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/** Lanza si no hay sesión (para guards simples en componentes) */
export async function requireAuth() {
  const u = await getUser();
  if (!u) throw new Error('Sesión no válida. Inicia sesión.');
  return u;
}
