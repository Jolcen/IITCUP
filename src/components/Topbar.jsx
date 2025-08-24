import { useLocation } from "react-router-dom";
import { FaSearch, FaBell } from "react-icons/fa"
import "../styles/Topbar.css"


export default function Topbar() {
  const location = useLocation();

  const sectionName = location.pathname.replace("/", "") || "Inicio";

  return (
    <div className="topbar">
      <h2>{sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}</h2>
      {/*
      <div className="topbar-right">
        <div className="search-bar">
          <FaSearch />
          <input type="text" placeholder="Buscar..." />
        </div>
        <FaBell className="icon" />
      </div>
      */}
      

    </div>
  );
}
