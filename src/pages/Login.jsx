import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';
import { supabase } from '../lib/supabaseClient';

export const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [needVerify, setNeedVerify] = useState(false);
  const [resendOk, setResendOk] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
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

  const handleResend = async () => {
    try {
      setResendLoading(true);
      setResendOk('');
      // reenvía correo de verificación
      const { error: e } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (e) throw e;
      setResendOk('Te enviamos un nuevo correo de verificación.');
    } catch (e) {
      setError(e.message || 'No se pudo reenviar el correo de verificación');
    } finally {
      setResendLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNeedVerify(false);
    setResendOk('');
    setCargando(true);

    try {
      // 1) login en Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: clave,
      });
      if (authError) {
        const msg = (authError.message || '').toLowerCase();
        if (msg.includes('confirm') || msg.includes('verified') || msg.includes('verification')) {
          setNeedVerify(true);
          throw new Error('Aún no verificaste tu correo. Revisa tu bandeja o reenvía el correo.');
        }
        throw new Error('Correo o contraseña incorrectos.');
      }

      const uid = data?.user?.id;
      if (!uid) throw new Error('No se obtuvo el usuario de la sesión.');

      // 2) aseguramos estado (verificacion -> disponible) si ya confirmó
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (token) {
        await supabase.functions.invoke('auth-after-signin', {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // 3) traer perfil/estado de app_users
      const { data: perfil, error: perfilError } = await supabase
        .from('app_users')
        .select('id, nombre, email, rol, estado')
        .eq('id', uid)
        .maybeSingle();

      if (perfilError) throw new Error(perfilError.message);
      if (!perfil) {
        throw new Error('Tu cuenta existe en Auth pero no está habilitada en el sistema. Contacta al administrador.');
      }

      // 4) bloquear acceso si no está "disponible"
      if (perfil.estado !== 'disponible') {
        if (perfil.estado === 'verificacion') {
          setNeedVerify(true);
          throw new Error('Tu correo todavía no está verificado. Verifica para continuar.');
        }
        throw new Error(`Usuario inválido (estado: ${perfil.estado}).`);
      }

      // 5) OK: marcaremos autenticado y redirigimos
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
            
            <h3>AMUYU</h3>
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

          {error && <p className="login-error">{error}</p>}

          {needVerify && (
            <div className="login-hint">
              <button
                type="button"
                className="login-link"
                onClick={handleResend}
                disabled={resendLoading}
              >
                {resendLoading ? 'Reenviando…' : 'Reenviar correo de verificación'}
              </button>
              {resendOk && <div className="login-ok">{resendOk}</div>}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
