import { Link } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav>
      <Link to="/">Inicio</Link>
      <Link to="/login">Ingresar</Link>
      <Link to="/register">Registrarse</Link>
    </nav>
  )
}
