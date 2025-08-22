import "../styles/ModalUsuario.css"

async function handleGuardar() {
    try {
        const payload = {
        email: form.email,
        password: form.password,     // pídesela solo al crear
        nombre: form.nombre,
        ci: form.ci,
        especialidad: form.especialidad,
        nivel: form.nivel,
        turno: form.turno,
        estado: form.estado || "Disponible",
        };

        const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`,
        {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            // Opcional: Authorization si quieres validar que quien llama esté logueado
            // "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
            },
            body: JSON.stringify(payload),
        }
        );

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error creando usuario");

        alert("✅ Usuario creado");
        onClose?.();            // cierra modal
        onCreated?.();          // callback para refrescar lista
    } catch (e) {
        alert(e.message);
    }
}



export default function ModalUsuario({ usuario, onClose }) {
    return (
        <div className="modal-overlay">
        <div className="modal-usuario">
            <h3>Personal Seleccionado</h3>
            <div className="usuario-header">
            <img src="/avatar.png" alt="avatar" />
            <div>
                <strong>{usuario.nombre}</strong>
                <div>{usuario.ci}</div>
                <div>{usuario.email}</div>
            </div>
            </div>

            <div className="form-grid">
            <div className="col">
                <label>Nombre</label>
                <input value="Usuario" />
                <label>Email</label>
                <input value="usuario@gmail.com" />
                <label>Contraseña</label>
                <input type="password" value="12345678" />
                <label>Nivel de Acceso</label>
                <select><option>Administrador</option></select>
            </div>

            <div className="col">
                <label>Especialidad</label>
                <input value="Forense" />
                <label>N° matrícula profesional</label>
                <input value="123456789012" />
                <label>Institución de titulación</label>
                <input value="Policía" />
                <label>Fecha de titulación</label>
                <input type="date" value="2025-02-10" />
            </div>
            </div>

            <div className="modal-actions">
            <button className="btn-aceptar">Aceptar</button>
            <button className="btn-rechazar" onClick={onClose}>Rechazar</button>
            </div>
        </div>
        </div>
    )
}
