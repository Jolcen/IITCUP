import { FaHome, FaSignOutAlt, FaClipboardList, FaHistory, FaCog, FaUserCircle } from "react-icons/fa";
import "../styles/Sidebar.css";

import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Sidebar() {
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();




  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) setProfile(null); return; }

      const { data, error } = await supabase
        .from("app_users")
        .select("nombre, rol, email")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (error) console.error(error);

      // Preferimos mostrar el nombre; si no hay perfil, usamos metadata->name o el “local-part” del email
      const fallbackName = user.user_metadata?.name || (user.email ? user.email.split("@")[0] : "Usuario");
      setProfile(
        data
          ? { ...data }
          : { nombre: fallbackName, email: user.email, rol: null } // sin rol visible
      );
    }

    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) setProfile(null);
      else loadProfile();
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("perfil");
      navigate("/login", { replace: true });
    }
  };

  const roleMap = {
    administrador: "Administrador",
    operador: "Operador",
    asistente: "Asistente",
  };

  const roleLabel = useMemo(() => {
    if (!profile?.rol) return "Sin rol";
    return roleMap[profile.rol] ?? profile.rol;
  }, [profile]);

  const roleClass = useMemo(() => {
    if (!profile?.rol) return "none";
    if (profile.rol === "administrador") return "admin";
    if (profile.rol === "operador") return "operador";
    if (profile.rol === "asistente") return "asistente";
    return "none";
  }, [profile]);

  const isAdmin = profile?.rol === "administrador";

  return (
    <div className="sidebar">
      <div className="logo">
        <img src="/static/images/logo.png" alt="Logo" className="logo" />
        <h2>IITCUP</h2>
      </div>

      <div className="menu-section">
        <p className="section-title">MENÚ PRINCIPAL</p>
        <ul>
          <NavLink to="/"><li><FaHome /> Inicio</li></NavLink>
          <NavLink to="/evaluaciones"><li><FaClipboardList /> Evaluaciones</li></NavLink>
          <NavLink to="/historial"><li><FaHistory /> Historial</li></NavLink>
        </ul>
      </div>

      {isAdmin && (
        <div className="menu-section">
          <p className="section-title">CONFIGURACIÓN</p>
          <ul>
            <NavLink to="/sistema"><li><FaCog /> Sistema</li></NavLink>
            <NavLink to="/usuarios"><li><FaUserCircle /> Usuarios</li></NavLink>
          </ul>
        </div>
      )}

      <div className="user-card">
        <div className="user-left">
          <div className="user-avatar">
            <FaUserCircle />
          </div>
          <div className="user-meta">
            <div className="user-name" title={profile?.email || ""}>
              {profile?.nombre ?? "Usuario"}
            </div>
            <span className={`role-badge ${roleClass}`}>{roleLabel}</span>
          </div>
        </div>

        <button className="logout-btn" title="Cerrar sesión" onClick={logout}>
          <FaSignOutAlt />
        </button>
      </div>
    </div>
  );
}
