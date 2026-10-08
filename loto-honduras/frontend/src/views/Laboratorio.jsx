import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmt, fmtDate } from "../api.js";
import { Card, Notice, SimpleTable, Stat, useApp, useColors } from "../ui.jsx";

const LABEL = { concentrado: "A · Concentrado", equilibrado: "B · Equilibrado", diversificado: "C · Diversificado", aleatorio: "Aleatorio (control)" };
const METRIC = { promedio_aciertos: "Aciertos promedio por jugada", promedio_mejor_jugada: "Promedio de la mejor jugada", sorteos_alguna_ge3: "Sorteos con alguna jugada ≥3" };

function Integrity({ checks, valid }) {
  return (
    <Card title="Integridad del backtesting" sub={valid ? "Todas las condiciones se cumplen: el experimento es válido." : "Alguna condición falló."}>
      {checks.map((c) => (
        <div key={c.control} className="check">
          <span className={`ic ${c.ok ? "ok" : "bad"}`}>{c.ok ? "✓" : "✗"}</span>
          <div><b>{c.control}</b><div className="small sub">{c.detalle}</div></div>
        </div>
      ))}
    </Card>
  );
}

export default function Laboratorio() {
  const { periodo, config, backtest, setBacktest } = useApp();
  const c = useColors();
  const [p, setP] = useState({ nombre: "Modelo v1.0", fin_entrenamiento: "2025-12-31", meses_por_fold: 1, optimizar_pesos: true,
    actualizar_dentro_del_fold: true, simulaciones_mc: 1000, pruebas_pesos: 150, regularizacion: 0.25 });
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr("");
    try {
      const { job: id } = await api.post("/backtest", { ...p, periodo, config });
      setJob({ id, progreso: [0, 0] });
      const poll = async () => {
        const s = await api.get(`/jobs/${id}`);
        if (s.estado === "ejecutando") { setJob({ id, progreso: s.progreso }); setTimeout(poll, 800); return; }
        setJob(null);
        if (s.estado === "error") setErr(s.error); else setBacktest(s.resultado);
      };
      poll();
    } catch (e) { setErr(e.message); setJob(null); }
  };

  const r = backtest;
  const evo = useMemo(() => {
    if (!r) return [];
    let a = 0, b = 0, k = 0;
    return r.evolucion.map((x) => {
      k += 1; a += x.equilibrado.prom; b += x.aleatorio.prom;
      return { fecha: fmtDate(x.fecha), modelo: +(a / k).toFixed(4), aleatorio: +(b / k).toFixed(4) };
    });
  }, [r]);

  return (
    <div className="grid">
      <Notice kind="info"><b>Pregunta fundamental: </b>¿El análisis de resultados anteriores permite construir una estrategia que históricamente se comporte mejor que
        seleccionar números al azar? El laboratorio no asume que la respuesta es sí: intenta demostrarlo o refutarlo con validación temporal estricta.</Notice>
      <Card title="Configuración del experimento (walk-forward)" sub="Entrenamiento: desde el inicio del período hasta la fecha indicada. Prueba: bloques mensuales posteriores; luego el entrenamiento se amplía y se avanza.">
        <div className="grid g4">
          <label className="f">Nombre / versión<input type="text" value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} /></label>
          <label className="f">Fin del entrenamiento inicial<input type="date" value={p.fin_entrenamiento} onChange={(e) => setP({ ...p, fin_entrenamiento: e.target.value })} /></label>
          <label className="f">Meses por bloque de prueba<input type="number" min="1" max="6" value={p.meses_por_fold} onChange={(e) => setP({ ...p, meses_por_fold: Number(e.target.value) })} /></label>
          <label className="f">Simulaciones Monte Carlo<input type="number" min="100" max="5000" step="100" value={p.simulaciones_mc} onChange={(e) => setP({ ...p, simulaciones_mc: Number(e.target.value) })} /></label>
          <label className="f">Configuraciones de pesos probadas<input type="number" min="10" max="500" value={p.pruebas_pesos} onChange={(e) => setP({ ...p, pruebas_pesos: Number(e.target.value) })} /></label>
          <label className="f">Regularización (L1 hacia pesos iniciales)<input type="number" min="0" max="2" step="0.05" value={p.regularizacion} onChange={(e) => setP({ ...p, regularizacion: Number(e.target.value) })} /></label>
          <label className="row small"><input type="checkbox" checked={p.optimizar_pesos} onChange={(e) => setP({ ...p, optimizar_pesos: e.target.checked })} /> Optimizar pesos (solo con entrenamiento)</label>
          <label className="row small"><input type="checkbox" checked={p.actualizar_dentro_del_fold} onChange={(e) => setP({ ...p, actualizar_dentro_del_fold: e.target.checked })} /> Actualizar estadísticas con sorteos ya ocurridos dentro del bloque</label>
        </div>
        <div className="row mt">
          <button className="btn primary" disabled={!!job} onClick={run}>Ejecutar backtesting</button>
          {job && <div style={{ flex: 1, minWidth: 160 }}>
            <div className="progress"><i style={{ width: `${job.progreso[1] ? (100 * job.progreso[0]) / job.progreso[1] : 3}%` }} /></div>
            <span className="small sub">Bloque {job.progreso[0]} de {job.progreso[1] || "?"} · generando, sellando y luego evaluando…</span>
          </div>}
        </div>
        <p className="small sub">Se usa la configuración actual del modelo (pesos, penalizaciones, seed {config.seed}). Los pesos optimizados se congelan antes de cada bloque de prueba.</p>
      </Card>
      {err && <Notice kind="danger"><b>Error: </b>{err}</Notice>}

      {r && (
        <>
          <Card className={`verdict ${r.conclusion.veredicto}`} title="Conclusión automática" sub={`${r.auditoria.modelo.nombre} · seed ${r.auditoria.modelo.random_seed} · experimento #${r.experimento_id}`}>
            <p style={{ fontSize: "1.05rem" }}><b>{r.conclusion.texto}</b></p>
            <ul className="small">{r.conclusion.detalles.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </Card>
          {!r.valido && <Notice kind="danger"><b>Este experimento no puede considerarse estadísticamente válido debido a contaminación entre los datos de entrenamiento y prueba.</b></Notice>}

          <div className="grid g2">
            <Integrity checks={r.integridad} valid={r.valido} />
            <Card title="Datos del experimento">
              <div className="grid g2">
                <Stat label="Entrenamiento inicial" value={r.datos.sorteos_entrenamiento_inicial} hint={`${fmtDate(r.datos.entrenamiento_inicial[0])} → ${fmtDate(r.datos.entrenamiento_inicial[1])}`} />
                <Stat label="Sorteos de prueba" value={r.datos.sorteos_prueba} hint={`${fmtDate(r.datos.prueba[0])} → ${fmtDate(r.datos.prueba[1])}`} />
                <Stat label="Bloques (folds)" value={r.datos.folds} hint={`${r.robustez.folds_positivos} con diferencia positiva`} />
                <Stat label="Riesgo de sobreajuste" value={r.sobreajuste.riesgo} hint={`${r.sobreajuste.parametros_libres} parámetros libres`} />
              </div>
              <p className="small sub mt">Referencia teórica: una jugada al azar acierta en promedio {r.referencia_teorica.aciertos_esperados_por_jugada} números
                (P(≥3) = {fmt(100 * (+r.referencia_teorica.pmf["3"] + +r.referencia_teorica.pmf["4"] + +r.referencia_teorica.pmf["5"] + +r.referencia_teorica.pmf["6"]), 2)}%,
                P(6) = 1 en {Math.round(1 / r.referencia_teorica.pmf["6"]).toLocaleString("es")}).</p>
            </Card>
          </div>

          <Card title="Significancia: modelo vs Monte Carlo" sub={`${r.monte_carlo.simulaciones} portafolios aleatorios evaluados sobre los mismos sorteos. p = proporción de simulaciones iguales o mejores que el modelo (unilateral). Holm corrige por comparaciones múltiples.`}>
            <div className="tbl-wrap"><table>
              <thead><tr><th className="l">Portafolio</th><th className="l">Métrica</th><th>Modelo</th><th>Azar (media MC)</th><th>Diferencia</th><th>Percentil</th><th>p</th><th>p (Holm)</th></tr></thead>
              <tbody>
                {["concentrado", "equilibrado", "diversificado"].flatMap((m) => Object.entries(r.portafolios[m].vs_monte_carlo).map(([k, v]) => (
                  <tr key={m + k}><td className="l">{LABEL[m]}</td><td className="l">{METRIC[k]}</td><td>{fmt(v.modelo, 3)}</td><td>{fmt(v.mc_media, 3)}</td>
                    <td>{v.diferencia > 0 ? "+" : ""}{fmt(v.diferencia, 3)}</td><td>{fmt(v.percentil_vs_azar, 0)}</td><td>{fmt(v.p_valor, 3)}</td>
                    <td><span className={`chip ${v.p_ajustado_holm < 0.05 ? "warn" : ""}`}>{fmt(v.p_ajustado_holm, 3)}</span></td></tr>
                )))}
              </tbody>
            </table></div>
            <p className="small sub mt-s">IC 95% (bootstrap) de la diferencia del portafolio equilibrado vs el valor esperado por azar: [{fmt(r.portafolios.equilibrado.ic95_diferencia_vs_esperado[0], 3)}, {fmt(r.portafolios.equilibrado.ic95_diferencia_vs_esperado[1], 3)}] aciertos por jugada.
              {" "}Nota: los portafolios diversificados pueden tener más sorteos con «alguna jugada ≥3» solo por cubrir más números; eso es estructura, no predicción.</p>
          </Card>

          <div className="grid g2">
            <Card title="9 · Modelo vs azar" sub="Aciertos promedio por jugada (línea = valor esperado por azar 36/31)">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={[["A", "concentrado"], ["B", "equilibrado"], ["C", "diversificado"], ["Aleatorio", "aleatorio"]]
                  .map(([n, m]) => ({ n, v: r.portafolios[m].metricas.promedio })).concat([{ n: "MC (media)", v: r.monte_carlo.promedio_aciertos.media }])}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="n" tickLine={false} />
                  <YAxis domain={[0, "auto"]} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={(v) => fmt(v, 3)} />
                  <ReferenceLine y={r.referencia_teorica.aciertos_esperados_por_jugada} stroke={c.muted} strokeDasharray="4 4" />
                  <Bar dataKey="v" name="Aciertos promedio" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {["a", "b", "c", "d", "e"].map((x, i) => <Cell key={x} fill={i < 3 ? c.c1 : c.c5} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="11 · Distribución Monte Carlo" sub={`Aciertos promedio por jugada de ${r.monte_carlo.simulaciones} portafolios aleatorios. Líneas: A, B, C. P5–P95: ${fmt(r.monte_carlo.promedio_aciertos.p5, 3)}–${fmt(r.monte_carlo.promedio_aciertos.p95, 3)}`}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={r.monte_carlo.histograma_promedio.bins} barCategoryGap={1}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => v.toFixed(2)} tickLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={30} />
                  <Tooltip labelFormatter={(v) => `≈ ${fmt(v, 3)}`} />
                  <Bar dataKey="n" name="Simulaciones" fill={c.c5} />
                  {["concentrado", "equilibrado", "diversificado"].map((m, i) => (
                    <ReferenceLine key={m} x={r.portafolios[m].metricas.promedio} stroke={[c.c1, c.c3, c.c4][i]} strokeWidth={2}
                      label={{ value: "ABC"[i], position: "top", fill: c.text, fontSize: 11 }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="10 · Evolución del backtesting" sub="Promedio acumulado de aciertos por jugada, sorteo a sorteo (portafolio equilibrado vs portafolio aleatorio de control)">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={evo}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="fecha" tickLine={false} minTickGap={40} />
                <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v) => fmt(v, 3)} />
                <Legend />
                <ReferenceLine y={r.referencia_teorica.aciertos_esperados_por_jugada} stroke={c.muted} strokeDasharray="4 4" />
                <Line dataKey="modelo" name="Modelo (B · Equilibrado)" stroke={c.c1} strokeWidth={2} dot={false} />
                <Line dataKey="aleatorio" name="Aleatorio (control)" stroke={c.c2} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Métricas de los portafolios (fuera de muestra)" sub="Cada sorteo de prueba: 10 jugadas generadas y selladas antes de conocer el resultado">
            <div className="tbl-wrap"><table>
              <thead><tr><th className="l">Portafolio</th>{[0, 1, 2, 3, 4, 5, 6].map((k) => <th key={k}>{k} aciertos</th>)}<th>Promedio</th><th>Mejor</th><th>Jug. ≥2</th><th>≥3</th><th>≥4</th><th>≥5</th><th>6</th><th>Sorteos alguna ≥3</th><th>alguna ≥4</th></tr></thead>
              <tbody>
                {["concentrado", "equilibrado", "diversificado", "aleatorio"].map((m) => {
                  const x = r.portafolios[m].metricas;
                  return (<tr key={m}><td className="l">{LABEL[m]}</td>{[0, 1, 2, 3, 4, 5, 6].map((k) => <td key={k}>{x.distribucion[k]}</td>)}
                    <td><b>{fmt(x.promedio, 3)}</b></td><td>{x.mejor_resultado}</td><td>{x.jugadas_ge2}</td><td>{x.jugadas_ge3}</td><td>{x.jugadas_ge4}</td><td>{x.jugadas_ge5}</td><td>{x.jugadas_6}</td>
                    <td>{x.sorteos_alguna_ge3}</td><td>{x.sorteos_alguna_ge4}</td></tr>);
                })}
                <tr><td className="l">Monte Carlo (por portafolio)</td>{[0, 1, 2, 3, 4, 5, 6].map((k) => <td key={k}>{fmt(r.monte_carlo.metricas_agregadas.distribucion[k] / r.monte_carlo.simulaciones, 1)}</td>)}
                  <td><b>{fmt(r.monte_carlo.promedio_aciertos.media, 3)}</b></td><td>{r.monte_carlo.metricas_agregadas.maximo}</td><td colSpan={5} /><td>{fmt(r.monte_carlo.sorteos_alguna_ge3.media, 1)}</td><td /></tr>
              </tbody>
            </table></div>
          </Card>

          <div className="grid g2">
            <Card title="8 · Ranking de estrategias" sub="Diferencia vs azar de la mejor jugada de cada estrategia (aciertos por sorteo)">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={r.estrategias} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} />
                  <YAxis type="category" dataKey="estrategia" width={150} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v, 3)} />
                  <ReferenceLine x={0} stroke={c.muted} />
                  <Bar dataKey="diferencia" name="Diferencia vs azar" maxBarSize={16} radius={[4, 4, 4, 4]}>
                    {r.estrategias.map((x) => <Cell key={x.codigo} fill={x.diferencia >= 0 ? c.c1 : c.c2} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Métricas por estrategia" sub="p exacto: suma de aciertos vs distribución hipergeométrica; Holm sobre las 10 estrategias">
              <SimpleTable max={300} rows={r.estrategias} cols={[
                { k: "estrategia", h: "Estrategia", l: 1 }, { k: "promedio", h: "Prom.", f: (x) => fmt(x.promedio, 3) }, { k: "mediana", h: "Med." },
                { k: "maximo", h: "Máx." }, { k: "pct_ge2", h: "%≥2" }, { k: "pct_ge3", h: "%≥3" }, { k: "pct_ge4", h: "%≥4" }, { k: "pct_ge5", h: "%≥5" },
                { k: "seis", h: "6" }, { k: "p_valor", h: "p" }, { k: "p_ajustado_holm", h: "p Holm" },
              ]} />
              <p className="small sub mt-s">Mejor combinación individual del modelo: promedio {fmt(r.mejor_individual.promedio, 3)}, máximo {r.mejor_individual.maximo}, p = {fmt(r.mejor_individual.p_valor, 3)}.</p>
            </Card>
          </div>

          <Card title="Control de sobreajuste" sub={r.sobreajuste.complejidad}>
            <div className="grid g4">
              <Stat label="Riesgo estimado" value={r.sobreajuste.riesgo} />
              <Stat label="Lift dentro de muestra" value={fmt(r.sobreajuste.lift_in_sample_prom, 3)} hint="entrenamiento" />
              <Stat label="Lift fuera de muestra" value={fmt(r.sobreajuste.lift_fuera_muestra_prom, 3)} hint="prueba (pesos congelados)" />
              <Stat label="Brecha" value={fmt(r.sobreajuste.brecha, 3)} hint={r.sobreajuste.sorteos_internos_por_parametro ? `${r.sobreajuste.sorteos_internos_por_parametro} sorteos por parámetro` : ""} />
            </div>
            <p className="small sub mt">{r.sobreajuste.explicacion} Los pesos se eligen maximizando el peor desempeño entre dos mitades temporales del entrenamiento, con penalización L1 hacia los pesos iniciales
              (se prefiere un modelo algo menos optimizado pero más robusto).</p>
          </Card>

          <Card title="Bloques walk-forward" sub="Pesos congelados por bloque; datos usados para los pesos siempre anteriores al bloque de prueba">
            <SimpleTable max={360} rows={r.folds} cols={[
              { k: "fold", h: "#" },
              { k: "e", h: "Entrenamiento", l: 1, f: (x) => `${fmtDate(x.entrenamiento[0])} → ${fmtDate(x.entrenamiento[1])} (${x.sorteos_entrenamiento})` },
              { k: "t", h: "Prueba", l: 1, f: (x) => `${fmtDate(x.prueba[0])} → ${fmtDate(x.prueba[1])} (${x.sorteos_prueba})` },
              { k: "w", h: "Pesos (hist/rec/tend/pares/tríos/rec./estr.)", l: 1, f: (x) => Object.values(x.pesos).map((v) => fmt(v, 0)).join(" / ") },
              { k: "li", h: "Lift IS", f: (x) => fmt(x.optimizacion.lift_in_sample, 3) },
              { k: "lo", h: "Lift OOS", f: (x) => fmt(x.lift_fuera_muestra, 3) },
              { k: "p", h: "Prom. B", f: (x) => fmt(x.promedio_equilibrado, 3) },
              { k: "d", h: "Dif. vs azar", f: (x) => fmt(x.dif_vs_esperado, 3) },
            ]} />
          </Card>
        </>
      )}
    </div>
  );
}
