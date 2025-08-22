import { supabase } from '../lib/supabaseClient';

export async function signUp({ email, password, nombre, rol = 'operador' }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // Si el proyecto requiere confirmación por email, data.user puede venir null hasta confirmar.
  const user = data.user;
  if (!user) return { pendingEmailConfirm: true };

  // Inserta perfil en app_users (RLS permite al propio usuario insertar si lo deseas,
  // o puedes hacerlo con una policy para admin; aquí asumimos permitido).
  const { error: e2 } = await supabase.from('app_users').insert({
    id: user.id,
    nombre,
    email,
    rol
  });
  if (e2) throw e2;

  return { user };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

export async function signOut() {
  await supabase.auth.signOut();
}
