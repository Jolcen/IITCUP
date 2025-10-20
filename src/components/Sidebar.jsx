import {
  FaHome,
  FaSignOutAlt,
  FaClipboardList,
  FaHistory,
  FaCog,
  FaUserCircle,
  FaUsers,
  FaFileAlt,
} from "react-icons/fa";
import "../styles/Sidebar.css";

import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalPerfil from "../components/ModalPerfil";

export default function Sidebar() {
  const [profile, setProfile] = useState(null);
  const [openPerfil, setOpenPerfil] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("app_users")
        .select(`
          nombre,
          rol,
          email,
          staff_profiles ( avatar_url )
        `)
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (error) console.error(error);

      const fallbackName =
        user.user_metadata?.name ||
        (user.email ? user.email.split("@")[0] : "Usuario");

      const avatar_url = data?.staff_profiles?.avatar_url ?? null;

      setProfile(
        data
          ? { ...data, avatar_url }
          : { nombre: fallbackName, email: user.email, rol: null, avatar_url: null }
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
    encargado: "Encargado",
  };

  const roleLabel = useMemo(() => {
    if (!profile?.rol) return "Sin rol";
    return roleMap[profile.rol] ?? profile.rol;
  }, [profile]);

  const roleClass = useMemo(() => {
    if (!profile?.rol) return "none";
    if (["administrador"].includes(profile.rol)) return "admin";
    if (["operador", "encargado"].includes(profile.rol)) return "operador";
    if (profile.rol === "asistente") return "asistente";
    return "none";
  }, [profile]);

  // --- Ajuste solicitado: SOLO administrador puede ver "Pacientes"
  const isAdmin = profile?.rol === "administrador";
  const canManagePatients = isAdmin;

  return (
    <>
      <div className="sidebar">
        <div className="logo">
          <img src="static/images/logo.png" alt="Logo" className="logo" />
          <h2>IITCUP</h2>
        </div>

        <div className="menu-section">
          <p className="section-title">MENÚ PRINCIPAL</p>
          <ul>
            {/* ANTES: <NavLink to="/"> */}
            <NavLink to="/inicio">
              <li>
                <FaHome /> Inicio
              </li>
            </NavLink>

            {canManagePatients && (
              <NavLink to="/pacientes">
                <li>
                  <FaUsers /> Pacientes
                </li>
              </NavLink>
            )}

            <NavLink to="/evaluaciones">
              <li>
                <FaClipboardList /> Casos
              </li>
            </NavLink>

            <NavLink to="/resultados">
              <li>
                <FaFileAlt /> Resultados
              </li>
            </NavLink>

            <NavLink to="/historial">
              <li>
                <FaHistory /> Historial
              </li>
            </NavLink>
          </ul>
        </div>

        {isAdmin && (
          <div className="menu-section">
            <p className="section-title">CONFIGURACIÓN</p>
            <ul>
              <NavLink to="/sistema">
                <li>
                  <FaCog /> Sistema
                </li>
              </NavLink>
              <NavLink to="/usuarios">
                <li>
                  <FaUserCircle /> Usuarios
                </li>
              </NavLink>
            </ul>
          </div>
        )}

        {/* Tarjeta de usuario */}
        <button
          className="user-card as-button"
          onClick={() => setOpenPerfil(true)}
          title="Ver perfil"
        >
          <div className="user-left">
            <div className="user-avatar">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="user-avatar-img" />
              ) : (
                <FaUserCircle />
              )}
            </div>
            <div className="user-meta">
              <div className="user-name" title={profile?.email || ""}>
                {profile?.nombre ?? "Usuario"}
              </div>
              <span className={`role-badge ${roleClass}`}>{roleLabel}</span>
            </div>
          </div>
        </button>
      </div>

      <ModalPerfil
        open={openPerfil}
        onClose={() => setOpenPerfil(false)}
        profile={profile}
        roleLabel={roleLabel}
        onLogout={logout}
      />
    </>
  );
}