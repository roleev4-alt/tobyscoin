import React, { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, pad } from "../api.js";
import { Ball, Card, Notice, useApp, useColors } from "../ui.jsx";

export default function Indices() {
  const { info, config, setConfig, numbers, setTab } = useApp();
  const c = useColors();
  const [w, setW] = useState(config.weights);
  const [extra, setExtra] = useState({ recent_window: config.recent_window, trend_short: config.trend_short, trend_long: config.trend_long, min_trio_count: config.min_trio_count });
  useEffect(() => setW(config.weights), [config.weights]);
  const total = Object.values(w).reduce((a, b) => a + Number(b), 0);
  const comps = info.componentes;
  const apply = () => setConfig({ ...config, ...extra, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) });
  const rows = numbers ? [...numbers].sort((a, b) => a.ranking - b.ranking) : [];

  return (
    <div className="grid">
      <Notice kind="warn"><b>Este índice NO representa la probabilidad matemática real de que un número aparezca.</b> En una lotería justa
        los 31 números tienen la misma probabilidad (6/31 ≈ 19.4%) en cada sorteo. El índice solo ordena características históricas.</Notice>
      <div className="grid g2">
        <Card title="Pesos del índice de selección histórica" sub="Valores iniciales configurables. Se normalizan para sumar 100.">
          {comps.map(({ clave, etiqueta }) => (
            <div key={clave} className="mt-s">
              <div className="row"><span>{etiqueta}</span><div className="spacer" /><b>{fmt((Number(w[clave]) / total) * 100, 1)}%</b></div>
              <input type="range" min="0" max="50" step="1" value={w[clave]} onChange={(e) => setW({ ...w, [clave]: Number(e.target.value) })} />
            </div>
          ))}
          <div className="row mt">
            <button className="btn primary" onClick={apply}>Aplicar pesos</button>
            <button className="btn" onClick={() => setW(info.pesos_por_defecto)}>Pesos iniciales</button>
          </div>
        </Card>
        <Card title="Parámetros de los componentes">
          <div className="grid g2">
            <label className="f">Ventana «frecuencia reciente» (sorteos)<input type="number" min="5" max="100" value={extra.recent_window} onChange={(e) => setExtra({ ...extra, recent_window: Number(e.target.value) })} /></label>
            <label className="f">Tendencia: ventana corta<input type="number" min="3" max="50" value={extra.trend_short} onChange={(e) => setExtra({ ...extra, trend_short: Number(e.target.value) })} /></label>
            <label className="f">Tendencia: ventana larga<input type="number" min="10" max="200" value={extra.trend_long} onChange={(e) => setExtra({ ...extra, trend_long: Number(e.target.value) })} /></label>
            <label className="f">Tríos: frecuencia mínima<input type="number" min="2" max="10" value={extra.min_trio_count} onChange={(e) => setExtra({ ...extra, min_trio_count: Number(e.target.value) })} /></label>
          </div>
          <div className="small sub mt">
            <p><b>Cómo se calcula:</b> cada componente se mide para los 31 números con los sorteos del período, se normaliza entre 0 (mínimo) y 1 (máximo) y se multiplica por su peso.</p>
            <p>Frecuencia histórica = % de sorteos · Reciente = % en la ventana · Tendencia = (tasa corta − larga)/error estándar · Pares = promedio de sus 5 pares más frecuentes ·
              Tríos = participación en tríos frecuentes · Recencia = aparición más reciente puntúa más · Estructura = representación histórica de su paridad, mitad (bajo/alto) y década.</p>
          </div>
          <button className="btn mt-s" onClick={apply}>Aplicar parámetros</button>
        </Card>
      </div>

      <Card title="Índice por número (0–100)" sub="Ordenado por el índice. Toque un número para ver su auditoría completa.">
        {!numbers ? <div className="loading">Se requieren al menos 10 sorteos en el período.</div> : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[...numbers].sort((a, b) => a.numero - b.numero)}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="numero" tickFormatter={pad} interval={0} tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={30} />
                <Tooltip labelFormatter={(l) => `Número ${pad(l)}`} formatter={(v) => fmt(v)} />
                <Bar dataKey="score" name="Índice" fill={c.c1} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
            <div className="tbl-wrap scroll mt">
              <table>
                <thead><tr><th className="l">N°</th><th>Rank</th><th>Score</th>{comps.map((x) => <th key={x.clave}>{x.etiqueta.replace("Frecuencia ", "Frec. ")}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.numero}>
                      <td><Ball sm n={r.numero} /></td><td>{r.ranking}</td><td><b>{fmt(r.score)}</b></td>
                      {r.desglose.map((d) => (
                        <td key={d.componente} title={`${d.etiqueta}: ${d.puntos}/${d.maximo}`}>
                          {fmt(d.puntos, 1)}<span className="sub">/{fmt(d.maximo, 0)}</span>
                          <div className="bar" style={{ width: 54, marginLeft: "auto" }}><i style={{ width: `${d.normalizado * 100}%` }} /></div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      <div className="row"><div className="spacer" /><button className="btn primary" onClick={() => setTab("portafolio")}>Siguiente: Portafolio →</button></div>
    </div>
  );
}
