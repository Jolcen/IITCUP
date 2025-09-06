import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { Login } from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Evaluaciones from "./pages/Evaluaciones";
import Historial from "./pages/Historial";
import Tests from "./pages/Tests";
import System from "./pages/System";
import Usuarios from "./pages/Usuarios";
import TestViewer from "./pages/TestViewer";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminRoute from "./routes/AdminRoute";
import Forbidden from "./pages/Forbidden";
import NoAuthRoute from "./routes/NoAuthRoute"; 
import Pacientes from "./pages/Pacientes";
import Resultados from "./pages/Resultados";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL /* útil para GH Pages */}>
      <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
        <Routes>
          {/* Pública SOLO si NO hay sesión */}
          <Route
            path="/login"
            element={
              <NoAuthRoute>
                <Login />
              </NoAuthRoute>
            }
          />

          {/* Protegidas (con Layout) */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="evaluaciones" element={<Evaluaciones />} />
            <Route path="historial" element={<Historial />} />
            <Route path="resultados" element={<Resultados />} />
            <Route path="tests" element={<Tests />} />
            <Route path="pacientes" element={<Pacientes />} />

            {/* Solo admin */}
            <Route
              path="sistema"
              element={
                <AdminRoute>
                  <System />
                </AdminRoute>
              }
            />
            <Route
              path="usuarios"
              element={
                <AdminRoute>
                  <Usuarios />
                </AdminRoute>
              }
            />
          </Route>

          {/* Ruta sin Layout pero protegida */}
          <Route
            path="/test/:testId"
            element={
              <ProtectedRoute>
                <TestViewer />
              </ProtectedRoute>
            }
          />

          {/* 403 y fallback */}
          <Route path="/403" element={<Forbidden />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
