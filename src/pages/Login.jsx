import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';

export const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();

    // Validación simple (puedes conectar con backend luego)
    if (email === "admin@gmail.com" && clave === "1234") {
      setIsAuthenticated(true);                          // Actualiza el estado global
      localStorage.setItem("isAuthenticated", "true");   // Guarda en localStorage
      navigate('/');                                     // Redirige a layout/dashboard
    } else {
      alert("Credenciales incorrectas");
    }
  };

  return (
    <div className="login-bg">
      <div className="login-container">

        <div className="login-image">
          <img src='/static/images/portada.png' alt="Login visual" />
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-logo">
            <img src="/static/images/logo.png" alt="IITCUP logo" className="logo" />
            <h3>IITCUP</h3>
          </div>
          <h5>Control de Pruebas Psicológicas</h5>

          <input 
            type="email" 
            placeholder="E-mail" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input 
            type="password" 
            placeholder="Contraseña" 
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />

          <div className="form-options">
            <label><input type="checkbox" /> Recordarme</label>
            <a href="#">¿Olvidó contraseña?</a>
          </div>

          <button className="btn-login" type="submit">Entrar</button>

          <p className="register-link">¿Aún no estás registrado? <a href="#">Registrar</a></p>
        </form>

      </div>
    </div>
  );
};
