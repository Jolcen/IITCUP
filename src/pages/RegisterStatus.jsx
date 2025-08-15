import React from 'react'
import '../styles/Register.css';
import { FaUser } from 'react-icons/fa';
import { FaCheck } from 'react-icons/fa';

const RegisterStatus = () => {
    return (
        <div className="register-bg">
            <div className="register">
                <h3 className="register-title">Registro</h3>
                <div className="status-icon">
                    <FaUser className="icon-user" />
                    <FaCheck className="icon-check" />
                </div>
                <p className="status-message">En espera de aprobación</p>
            </div>
        </div>
    );
}

export default RegisterStatus