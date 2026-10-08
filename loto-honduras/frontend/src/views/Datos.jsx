import React, { useState } from "react";
import { api, fmtDate, pad } from "../api.js";
import { Card, Notice, SimpleTable, Stat, useApp } from "../ui.jsx";

function ValidationReport({ r }) {
  if (!r) return null;
  const ok = r.filas_rechazadas === 0;
  return (
    <div className="mt">
      <Notice kind={ok ? "ok" : "warn"}>
        <b>{r.fuente}</b>: {r.filas_leidas} filas leídas · {r.sorteos_validos} válidas · <b>{r.insertados}</b> insertadas ·{" "}
        {r.filas_rechazadas} rechazadas{r.omitidos_bd?.length ? ` · ${r.omitidos_bd.length} ya existían` : ""}
      </Notice>
      {r.errores?.length > 0 && (
        <SimpleTable max={220} cols={[{ k: "fila", h: "Fila" }, { k: "tipo", h: "Tipo", l: 1 }, { k: "motivo", h: "Motivo", l: 1 }, { k: "valor", h: "Valor", l: 1 }]} rows={r.errores} />
      )}
      {r.advertencias?.length > 0 && (
        <p className="small sub">Advertencias: {r.advertencias.map((w) => `fila ${w.fila}: ${w.motivo}`).join(" · ")}</p>
      )}
      {r.omitidos_bd?.length > 0 && (
        <p className="small sub">Omitidos: {r.omitidos_bd.slice(0, 10).map((w) => `${fmtDate(w.fecha)} (${w.motivo})`).join(" · ")}</p>
      )}
    </div>
  );
}

export default function Datos() {
  const { info, draws, periodo, setPeriodo, refreshData, setTab } = useApp();
  const [p, setP] = useState(periodo);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [manual, setManual] = useState({ fecha: "", nums: ["", "", "", "", "", ""] });
  const [url, setUrl] = useState("");
  const [fuente, setFuente] = useState("");
  const d = info.datos;

  const run = async (fn) => {
    setBusy(true); setMsg("");
    try { await fn(); await refreshData(); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const upload = (file) => run(async () => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("fuente", fuente);
    setReport(await api.upload("/import", fd));
  });

  const addManual = () => run(async () => {
    await api.post("/draws", { fecha: manual.fecha, numeros: manual.nums.filter((x) => x !== "").map(Number) });
    setManual({ fecha: "", nums: ["", "", "", "", "", ""] });
    setMsg("Sorteo agregado.");
  });

  const inPeriod = draws.filter((x) => x.fecha >= periodo.inicio && x.fecha <= periodo.fin).length;

  return (
    <div className="grid">
      <div className="grid g4">
        <Card><Stat label="Sorteos almacenados" value={d.total} hint={d.desde ? `${fmtDate(d.desde)} → ${fmtDate(d.hasta)}` : "sin datos"} /></Card>
        <Card><Stat label="En el período" value={inPeriod} hint={`${fmtDate(periodo.inicio)} – ${fmtDate(periodo.fin)}`} /></Card>
        <Card><Stat label="Última actualización" value={d.ultima_importacion ? fmtDate(d.ultima_importacion) : "—"} hint="fecha de la última importación" /></Card>
        <Card><Stat label="Fuente(s)" value={d.fuentes.length || "—"} hint={d.fuentes.map((f) => `${f.fuente} (${f.c})`).join(" · ") || "ninguna"} /></Card>
      </div>

      {d.total === 0 && (
        <Notice kind="info"><b>No hay resultados cargados.</b> Esta herramienta nunca inventa resultados históricos. Importe los resultados
          oficiales de Loto Honduras (CSV o Excel), captúrelos manualmente, o cargue un set de demostración sintético para explorar la herramienta.</Notice>
      )}

      <Card title="Período de análisis" sub="Por defecto: 01/07/2025 – 04/10/2026. Todos los análisis usan solo sorteos dentro de este período.">
        <div className="row">
          <label className="f">Desde<input type="date" value={p.inicio} onChange={(e) => setP({ ...p, inicio: e.target.value })} /></label>
          <label className="f">Hasta<input type="date" value={p.fin} onChange={(e) => setP({ ...p, fin: e.target.value })} /></label>
          <button className="btn primary" style={{ alignSelf: "flex-end" }} onClick={() => setPeriodo(p)}>Aplicar período</button>
          <button className="btn" style={{ alignSelf: "flex-end" }} onClick={() => { const x = { inicio: "2025-07-01", fin: "2026-10-04" }; setP(x); setPeriodo(x); }}>Restablecer</button>
          <div className="spacer" />
          <button className="btn" style={{ alignSelf: "flex-end" }} disabled={!inPeriod} onClick={() => setTab("analisis")}>Siguiente: Análisis →</button>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Importar CSV / Excel" sub="Columnas: fecha, n1…n6 (o numero1…numero6). También se acepta: primera columna fecha y seis columnas de números.">
          <label className="f">Nombre de la fuente (se mostrará en la app)
            <input type="text" placeholder="Ej.: Resultados oficiales Loto Honduras" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          </label>
          <div className="row mt-s">
            <input type="file" accept=".csv,.xlsx,.xls,.txt" disabled={busy} onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            <a className="btn sm" href="/api/template.csv">Descargar plantilla</a>
          </div>
          <p className="small sub">Fechas DD/MM/YYYY o YYYY-MM-DD. Se validan: rango 01–31, exactamente 6 números, sin repetidos, fechas válidas, duplicados e incompletos.</p>
        </Card>
        <Card title="Captura manual" sub="Agregar un sorteo individual">
          <div className="row">
            <label className="f">Fecha<input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} /></label>
          </div>
          <div className="row mt-s">
            {manual.nums.map((v, i) => (
              <input key={i} type="number" min="1" max="31" style={{ width: 58 }} placeholder={`N${i + 1}`} value={v}
                onChange={(e) => { const n = [...manual.nums]; n[i] = e.target.value; setManual({ ...manual, nums: n }); }} />
            ))}
            <button className="btn primary" disabled={busy || !manual.fecha} onClick={addManual}>Agregar</button>
          </div>
        </Card>
        <Card title="Fuente automática (URL)" sub={info.fuente_automatica}>
          <div className="row">
            <input type="url" style={{ flex: 1 }} placeholder="https://…/resultados.csv" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={busy || !url} onClick={() => run(async () => setReport(await api.post("/import/url", { url, fuente: fuente || null })))}>Obtener</button>
          </div>
          <p className="small sub">Formato JSON aceptado: <code>[{"{"}"fecha": "2025-07-02", "numeros": [..6..]{"}"}]</code>. Los datos pasan por la misma validación.</p>
        </Card>
        <Card title="Datos de demostración" sub="Sorteos simulados con una lotería justa (2 por semana). Útiles para explorar y como prueba de control: sobre datos justos el laboratorio debería concluir que no hay ventaja.">
          <div className="row">
            <button className="btn" disabled={busy || d.total - d.sinteticos > 0} onClick={() => run(async () => { await api.post("/demo"); setMsg("Demo cargada (datos sintéticos)."); })}>Cargar demo sintética</button>
            <button className="btn danger" disabled={busy || !d.sinteticos} onClick={() => run(() => api.del("/draws?solo_sinteticos=true"))}>Borrar sintéticos</button>
            <button className="btn danger" disabled={busy || !d.total} onClick={() => window.confirm("¿Borrar TODOS los sorteos almacenados?") && run(() => api.del("/draws?solo_sinteticos=false"))}>Borrar todo</button>
          </div>
        </Card>
      </div>
      {msg && <Notice kind="info">{msg}</Notice>}
      <ValidationReport r={report} />

      <Card title={`Sorteos almacenados (${draws.length})`} sub="Más recientes primero">
        <SimpleTable max={420} rows={draws} cols={[
          { k: "fecha", h: "Fecha", f: (r) => fmtDate(r.fecha) },
          { k: "nums", h: "Números", l: 1, f: (r) => [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6].map(pad).join(" · ") },
          { k: "fuente", h: "Fuente", l: 1, f: (r) => <span className="small">{r.fuente}</span> },
          { k: "x", h: "", f: (r) => <button className="btn sm danger" onClick={() => run(() => api.del(`/draws/${r.fecha}`))}>Eliminar</button> },
        ]} />
      </Card>
    </div>
  );
}
