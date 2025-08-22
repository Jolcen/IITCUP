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

  // Si ya hay sesión, redirige
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated?.(true);
        navigate('/', { replace: true });
      }
    })();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    // 1) Login contra Supabase Auth
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: clave,
    });

    if (authError) {
      setError(authError.message || 'No se pudo iniciar sesión');
      setCargando(false);
      return;
    }

    const uid = data?.user?.id;
    if (!uid) {
      setError('No se obtuvo el usuario de la sesión.');
      setCargando(false);
      return;
    }

    // 2) Verificar que existe perfil en app_users (rol/habilitado)
    const { data: perfil, error: perfilError } = await supabase
      .from('app_users')
      .select('id, nombre, email, rol')
      .eq('id', uid)
      .maybeSingle();

    if (perfilError) {
      setError(perfilError.message);
      setCargando(false);
      return;
    }

    if (!perfil) {
      // Usuario existe en Auth pero no está habilitado en tu sistema (app_users)
      setError('Tu cuenta existe en Auth pero no está habilitada en el sistema. Contacta al administrador.');
      setCargando(false);
      return;
    }

    // (Opcional) Registrar log de login
    await supabase.rpc('fn_log', {
      p_accion: 'LOGIN',
      p_entidad: 'app_users',
      p_entidad_id: uid,
    }).catch(() => {}); // ignora error si lo hubiera

    // 3) Marcar autenticado en tu estado local (si tu app lo usa)
    setIsAuthenticated?.(true);
    localStorage.setItem('isAuthenticated', 'true'); // si tu layout lo necesita

    // (Opcional) Guardar el perfil para usar el rol en la UI
    localStorage.setItem('perfil', JSON.stringify(perfil));

    navigate('/', { replace: true });
    setCargando(false);
  };

  return (
    <div className="login-bg">
      <div className="login-container">

        <div className="login-image">
          <img src='/public/static/images/portada.png' alt="Login visual" />
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
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div className="form-options">
            <label><input type="checkbox" defaultChecked /> Recordarme</label>
            <a href="#" onClick={(e)=>e.preventDefault()}>¿Olvidó contraseña?</a>
          </div>

          <button className="btn-login" type="submit" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Entrar'}
          </button>

          {error && <p style={{ color:'crimson', fontSize:12, marginTop:8 }}>{error}</p>}

          <p className="register-link">¿Aún no estás registrado? <a href="#" onClick={(e)=>e.preventDefault()}>Registrar</a></p>
        </form>

      </div>
    </div>
  );
};
