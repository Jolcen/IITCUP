import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import TestPsicologico from './pages/TestPsicologico'
import Evaluaciones from "./pages/Evaluaciones"

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/test" element={<TestPsicologico />} />
        <Route path="/evaluaciones" element={<Evaluaciones />} />
      </Routes>
    </BrowserRouter>
  )
}
