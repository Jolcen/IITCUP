import React from 'react'
import '../styles/Register.css';

export const Register1 = () => {
    return (
        <div className="register-bg">
            <div className="register">
                <div className="register-container">
                <div className="register-image">
                    <img src='../../public/static/images/portada.png' alt="Register visual" />
                </div>
                <div className="register-form">
                    <h3>Registro</h3>
                    <input type="text" placeholder="Nombres" />
                    <input type="text" placeholder="Apellidos" />
                    <input type="number" placeholder="CI" />
                    <input type="email" placeholder="E-mail" />
                    <input type="password" placeholder="Contraseña" />
                    <input type="password" placeholder="Confirmar contraseña" />

                    <button className="btn-continue">Continuar</button>
                    <p className="register-link">¿Ya tiene una cuenta? <a href="#">Entrar</a></p>
                </div>
            </div>
            </div>
        </div>
    );
}
