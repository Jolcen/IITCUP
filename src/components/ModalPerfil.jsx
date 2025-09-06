// src/components/ModalPerfil.jsx
import { useEffect } from "react";
import { FaUserCircle, FaSignOutAlt, FaTimes } from "react-icons/fa";
import "../styles/ModalPerfil.css";

export default function ModalPerfil({ open, onClose, profile, roleLabel, onLogout }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mp-backdrop" onClick={onClose}>
      <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mp-header">
          <div className="mp-title">
            <FaUserCircle className="mp-avatar" />
            <div>
              <h3 className="mp-name">{profile?.nombre ?? "Usuario"}</h3>
              <p className="mp-role">{roleLabel}</p>
            </div>
          </div>
          <button className="mp-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="mp-body">
          <div className="mp-row">
            <span className="mp-label">Nombre</span>
            <span className="mp-value">{profile?.nombre ?? "—"}</span>
          </div>
          <div className="mp-row">
            <span className="mp-label">Email</span>
            <span className="mp-value" title={profile?.email || ""}>
              {profile?.email ?? "—"}
            </span>
          </div>
          <div className="mp-row">
            <span className="mp-label">Rol</span>
            <span className="mp-badge">{roleLabel}</span>
          </div>
        </div>

        <div className="mp-footer">
          <button className="mp-logout" onClick={onLogout}>
            <FaSignOutAlt />
            <span> Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
}
