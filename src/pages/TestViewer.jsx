import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/TestViewer.css';

export default function TestViewer() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const [testData, setTestData] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [time, setTime] = useState(0);
    const [showExitModal, setShowExitModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');

    // Cargar prueba
    useEffect(() => {
        fetch(`/tests/${testId}.json`)
            .then(res => res.json())
            .then(data => {
            setTestData(data);

            // Verificar si hay progreso guardado
            const saved = localStorage.getItem(`progress-${testId}`);
            if (saved) {
                const { currentIndex, responses, time } = JSON.parse(saved);
                setCurrentIndex(currentIndex || 0);
                setResponses(responses || []);
                setTime(time || 0);
                }   
            }
        );

    const interval = setInterval(() => setTime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
    }, [testId]);

    // Guardar progreso en localStorage
    useEffect(() => {
        const progressData = {
        testId,
        currentIndex,
        responses,
        time,
        };
        localStorage.setItem(`progress-${testId}`, JSON.stringify(progressData));
    }, [currentIndex, responses, time, testId]);

    const handleAnswer = (respuesta) => {
        setResponses(prev => [...prev, { id: testData.preguntas[currentIndex].id, respuesta }]);
        setCurrentIndex(prev => prev + 1);
    };

    const formatTime = (total) => {
        const h = String(Math.floor(total / 3600)).padStart(2, '0');
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const leerTexto = (texto) => {
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-LA';
        speechSynthesis.speak(utterance);
    };

    const handleExit = () => {
        if (passwordInput === '1234') {
        navigate('/prueba');
        } else {
        alert('Contraseña incorrecta');
        }
    };

    if (!testData) return <div className="loader">Cargando prueba...</div>;
    
    if (currentIndex >= testData.preguntas.length) {
    // opcional: borrar progreso guardado de esta prueba
    localStorage.removeItem(`progress-${testId}`);

    return (
        <div className="finish-wrap">
        <div className="finish-card">
            <div className="finish-icon">✅</div>
            <h1 className="finish-title">¡Prueba completada!</h1>

            {/* Datos opcionales */}
            

            <div className="finish-actions">
            <button
                className="btn-back"
                onClick={() => navigate('/evaluaciones')}
            >
                ← Volver a Evaluaciones
            </button>
            </div>
        </div>
        </div>
    );
    }

    const pregunta = testData.preguntas[currentIndex];
    const progreso = Math.round((currentIndex / testData.preguntas.length) * 100);

    return (
        <div className="test-topbar-container">

            {/* Topbar simplificado */}
            <div className="test-topbar">
                <img src="/static/images/logo.png" alt="Logo" height={40} />
                <div className="test-timer">⏱ {formatTime(time)}</div>
                <button className="btn-exit" onClick={() => setShowExitModal(true)}>✖</button>
            </div>

            {/* Contenido de la pregunta */}
            <div className="test-container">
                <div className="test-header">
                <h3>Pregunta {pregunta.id}</h3>
                </div>

                <div className="test-question">
                <p>
                    {pregunta.texto}
                    <button title="Escuchar" onClick={() => leerTexto(pregunta.texto)}>🔊</button>
                </p>
                </div>

                <div className="test-options">
                {testData.opciones.map((op, idx) => (
                    <button key={idx} className="btn-opcion" onClick={() => handleAnswer(op)}>
                    {op}
                    </button>
                ))}
                </div>

                <div className="test-progress-bar">
                <div className="test-progress" style={{ width: `${progreso}%` }}></div>
                <span>{progreso}%</span>
                </div>
            </div>

            {/* Modal para confirmar salida */}
            {showExitModal && (
                <div className="exit-modal">
                <div className="modal-content">
                    <h4>Ingrese la contraseña de Usuario</h4>
                    <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Contraseña"
                    />
                    <button className="btn-confirm-exit" onClick={handleExit}>Confirmar</button>
                    <button className="btn-cancel-exit" onClick={() => setShowExitModal(false)}>Cancelar</button>
                </div>
                </div>
            )}
        </div>
    );
}
