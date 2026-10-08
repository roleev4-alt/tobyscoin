import React, { useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Legend } from "recharts";
import { api, fmt, pad } from "../api.js";
import { Balls, Card, Notice, Seg, SimpleTable, Stat, heatColor, useApp, useColors } from "../ui.jsx";

const MODES = [["concentrado", "A · Concentrado"], ["equilibrado", "B · Equilibrado"], ["diversificado", "C · Diversificado"]];

function Coverage({ cov }) {
  const { openNumber } = useApp();
  const max = Math.max(1, ...cov.filas.map((r) => r.veces));
  return (
    <div className="cov">
      {cov.filas.map((r) => (
        <div key={r.numero} className="cell" onClick={() => openNumber(r.numero)} title={`${pad(r.numero)}: ${r.veces} veces (${r.pct}%)`}
          style={{ background: r.veces ? heatColor(r.veces / max) : "transparent", color: r.veces / max > 0.6 ? "#fff" : undefined }}>
          <b>{pad(r.numero)}</b><span style={{ color: "inherit" }}>{r.veces}×</span>
        </div>
      ))}
    </div>
  );
}

function Similarity({ m }) {
  return (
    <div className="tbl-wrap">
      <table className="matrix">
        <thead><tr><th /> {m.map((_, i) => <th key={i}>{pad(i + 1)}</th>)}</tr></thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}><th>{pad(i + 1)}</th>
              {row.map((v, j) => (
                <td key={j} style={{ background: i === j ? "var(--surface-2)" : v >= 3 ? "var(--danger-soft)" : v === 2 ? "var(--warn-soft)" : undefined }}>
                  {i === j ? "—" : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Portafolio() {
  const { config, setConfig, periodo, portfolio, setPortfolio, openCombo, backtest, setTab } = useApp();
  const c = useColors();
  const [mode, setMode] = useState(config.mode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pen, setPen] = useState(config.overlap_penalty);

  const generate = async (cfgOverride = {}) => {
    setBusy(true); setErr("");
    const cfg = { ...config, overlap_penalty: pen, mode, ...cfgOverride };
    try {
      setConfig(cfg);
      setPortfolio(await api.post("/portfolio", { periodo, config: cfg, nombre: `Portafolio seed ${cfg.seed}` }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const p = portfolio?.portafolios?.[mode];
  const s = p?.resumen;
  const bt = backtest?.portafolios;

  return (
    <div className="grid">
      <Card title="Configuración del portafolio" sub="Las 10 jugadas se optimizan como un único portafolio: calidad estadística + diversidad + cobertura − redundancia.">
        <div className="row">
          <Seg value={mode} onChange={setMode} options={MODES} />
          <label className="f">Random seed<input type="number" style={{ width: 130 }} value={config.seed} onChange={(e) => setConfig({ ...config, seed: Number(e.target.value) })} /></label>
          <label className="f">Candidatos<input type="number" min="1000" max="10000" step="500" style={{ width: 110 }} value={config.n_candidates} onChange={(e) => setConfig({ ...config, n_candidates: Number(e.target.value) })} /></label>
        </div>
        <div className="row mt-s">
          <span className="small sub">Penalización por números compartidos (0…6):</span>
          {pen.map((v, i) => (
            <label key={i} className="f" style={{ width: 62 }}>{i} comp.
              <input type="number" step="0.5" disabled={i === 6} value={v === null ? "" : v} placeholder={i === 6 ? "×" : ""} title={i === 6 ? "6 compartidos = combinación idéntica: se descarta" : undefined}
                onChange={(e) => { const n = [...pen]; n[i] = Number(e.target.value); setPen(n); }} />
            </label>
          ))}
        </div>
        <div className="row mt">
          <button className="btn primary" disabled={busy} onClick={() => generate()}>{portfolio ? "Recalcular" : "Generar portafolio"}</button>
          <button className="btn" disabled={busy || !portfolio} onClick={() => generate({ seed: config.seed + 1 })}>GENERAR NUEVO PORTAFOLIO</button>
          {busy && <span className="sub">Generando candidatos y optimizando…</span>}
        </div>
        <p className="small sub">«Generar nuevo portafolio» cambia solo el random seed: mantiene el modelo, las restricciones y los criterios de calidad y diversidad. No es una selección aleatoria.</p>
      </Card>
      {err && <Notice kind="danger"><b>Error: </b>{err}</Notice>}

      {p && (
        <>
          <Card title="MI PORTAFOLIO" sub={`${MODES.find((m) => m[0] === mode)[1]} · seed ${portfolio.auditoria.modelo.random_seed} · hash ${p.hash}`}>
            <div className="grid g4">
              <Stat label="Jugadas" value="10" hint="60 posiciones" />
              <Stat label="Números únicos" value={s.numeros_unicos} hint="de 31" />
              <Stat label="Score" value={`${fmt(s.score_estadistico)}/100`} hint="promedio estadístico" />
              <Stat label="Diversidad" value={`${fmt(s.diversidad.indice)}/100`} hint={s.diversidad.interpretacion} />
              <Stat label="Redundancia" value={`${fmt(s.redundancia)}/100`} hint="0 = sin números compartidos" />
              <Stat label="Cobertura" value={`${fmt(s.cobertura.indice)}/100`} hint="% de los 31 números" />
              <Stat label="Balance" value={`${fmt(s.balance)}/100`} hint="vs proporciones históricas" />
              <Stat label="Score total" value={`${fmt(s.score_total)}/100`} hint={s.formula_total} />
            </div>
            <div className="mt">
              {p.jugadas.map((j) => (
                <div key={j.opcion} className="play">
                  <div className="opt">OPCIÓN {pad(j.opcion)}</div>
                  <div><Balls nums={j.combinacion} />
                    <div className="small sub mt-s">Estrategia: {j.estrategia}</div></div>
                  <div className="score">{fmt(j.score)}<span className="sub">/100</span>
                    <div><button className="btn sm mt-s" onClick={() => openCombo(p.auditoria_combinaciones[j.opcion - 1])}>Auditoría</button></div></div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="MEJOR COMBINACIÓN SEGÚN EL MODELO" sub={`Estrategia: ${portfolio.mejor_combinacion.estrategia} · score ${portfolio.mejor_combinacion.score}/100`}>
            <Balls nums={portfolio.mejor_combinacion.combinacion} />
            <Notice kind="warn"><b>Nota: </b>{portfolio.mejor_combinacion.nota}</Notice>
          </Card>

          <Card title="Comparación de portafolios" sub="Métricas del portafolio actual. El desempeño histórico proviene del último backtesting (fuera de muestra).">
            <SimpleTable rows={portfolio.comparacion} cols={[
              { k: "portafolio", h: "Portafolio", l: 1 }, { k: "score", h: "Score" }, { k: "diversidad", h: "Diversidad" },
              { k: "cobertura", h: "Cobertura" }, { k: "redundancia", h: "Redundancia" }, { k: "numeros_unicos", h: "Únicos" },
              { k: "bt", h: "Aciertos prom. (backtest)", f: (r) => bt ? fmt(bt[r.modo]?.metricas?.promedio, 3) : "—" },
              { k: "mx", h: "Máximo (backtest)", f: (r) => bt ? (bt[r.modo]?.metricas?.maximo ?? "—") : "—" },
            ]} />
            {!bt && <p className="small sub">Ejecute el <a href="#" onClick={(e) => { e.preventDefault(); setTab("laboratorio"); }}>Laboratorio / Backtesting</a> para completar el desempeño histórico.</p>}
          </Card>

          <div className="grid g2">
            <Card title="12 · Mapa de cobertura" sub={`Veces que aparece cada número en las 60 posiciones · máximo ${s.cobertura.max_uso}`}>
              <Coverage cov={s.cobertura} />
              <p className="small sub mt-s">No se obliga a usar los 31 números; la concentración excesiva se penaliza (tope por modo: {portfolio.portafolios[mode].parametros.tope_concentracion}).</p>
            </Card>
            <Card title="13 · Matriz de similitud" sub="Números compartidos entre cada par de jugadas (ámbar = 2, rojo = 3 o más)">
              <Similarity m={p.similitud} />
            </Card>
          </div>

          <div className="grid g2">
            <Card title="Frontera de Pareto: score vs diversidad" sub="Cada punto = portafolio óptimo para un peso λ de diversidad. Los modos A/B/C son puntos sobre esta frontera.">
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="diversidad" name="Diversidad" domain={["auto", "auto"]} tickLine={false} />
                  <YAxis type="number" dataKey="score" name="Score" domain={["auto", "auto"]} tickLine={false} axisLine={false} width={40} />
                  <ZAxis range={[90, 90]} />
                  <Tooltip formatter={(v) => fmt(v, 2)} />
                  <Legend />
                  <Scatter name="Óptimo de Pareto" data={portfolio.pareto.filter((x) => x.pareto)} fill={c.c1} line={{ stroke: c.c1, strokeWidth: 2 }} />
                  <Scatter name="Dominado" data={portfolio.pareto.filter((x) => !x.pareto)} fill={c.c5} />
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Registro de decisiones">
              <table><tbody>
                <tr><td>Candidatos generados</td><td><b>{p.registro_decisiones.generados}</b></td></tr>
                <tr><td>Descartados por estructura</td><td>{p.registro_decisiones.descartados_estructura}</td></tr>
                <tr><td>Duplicados</td><td>{p.registro_decisiones.duplicados}</td></tr>
                <tr><td>Descartados por score</td><td>{p.registro_decisiones.descartados_score}</td></tr>
                <tr><td>Candidatos finales</td><td><b>{p.registro_decisiones.candidatos_finales}</b></td></tr>
                <tr><td>Descartados por redundancia (comparten ≥4 con alguna jugada elegida)</td><td>{p.registro_decisiones.descartados_redundancia}</td></tr>
                <tr><td>Portafolio</td><td><b>10</b></td></tr>
              </tbody></table>
              <p className="small sub mt-s">Candidatos por estrategia: {Object.entries(p.registro_decisiones.por_estrategia).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
            </Card>
          </div>

          <Card title="Auditoría del portafolio" sub="Índice de diversidad: componentes (0–1) y su peso">
            <div className="grid g3">
              {Object.entries(s.diversidad.componentes).map(([k, v]) => (
                <div key={k}><div className="row small"><span style={{ textTransform: "capitalize" }}>{k.replace("_", " ")}</span><div className="spacer" /><b>{fmt(v, 2)}</b><span className="sub">× {s.diversidad.pesos[k]}</span></div>
                  <div className="bar"><i style={{ width: `${v * 100}%` }} /></div></div>
              ))}
            </div>
            <h4 className="mt">Por qué entró cada combinación</h4>
            <SimpleTable rows={p.auditoria_combinaciones} onRow={openCombo} cols={[
              { k: "opcion", h: "Opción", f: (a) => pad(a.opcion) },
              { k: "c", h: "Combinación", l: 1, f: (a) => a.combinacion.map(pad).join(" — ") },
              { k: "score_final", h: "Score" }, { k: "penalizacion_redundancia", h: "Penal." },
              { k: "aporte_diversidad", h: "Δ diversidad" }, { k: "ranking_en_candidatos", h: "Rank" },
              { k: "r", h: "Motivo principal", l: 1, f: (a) => <span className="small">{a.por_que[0]}</span> },
            ]} />
            <p className="small sub mt-s">Parámetros: λ diversidad = {p.parametros.lambda_diversidad}, tope de concentración = {p.parametros.tope_concentracion},
              objetivo = {p.parametros.objetivo}. Pesos del score de combinación: {Object.entries(portfolio.auditoria.configuracion.combo_weights).map(([k, v]) => `${k} ${fmt(v, 0)}`).join(", ")}.</p>
          </Card>
        </>
      )}
      {!p && !busy && <Notice kind="info">Pulse «Generar portafolio» para construir los portafolios A, B y C con los datos del período.</Notice>}
    </div>
  );
}
