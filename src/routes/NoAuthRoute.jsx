// src/routes/NoAuthRoute.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function NoAuthRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setHasSession(!!data.session);
        setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (mounted) setHasSession(!!sess);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  return hasSession ? <Navigate to="/" replace /> : children;
}
