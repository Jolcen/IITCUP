export default function ConfirmDialog({ open, title, message, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-usuario" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title || "Confirmar"}</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>
        <p className="modal-subtitle">{message || "¿Deseas continuar?"}</p>

        <div className="modal-actions">
          <button type="button" className="btn btn-aceptar" onClick={onConfirm}>Confirmar</button>
          <button type="button" className="btn btn-rechazar" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
