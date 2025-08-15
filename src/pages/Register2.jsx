import React from 'react';
import '../styles/Register.css';

const Register2 = () => {
    return (
        <div className="register-bg">
            <div className="register">
                <h3 className="register-title">Registro</h3>
                <div className="register-container">
                    <div className="left-column">
                        <div className="input-group">
                            <label>Fecha nacimiento</label>
                            <input type="date" />
                        </div>
                        <div className="input-group">
                            <label>Teléfono</label>
                            <input type="tel" placeholder="Ej. 71234567" />
                        </div>
                        <div className="input-group">
                            <label>Dirección domicilio</label>
                            <input type="text" placeholder="Calle, Zona, Ciudad" />
                        </div>
                        <div className="input-group">
                            <label>Mapa</label>
                            <img src="../../public/static/images/map.png" alt="Mapa" className="map-preview" />
                        </div>
                    </div>
                    <div className="right-column">
                        <div className="input-group">
                            <label>Especialidad</label>
                            <select>
                                <option value="">Seleccione</option>
                                <option value="clinico">Clínico</option>
                                <option value="forense">Forense</option>
                                <option value="educativo">Educativo</option>
                                <option value="social">Social</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>N° de matrícula profesional</label>
                            <input type="text" />
                        </div>
                        <div className="input-group">
                            <label>Institución de titulación</label>
                            <input type="text" />
                        </div>
                        <div className="input-group">
                            <label>Fecha de graduación</label>
                            <input type="date" />
                        </div>
                        <div className="input-group">
                            <label>Fotografía</label>
                            <input type="file" />
                        </div>
                    </div>
                </div>
                <div className="register-btn-container">
                    <button className="btn-create-account">Crear cuenta</button>
                </div>
            </div>
        </div>
    );
};

export default Register2;
