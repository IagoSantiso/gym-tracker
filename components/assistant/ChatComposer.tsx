"use client";
import { useEffect, useRef, useState } from "react";
import { attachmentSize, MAX_ATTACHMENT_CHARS, type ChatAttachment } from "@/lib/ai/attachments";
import { prepareAttachment } from "@/lib/ai/prepare-attachment";

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function ChatComposer({ text, setText, busy, ready, onSend, conversationKey }: {
  text: string; setText: (value: string | ((prev: string) => string)) => void;
  busy: boolean; ready: boolean; conversationKey: string;
  onSend: (text: string, attachments: ChatAttachment[]) => Promise<boolean>;
}) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const w = window as SpeechWindow;
    setVoiceAvailable(window.isSecureContext && !!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => { generation.current++; recognition.current?.abort(); };
  }, []);
  useEffect(() => {
    generation.current++;
    recognition.current?.abort();
    setAttachments([]); setError(null);
  }, [conversationKey]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const gen = generation.current;
    setPreparing(true); setError(null);
    try {
      if (attachments.length + files.length > 4) throw new Error("Puedes adjuntar hasta 4 archivos por mensaje.");
      const next = [...attachments];
      for (const file of Array.from(files)) next.push(await prepareAttachment(file));
      if (next.reduce((sum, a) => sum + attachmentSize(a), 0) > MAX_ATTACHMENT_CHARS) throw new Error("Los adjuntos ocupan demasiado. Prueba con menos fotos o un PDF más pequeño.");
      if (gen === generation.current) setAttachments(next);
    } catch (e) { if (gen === generation.current) setError(e instanceof Error ? e.message : "No se pudo preparar el archivo."); }
    finally { setPreparing(false); }
  };
  const dictate = () => {
    if (listening) { recognition.current?.stop(); return; }
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) return;
    const r = new Constructor();
    recognition.current = r;
    r.lang = "es-ES"; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map((result) => result[0]?.transcript ?? "").join(" ");
      setText((prev) => `${prev}${prev ? " " : ""}${transcript}`.slice(0, 8000));
    };
    r.onerror = (e) => { setListening(false); setError(e.error === "not-allowed" ? "Permite el micrófono en tu navegador para dictar." : e.error === "no-speech" ? "No se ha detectado voz. Vuelve a intentarlo." : "No se pudo dictar. Puedes usar el micrófono del teclado del móvil."); };
    r.onend = () => setListening(false);
    setError(null);
    try { r.start(); setListening(true); } catch { setError("No se pudo iniciar el micrófono."); }
  };
  const submit = async () => {
    if (busy || preparing || listening || !ready || (!text.trim() && !attachments.length)) return;
    if (await onSend(text, attachments)) setAttachments([]);
  };
  return (
    <form style={{ position: "sticky", bottom: "calc(var(--nav-h) + 12px)", marginTop: 16, background: "var(--bg)", padding: "8px 0" }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {attachments.length > 0 && <div className="row" aria-label="Archivos preparados" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        {attachments.map((a, i) => <div className="card tight" key={i} style={{ maxWidth: 140 }}>
          {a.kind === "image" && <img src={`data:${a.mediaType};base64,${a.data}`} alt={a.name} style={{ width: "100%", maxHeight: 80, objectFit: "contain" }} />}
          <span className="xs" style={{ overflowWrap: "anywhere" }}>{a.name}</span>
          <button className="btn sm ghost" type="button" disabled={busy || preparing} aria-label={`Quitar ${a.name}`} onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>Quitar</button>
        </div>)}
      </div>}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <textarea className="input" rows={2} maxLength={8000} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} placeholder={ready ? "Escribe, dicta o añade una foto de tu nevera…" : "Activa el asistente para continuar"} aria-label="Mensaje para el asistente" style={{ resize: "none" }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
        <button className="btn primary" disabled={!ready || busy || preparing || listening || (!text.trim() && !attachments.length)} type="submit" aria-label="Enviar" aria-busy={busy}>{busy ? "…" : "Enviar"}</button>
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn sm" type="button" disabled={!ready || busy || preparing} onClick={() => cameraRef.current?.click()}>Cámara</button>
        <button className="btn sm" type="button" disabled={!ready || busy || preparing} onClick={() => filesRef.current?.click()}>Fotos / archivos</button>
        {voiceAvailable && <button className="btn sm" type="button" aria-pressed={listening} disabled={!ready || busy || preparing} onClick={dictate}>{listening ? "Detener dictado" : "Dictar"}</button>}
        <span className="xs dim" role="status">{preparing ? "Preparando adjuntos…" : listening ? "Escuchando… revisa el texto antes de enviar." : ""}</span>
      </div>
      <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={filesRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.txt,.csv,.json,.md" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <p className="xs dim" style={{ margin: "6px 0 0" }}>Al enviar, texto y adjuntos van al proveedor de IA. Los archivos no se conservan en el historial. JPG, PNG, WebP, PDF y texto. {voiceAvailable ? "El dictado usa el servicio de voz de tu navegador." : "Para dictar, usa el micrófono del teclado del móvil."}</p>
      {error && <p className="small" role="alert">{error}</p>}
    </form>
  );
}
