// src/pages/Welcome.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Welcome() {
  const [name, setName] = useState("Usuario");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!mounted || !user) return;

      const { data } = await supabase
        .from("app_users")
        .select("nombre")
        .eq("id", user.id)
        .maybeSingle();

      const fallback =
        data?.nombre ||
        user?.user_metadata?.name ||
        (user?.email ? user.email.split("@")[0] : "Usuario");

      if (mounted) setName(fallback);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div
      style={{
        // centra en el área de contenido
        display: "grid",
        placeItems: "center",
        minHeight: "calc(100vh - 140px)", // ajusta si tu topbar/espaciados cambian
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>
          ¡Bienvenido, {name}!
        </h1>
        <p style={{ marginTop: 8, color: "#6b7280", fontSize: 16 }}>
          El acceso se realizó correctamente.
        </p>
      </div>
    </div>
  );
}
