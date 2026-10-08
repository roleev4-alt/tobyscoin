import React, { useEffect, useState } from "react";
import { api, fmt, fmtDate } from "../api.js";
import { Card, Notice, SimpleTable, useApp } from "../ui.jsx";

const VERDICT = { sin_ventaja: "Sin ventaja", diferencia_nominal: "Nominal (no sig. tras Holm)", diferencia_significativa: "Significativa — requiere replicar", invalido: "Inválido" };

export default function Auditoria() {
  const { info, config, periodo, analysis, portfolio, backtest } = useApp();
  const [exps, setExps] = useState([]);
  const [versions, setVersions] = useState(null);
  const [repro, setRepro] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const [e, v] = await Promise.all([api.get("/experiments"), api.get("/versions")]);
    setExps(e.experimentos);
    setVersions(v);
  };
  useEffect(() => { load(); }, [portfolio, backtest]);

  const reproduce = async (id) => {
    setBusy(id);
    try { const r = await api.post(`/experiments/${id}/reproduce`); setRepro((x) => ({ ...x, [id]: r })); }
    catch (e) { setRepro((x) => ({ ...x, [id]: { mensaje: e.message, reproducido: false } })); }
    finally { setBusy(null); }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ periodo, config }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `loto-config-seed${config.seed}.json`;
    a.click();
  };

  return (
    <div className="grid">
      <h2>Ver auditoría</h2>
      <div className="grid g2">
        <Card title="Datos">
          <table><tbody>
            <tr><td>Período de análisis</td><td>{fmtDate(periodo.inicio)} – {fmtDate(periodo.fin)}</td></tr>
            <tr><td>Sorteos en el período</td><td>{analysis?.sorteos ?? "—"}</td></tr>
            <tr><td>Dataset (hash)</td><td><code>{analysis?.meta?.dataset_hash ?? "—"}</code></td></tr>
            <tr><td>Fuente(s)</td><td className="small">{info.datos.fuentes.map((f) => f.fuente).join(", ") || "—"}</td></tr>
            <tr><td>Período de entrenamiento (último backtest)</td><td>{backtest ? `${fmtDate(backtest.datos.entrenamiento_inicial[0])} – ${fmtDate(backtest.datos.entrenamiento_inicial[1])}` : "—"}</td></tr>
            <tr><td>Período de prueba (último backtest)</td><td>{backtest ? `${fmtDate(backtest.datos.prueba[0])} – ${fmtDate(backtest.datos.prueba[1])} (${backtest.datos.sorteos_prueba})` : "—"}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Modelo y configuración" right={<button className="btn sm" onClick={download}>Exportar configuración</button>}>
          <table><tbody>
            <tr><td>Versión del modelo</td><td>{config.model_version}</td></tr>
            <tr><td>Fecha</td><td>{fmtDate(new Date().toISOString())}</td></tr>
            <tr><td>Random seed</td><td>{config.seed}</td></tr>
            <tr><td>Modo</td><td>{config.mode}</td></tr>
            <tr><td>Candidatos</td><td>{config.n_candidates}</td></tr>
            {Object.entries(config.weights).map(([k, v]) => (
              <tr key={k}><td>Peso · {info.componentes.find((c) => c.clave === k)?.etiqueta}</td><td>{fmt(v, 1)}%</td></tr>
            ))}
            <tr><td>Penalización compartidos (0…6)</td><td>{config.overlap_penalty.map((v) => (v === null ? "desc." : v)).join(" / ")}</td></tr>
          </tbody></table>
        </Card>
      </div>
      <Notice kind="info"><b>Caja transparente: </b>Resultado final → Portafolio (pestaña Portafolio) → Combinación (botón «Auditoría») → Números (toque cualquier número) →
        Score (desglose por componente) → Datos históricos (sorteos donde apareció). Cada paso muestra cómo se calculó.</Notice>

      <Card title="Comparación entre versiones del modelo" sub={versions?.criterio}>
        {versions && versions.versiones.length ? (
          <SimpleTable rows={versions.versiones} cols={[
            { k: "nombre", h: "Versión", l: 1, f: (x) => <b>{x.nombre}</b> }, { k: "id", h: "Exp." }, { k: "seed", h: "Seed" },
            { k: "sorteos_prueba", h: "Sorteos prueba" },
            { k: "aciertos_promedio_oos", h: "Aciertos prom. (OOS)", f: (x) => fmt(x.aciertos_promedio_oos, 3) },
            { k: "diferencia_vs_azar", h: "Dif. vs azar", f: (x) => fmt(x.diferencia_vs_azar, 3) },
            { k: "p_valor", h: "p", f: (x) => fmt(x.p_valor, 3) },
            { k: "folds_positivos_pct", h: "Robustez (% folds +)", f: (x) => `${x.folds_positivos_pct}%` },
            { k: "lift_in_sample", h: "Lift IS", f: (x) => fmt(x.lift_in_sample, 3) },
            { k: "lift_fuera_muestra", h: "Lift OOS", f: (x) => fmt(x.lift_fuera_muestra, 3) },
            { k: "riesgo_sobreajuste", h: "Sobreajuste", l: 1 },
            { k: "veredicto", h: "Veredicto", l: 1, f: (x) => <span className={`chip ${x.veredicto === "invalido" ? "bad" : x.veredicto === "diferencia_significativa" ? "warn" : ""}`}>{VERDICT[x.veredicto]}</span> },
            { k: "valido", h: "Válido", f: (x) => (x.valido ? "✓" : "✗") },
          ]} />
        ) : <p className="sub">Ejecute backtests con distintos nombres (p. ej. «Modelo v1.0», «Modelo v1.1», «Modelo v2.0») para compararlos.</p>}
      </Card>

      <Card title="Experimentos guardados (reproducibilidad)" sub="Cada portafolio y backtest guarda dataset (hash), período, configuración completa, pesos, parámetros, seed, versión y resultados.">
        <SimpleTable max={420} rows={exps} cols={[
          { k: "id", h: "#" }, { k: "creado", h: "Fecha", f: (x) => fmtDate(x.creado) }, { k: "tipo", h: "Tipo", l: 1 }, { k: "nombre", h: "Nombre", l: 1 },
          { k: "seed", h: "Seed" }, { k: "dataset_hash", h: "Dataset", f: (x) => <code>{x.dataset_hash}</code> },
          { k: "resultado_hash", h: "Resultado", f: (x) => <code>{x.resultado_hash}</code> },
          { k: "r", h: "", f: (x) => (
            <div className="row" style={{ justifyContent: "flex-end" }}>
              {repro[x.id] && <span className={`chip ${repro[x.id].reproducido ? "ok" : "bad"}`} title={repro[x.id].mensaje}>{repro[x.id].reproducido ? "✓ idéntico" : "✗ difiere"}</span>}
              <button className="btn sm" disabled={busy === x.id} onClick={() => reproduce(x.id)}>{busy === x.id ? "…" : "Reproducir análisis"}</button>
            </div>) },
        ]} />
        {Object.values(repro).length > 0 && <p className="small sub mt-s">{Object.entries(repro).map(([id, r]) => `#${id}: ${r.mensaje}`).join(" · ")}</p>}
      </Card>
    </div>
  );
}
