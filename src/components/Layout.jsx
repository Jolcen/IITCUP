import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import '../styles/Layout.css'

export default function Layout() {
    return (
        <div className="layout-container">
            <div className="sidebar">
                <Sidebar />
            </div>
            <div className="main-area">
                <div className="topbar">
                <Topbar />
                </div>
                <div className="page-content">
                <Outlet />
                </div>
            </div>
        </div>
    );
}
