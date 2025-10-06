// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Usa SIEMPRE la misma instancia (singleton en el scope global del navegador)
export const supabase =
  globalThis.__supabase ??
  (globalThis.__supabase = createClient(url, anon, {
    auth: {
      persistSession: true,          // guarda la sesión en storage
      autoRefreshToken: true,        // refresca tokens automáticamente
      detectSessionInUrl: true,      // maneja el callback de OAuth/PKCE
      flowType: 'pkce',
      storageKey: 'sb-webpsico-auth' // clave única para este proyecto
    },
    // opcional: etiqueta los headers para depurar en el panel de Supabase
    global: {
      headers: { 'x-client-info': 'web-psicologica/ia' }
    }
  }));
