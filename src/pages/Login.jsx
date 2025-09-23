import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';
import { supabase } from '../lib/supabaseClient';

export const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated?.(true);
        navigate('/', { replace: true });
      }
    })();
  }, [navigate, setIsAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      // 1) Login en Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: clave,
      });
      if (authError) throw new Error(authError.message || 'No se pudo iniciar sesión');

      const uid = data?.user?.id;
      if (!uid) throw new Error('No se obtuvo el usuario de la sesión.');

      // 2) Verificar perfil en app_users
      const { data: perfil, error: perfilError } = await supabase
        .from('app_users')
        .select('id, nombre, email, rol')
        .eq('id', uid)
        .maybeSingle();

      if (perfilError) throw new Error(perfilError.message);
      if (!perfil) {
        setError('Tu cuenta existe en Auth pero no está habilitada en el sistema. Contacta al administrador.');
        return;
      }

      // 3) Marcar autenticado y redirigir
      setIsAuthenticated?.(true);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('perfil', JSON.stringify(perfil));
      navigate('/', { replace: true });

    } catch (err) {
      setError(err.message || 'Error inesperado al iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-container">
        <div className="login-image">
          <img src="static/images/portada.png" alt="Login visual" />
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-logo">
            <img src="static/images/logo.png" alt="IITCUP logo" className="logo" />
            <h3>IITCUP</h3>
          </div>
          <h5>Control de Pruebas Psicológicas</h5>

          <input
            id="email"
            name="email"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Contraseña"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div className="form-options">
            <label><input type="checkbox" defaultChecked /> Recordarme</label>
          </div>

          <button className="btn-login" type="submit" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Entrar'}
          </button>

          {error && <p style={{ color: 'crimson', fontSize: 12, marginTop: 8 }}>{error}</p>}
        </form>
      </div>
    </div>
  );
};
