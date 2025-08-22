import { useEffect, useState } from 'react';
import { listCasos, createCaso, updateCasoEstado } from '../services/casosService';
import { registrarLog } from '../services/logsService';


export default function CasosPage() {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);

  async function cargar() {
    setLoading(true);
    const data = await listCasos();
    setCasos(data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crearEjemplo() {
    // Solo Admin pasa RLS. Ajusta payload según tu formulario.
    const nuevo = await createCaso({
      paciente_nombre: 'Juan Pérez',
      paciente_ci: '1234567 LP',
      genero: 'M',
      estado: 'pendiente',
      motivacion: 'Evaluación solicitada por unidad X'
    });
    await registrarLog({ accion: 'CREAR_CASO', entidad: 'casos', entidad_id: nuevo.id });
    await cargar();
  }

  async function marcarEvaluado(id) {
    const upd = await updateCasoEstado(id, 'evaluado');
    await registrarLog({ accion: 'CAMBIAR_ESTADO', entidad: 'casos', entidad_id: upd.id });
    await cargar();
  }

  if (loading) return <p>Cargando...</p>;

  return (
    <div style={{ padding: 16 }}>
      <h2>Casos</h2>
      <button onClick={crearEjemplo}>+ Crear caso (admin)</button>
      <ul>
        {casos.map(c => (
          <li key={c.id} style={{ margin: '8px 0' }}>
            <b>{c.paciente_nombre}</b> — {c.estado}
            {' '}
            <button onClick={() => marcarEvaluado(c.id)}>Marcar evaluado</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
