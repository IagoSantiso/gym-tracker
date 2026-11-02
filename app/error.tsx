"use client";
/** Error de una pantalla: mensaje en español y opciones para seguir (los datos están a salvo en el dispositivo). */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ margin: "32px auto", maxWidth: 520 }} role="alert">
      <h3>Esta pantalla ha fallado</h3>
      <p className="small muted">Tus datos están a salvo en este dispositivo. Prueba a recargar; si se repite, avísanos con una captura.</p>
      <p className="xs dim" style={{ wordBreak: "break-word" }}>{error.message}</p>
      <div className="row">
        <button className="btn primary" onClick={() => reset()}>Reintentar</button>
        <button className="btn" onClick={() => location.reload()}>Recargar</button>
        <a className="btn ghost" href="/">Ir a Hoy</a>
      </div>
    </div>
  );
}
