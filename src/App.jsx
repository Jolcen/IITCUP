import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Login } from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Evaluaciones from "./pages/Evaluaciones";
import Historial from "./pages/Historial";
import Tests from "./pages/Tests";
import System from "./pages/System";
import Usuarios from "./pages/Usuarios";
import TestViewer from "./pages/TestViewer"; // Importa tu componente

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Leer estado desde localStorage al iniciar
  useEffect(() => {
    const storedAuth = localStorage.getItem("isAuthenticated");
    if (storedAuth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Guardar estado cada vez que cambie
  useEffect(() => {
    localStorage.setItem("isAuthenticated", isAuthenticated);
  }, [isAuthenticated]);

  return (
    <Router>
      <Routes>
        {/* Ruta pública de login */}
        <Route
          path="/login"
          element={<Login setIsAuthenticated={setIsAuthenticated} />}
        />

        {/* Rutas privadas si está autenticado */}
        {isAuthenticated ? (
          <>
            {/* Rutas que usan Layout (sidebar + topbar) */}
            <Route path="/*" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="evaluaciones" element={<Evaluaciones />} />
              <Route path="historial" element={<Historial />} />
              <Route path="prueba" element={<Tests />} />
              <Route path="sistema" element={<System />} />
              <Route path="usuarios" element={<Usuarios />} />
            </Route>

            {/* Ruta especial para test sin layout */}
            <Route path="/test/:testId" element={<TestViewer />} />
          </>
        ) : (
          // Si no está autenticado, redirige todo a login
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
