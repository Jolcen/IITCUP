import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) { setSession(data.session ?? null); setLoading(false); }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => mounted && setSession(sess));
    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  if (loading) return <div style={{padding:24}}>Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
