import { FaHome, FaSignOutAlt, FaClipboardList, FaUserFriends, FaHistory, FaCog, FaUserCircle } from "react-icons/fa"
import { MdOutlineAdminPanelSettings } from "react-icons/md"
import "../styles/Sidebar.css"

import { NavLink } from "react-router-dom";

export default function Sidebar() {
    return (
        <div className="sidebar">
            <div className="logo">
                <img src="../../public/static/images/logo.png" alt="Logo" className="logo"/>
                <h2>IITCUP</h2>
            </div>

            <div className="menu-section">
                <p className="section-title">MENÚ PRINCIPAL</p>
                <ul>
                    <NavLink to="/"><li><FaHome /> Inicio</li></NavLink>
                    <NavLink to="/evaluaciones"><li><FaClipboardList /> Evaluaciones</li></NavLink>
                    
                    <NavLink to="/prueba"><li><MdOutlineAdminPanelSettings /> Pruebas</li></NavLink>
                    <NavLink to="/historial"><li><FaHistory /> Historial</li></NavLink>
                </ul>
            </div>

            <div className="menu-section">
                <p className="section-title">CONFIGURACIÓN</p>
                <ul>
                    
                    <NavLink to="/sistema"><li><FaCog /> Sistema</li></NavLink>
                    <NavLink to="/usuarios"><li><FaUserCircle /> Usuarios</li></NavLink>
                    
                </ul>
            </div>

            <div className="user-section">
                <FaUserCircle className="avatar" />
                <div>
                    <p className="username">Usuario</p>
                    <span>Admin</span>
                </div>
                
                <FaSignOutAlt
                    className="logout-icon"
                    title="Cerrar sesión"
                    onClick={() => {
                    localStorage.removeItem("isAuthenticated");
                    window.location.href = "/login";
                    }}
                />
            </div>


        </div>
    )
}
