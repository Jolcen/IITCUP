// src/hooks/useProfile.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function useProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setProfile(null);
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!mounted) return;
      if (error) console.error(error);
      setProfile(data ?? null);
    }
    load();
    return () => { mounted = false; };
  }, []);

  return profile; // { id, nombre, email, rol, ... }
}
