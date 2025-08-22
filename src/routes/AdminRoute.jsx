import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AdminRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted){ setIsAdmin(false); setLoading(false);} return; }
      const { data } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
      if (mounted){ setIsAdmin(data?.rol === "administrador"); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div style={{padding:24}}>Cargando…</div>;
  if (!isAdmin) return <Navigate to="/403" replace />;
  return children;
}
