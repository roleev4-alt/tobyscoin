import React, { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmt, fmtDate, pad } from "../api.js";
import { Balls, Card, Notice, SimpleTable, Stat, useApp, useColors } from "../ui.jsx";

function nextDrawDate() {
  // Super Premio: miércoles (3) y sábado (6). Próxima fecha a partir de hoy.
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if (x.getDay() === 3 || x.getDay() === 6) {
      return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    }
  }
  return "";
}

export default function EnVivo() {
  const { refreshData } = useApp();
  const c = useColors();
  const [data, setData] = useState(null);
  const [fecha, setFecha] = useState(nextDrawDate());
  const [version, setVersion] = useState("v1.0");
  const [manual, setManual] = useState({ fecha: nextDrawDate(), nombre: "mis jugadas", texto: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setData(await api.get("/live")); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); await load(); await refreshData(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const freeze = () => run(async () => {
    const r = await api.post("/live/freeze", { fecha_sorteo: fecha, version });
    setMsg(`Jugadas ${version} congeladas para el ${fmtDate(fecha)} · hash ${r.hash}`);
  });
  const saveManual = () => run(async () => {
    const combos = manual.texto.split("\n").map((l) => (l.match(/\d{1,2}/g) || []).map(Number)).filter((x) => x.length);
    const r = await api.post("/live/manual", { fecha_sorteo: manual.fecha, version: manual.nombre, combinaciones: combos });
    setMsg(`${combos.length} jugadas registradas para el ${fmtDate(manual.fecha)} · hash ${r.hash}`);
  });

  if (!data) return <div className="loading">Cargando…</div>;
  const plan = data.plan;
  const versions = Object.values(data.resumen);
  const main = data.resumen[plan.version_principal];

  return (
    <div className="grid">
      <Notice kind="info"><b>Prueba en vivo: la evidencia más fuerte posible.</b> Las jugadas se congelan (con hash) <b>antes</b> de cada sorteo
        real y la app las evalúa sola cuando usted carga el resultado en «Datos históricos». No se puede congelar un sorteo que ya tiene resultado.</Notice>

      <Card title="Plan pre-registrado" sub="Fijado de antemano para no «mover la meta» al ver los resultados">
        <table><tbody>
          <tr><td>Modelo bajo prueba</td><td><b>{plan.version_principal}</b></td></tr>
          <tr><td>Métrica principal</td><td>{plan.metrica}</td></tr>
          <tr><td>Hipótesis nula</td><td>{plan.hipotesis_nula}</td></tr>
          <tr><td>Tamaño previsto</td><td>{plan.sorteos_objetivo} sorteos ({plan.sorteos_objetivo * 10} jugadas)</td></tr>
          <tr><td>Prueba</td><td>{plan.prueba} · α = {plan.alfa}</td></tr>
          <tr><td>Regla de parada</td><td>{plan.regla_de_parada}</td></tr>
        </tbody></table>
      </Card>

      {main && main.sorteos_evaluados > 0 && (
        <Card title={`Avance del modelo ${plan.version_principal}`} sub={main.lectura}>
          <div className="progress" style={{ marginBottom: 12 }}><i style={{ width: `${Math.min(100, main.avance_pct)}%` }} /></div>
          <div className="grid g4">
            <Stat label="Sorteos evaluados" value={`${main.sorteos_evaluados} / ${plan.sorteos_objetivo}`} hint={`${main.jugadas} jugadas`} />
            <Stat label="Aciertos por jugada" value={fmt(main.promedio, 3)} hint={`azar: ${fmt(main.esperado_azar, 3)}`} />
            <Stat label="Diferencia" value={(main.diferencia > 0 ? "+" : "") + fmt(main.diferencia, 3)} hint={main.ic95 ? `IC95%: ${fmt(main.ic95[0], 3)} a ${fmt(main.ic95[1], 3)}` : "IC con 2+ sorteos"} />
            <Stat label="p vs azar" value={fmt(main.p_valor, 3)} hint={`percentil ${fmt(main.percentil_vs_azar, 0)}`} />
            <Stat label="Sorteos con 3+ aciertos" value={main.sorteos_con_3_o_mas} hint={`esperado por azar: ${main.esperado_sorteos_con_3_o_mas}`} />
            <Stat label="Mejor resultado" value={`${main.mejor_resultado} aciertos`} />
          </div>
          {main.evolucion.length > 1 && (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={main.evolucion.map((e) => ({ ...e, fecha: fmtDate(e.fecha) }))}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="fecha" tickLine={false} minTickGap={30} />
                <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v) => fmt(v, 3)} />
                <Legend />
                <ReferenceLine y={main.esperado_azar} stroke={c.muted} strokeDasharray="4 4" />
                <Line dataKey="promedio_acumulado" name="Promedio acumulado" stroke={c.c1} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {versions.length > 1 && (
        <Card title="Comparación entre versiones (prueba en vivo)">
          <SimpleTable rows={versions} cols={[
            { k: "version", h: "Versión", l: 1 }, { k: "sorteos_evaluados", h: "Evaluados" }, { k: "pendientes", h: "Pendientes" },
            { k: "promedio", h: "Aciertos/jugada", f: (r) => fmt(r.promedio, 3) }, { k: "diferencia", h: "Dif. vs azar", f: (r) => fmt(r.diferencia, 3) },
            { k: "p_valor", h: "p", f: (r) => fmt(r.p_valor, 3) }, { k: "mejor_resultado", h: "Mejor" },
          ]} />
        </Card>
      )}

      <div className="grid g2">
        <Card title="Congelar jugadas del modelo" sub="Usa todos los sorteos cargados con fecha anterior al sorteo elegido.">
          <div className="row">
            <label className="f">Fecha del sorteo<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label className="f">Versión
              <select value={version} onChange={(e) => setVersion(e.target.value)}>
                <option value="v1.0">v1.0 — original (plan principal)</option>
                <option value="v1.1">v1.1 — + anti-popularidad</option>
              </select>
            </label>
            <button className="btn primary" style={{ alignSelf: "flex-end" }} disabled={busy || !fecha} onClick={freeze}>Congelar</button>
          </div>
          <p className="small sub">Puede congelar ambas versiones para el mismo sorteo y compararlas. Juegue la que prefiera: las dos tienen la misma probabilidad de acierto; v1.1 evita combinaciones populares.</p>
        </Card>
        <Card title="Registrar jugadas propias" sub="Una combinación por línea (6 números). Se evalúan igual que las del modelo.">
          <div className="row">
            <label className="f">Fecha del sorteo<input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} /></label>
            <label className="f">Nombre<input type="text" value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} /></label>
          </div>
          <textarea rows={5} value={manual.texto} onChange={(e) => setManual({ ...manual, texto: e.target.value })} placeholder={"05 06 11 19 30 33\n03 10 13 20 21 30"}
            style={{ width: "100%", marginTop: 8, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "13px ui-monospace, monospace" }} />
          <button className="btn mt-s" disabled={busy || !manual.texto.trim()} onClick={saveManual}>Registrar</button>
        </Card>
      </div>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger"><b>Error: </b>{err}</Notice>}

      <Card title="Registros" sub="Los evaluados no se pueden borrar (integridad de la prueba).">
        {!data.registros.length && <p className="sub">Todavía no hay jugadas congeladas.</p>}
        {[...data.registros].reverse().map((r) => (
          <div key={r.id} className="card flat mt-s">
            <div className="row">
              <b>{fmtDate(r.fecha_sorteo)}</b><span className="chip">{r.version}</span>
              <span className={`chip ${r.estado === "evaluado" ? "ok" : "warn"}`}>{r.estado}</span>
              <span className="small sub">hash {r.hash}{r.historial_n ? ` · ${r.historial_n} sorteos de historia` : ""}</span>
              <div className="spacer" />
              {r.estado === "evaluado"
                ? <span className="small">Total <b>{r.total}</b> · promedio <b>{fmt(r.promedio, 2)}</b> · mejor <b>{r.mejor}</b></span>
                : <button className="btn sm danger" disabled={busy} onClick={() => run(() => api.del(`/live/${r.id}`))}>Borrar</button>}
            </div>
            {r.resultado && <div className="row mt-s small"><span className="sub">Resultado:</span><Balls sm nums={r.resultado} /></div>}
            <div className="mt-s">
              {r.combos.map((cmb, i) => (
                <div key={i} className="row small" style={{ marginBottom: 4 }}>
                  <span className="sub" style={{ width: 28 }}>{pad(i + 1)}</span>
                  <Balls sm nums={cmb} hits={r.resultado || []} />
                  {r.aciertos && <b>{r.aciertos[i]}</b>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Potencia de la prueba" sub="Qué mejora mínima se podría detectar (80% de potencia, α = 0.05) según el número de sorteos.">
        <SimpleTable rows={data.potencia} cols={[
          { k: "sorteos", h: "Sorteos" }, { k: "mejora_minima", h: "Mejora mínima (aciertos/jugada)" },
          { k: "promedio_minimo", h: "Promedio necesario" }, { k: "mejora_relativa_pct", h: "Mejora relativa", f: (r) => `${r.mejora_relativa_pct}%` },
        ]} />
        <p className="small sub mt-s">Con 100 sorteos, el modelo tendría que promediar al menos ~1.16 aciertos por jugada (frente a 1.09 del azar) para que la prueba lo detecte.</p>
      </Card>
    </div>
  );
}
