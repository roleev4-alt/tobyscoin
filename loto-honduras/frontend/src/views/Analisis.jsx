import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, fmtDate, pad } from "../api.js";
import { Ball, Card, Notice, Seg, SimpleTable, heatColor, useApp, useColors } from "../ui.jsx";

const H = 240;
const bar = { radius: [4, 4, 0, 0], maxBarSize: 28, isAnimationActive: false };

function ObsVsTheory({ rows, x = "patron", title, sub }) {
  const c = useColors();
  return (
    <Card title={title} sub={sub}>
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} barGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={x} tickLine={false} />
          <YAxis unit="%" tickLine={false} axisLine={false} width={40} />
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend />
          <Bar dataKey="pct" name="Observado" fill={c.c1} {...bar} />
          <Bar dataKey="teorico_pct" name="Teórico (azar)" fill={c.c5} {...bar} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function PairHeatmap({ matrix }) {
  const { openNumber } = useApp();
  const max = Math.max(1, ...matrix.flat());
  const [hover, setHover] = useState(null);
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `14px repeat(31, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
        <div />
        {matrix.map((_, j) => <div key={`h${j}`} style={{ textAlign: "center", aspectRatio: "auto" }}>{j % 5 === 0 ? j + 1 : ""}</div>)}
        {matrix.map((row, i) => (
          <React.Fragment key={i}>
            <div style={{ aspectRatio: "auto", textAlign: "right", paddingRight: 2 }}>{i % 5 === 0 ? i + 1 : ""}</div>
            {row.map((v, j) => (
              <div key={j} onMouseEnter={() => setHover({ a: i + 1, b: j + 1, v })} onClick={() => openNumber(i + 1)}
                style={{ background: i === j ? "transparent" : heatColor(v / max), cursor: "pointer" }} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <p className="small sub">{hover && hover.a !== hover.b ? `${pad(hover.a)} y ${pad(hover.b)}: ${hover.v} veces juntos` : "Pase el cursor sobre una celda para ver el conteo. Más oscuro = más veces juntos."}</p>
    </div>
  );
}

export default function Analisis() {
  const { analysis, setTab } = useApp();
  const c = useColors();
  const [win, setWin] = useState("ult_20");
  if (!analysis) return <div className="loading">Cargue datos en la pestaña «Datos históricos» para ver el análisis.</div>;
  if (!analysis.sorteos) return <Notice kind="info">No hay sorteos en el período seleccionado.</Notice>;
  const f = analysis.frecuencia;
  const rec = analysis.reciente;
  const r = analysis.recencia;
  const e = analysis.estructura;
  const byFreq = [...f.filas].sort((a, b) => a.ranking - b.ranking);
  const byRecent = [...rec.filas].sort((a, b) => b[win] - a[win]);
  const byGap = [...r.filas].sort((a, b) => b.sorteos_desde - a.sorteos_desde);
  const pv = f.chi2_p;

  return (
    <div className="grid">
      <Notice kind={pv !== null && pv < 0.05 ? "warn" : "info"}>
        <b>Prueba de uniformidad (χ²): </b>
        {pv === null ? "muestra insuficiente." : <>χ² = {fmt(f.chi2, 2)} con {f.chi2_gl} g.l., p = {fmt(pv, 3)}. {pv < 0.05
          ? "Las frecuencias difieren de lo esperado bajo azar más de lo habitual; con muestras pequeñas esto puede ocurrir por casualidad (1 de cada 20 veces)."
          : "Las diferencias de frecuencia entre números son compatibles con el azar."}</>}
        {" "}Esperado por número: {f.esperado_por_numero} apariciones en {f.sorteos} sorteos.
      </Notice>

      <h2>Dashboard de números</h2>
      <div className="grid g3">
        <Card title="Top históricos" sub="Más apariciones en el período">
          <div className="balls">{byFreq.slice(0, 6).map((x) => <Ball key={x.numero} n={x.numero} />)}</div>
          <p className="small sub">{byFreq.slice(0, 6).map((x) => `${pad(x.numero)}: ${x.apariciones}`).join(" · ")}</p>
        </Card>
        <Card title="Top recientes" sub="Últimos 20 sorteos">
          <div className="balls">{[...rec.filas].sort((a, b) => b.ult_20 - a.ult_20).slice(0, 6).map((x) => <Ball key={x.numero} n={x.numero} />)}</div>
        </Card>
        <Card title="Mayor ausencia" sub="Más sorteos sin aparecer (no implica mayor probabilidad)">
          <div className="balls">{byGap.slice(0, 6).map((x) => <Ball key={x.numero} n={x.numero} />)}</div>
          <p className="small sub">{byGap.slice(0, 6).map((x) => `${pad(x.numero)}: ${x.sorteos_desde}`).join(" · ")}</p>
        </Card>
        <Card title="Top pares" sub={`Esperado por par: ${analysis.pares.esperado_por_par}`}>
          {analysis.pares.top.slice(0, 5).map((p) => (
            <div key={`${p.a}-${p.b}`} className="row" style={{ marginBottom: 4 }}><Ball sm n={p.a} /><Ball sm n={p.b} /><span className="small sub">{p.veces} veces · lift {p.lift}</span></div>
          ))}
        </Card>
        <Card title="Top tríos" sub={`Esperado por trío: ${analysis.trios.esperado_por_trio}`}>
          {analysis.trios.top.slice(0, 5).map((t) => (
            <div key={t.trio.join("-")} className="row" style={{ marginBottom: 4 }}>{t.trio.map((n) => <Ball sm key={n} n={n} />)}<span className="small sub">{t.veces} veces</span></div>
          ))}
          {!analysis.trios.top.length && <p className="sub small">Ningún trío alcanza la frecuencia mínima.</p>}
        </Card>
      </div>

      <h2 className="mt">Frecuencia</h2>
      <Card title="1 · Frecuencia por número" sub="Línea punteada = apariciones esperadas si todos los números fueran igual de probables">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={f.filas}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="numero" tickFormatter={pad} interval={0} tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tickLine={false} axisLine={false} width={34} />
            <Tooltip labelFormatter={(l) => `Número ${pad(l)}`} formatter={(v, n) => [v, n]} />
            <ReferenceLine y={f.esperado_por_numero} stroke={c.muted} strokeDasharray="4 4" />
            <Bar dataKey="apariciones" name="Apariciones" fill={c.c1} {...bar} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Tabla de frecuencia" sub="Clasificación por quintiles del ranking. z = desviación respecto al azar en errores estándar.">
        <SimpleTable max={360} rows={byFreq} cols={[
          { k: "numero", h: "Número", f: (x) => <Ball sm n={x.numero} /> },
          { k: "apariciones", h: "Apariciones" }, { k: "pct_sorteos", h: "% sorteos", f: (x) => `${fmt(x.pct_sorteos)}%` },
          { k: "ranking", h: "Ranking" }, { k: "z", h: "z" }, { k: "clase", h: "Clase", l: 1 },
        ]} />
      </Card>

      <h2 className="mt">Frecuencia reciente y tendencia</h2>
      <div className="grid g2">
        <Card title="Comparación por ventana" sub={`Sorteos por ventana: ${Object.entries(rec.ventanas).map(([k, v]) => `${k.replace("ult_", "últ. ")}=${v}`).join(", ")}`}
          right={<Seg value={win} onChange={setWin} options={[["ult_10", "10"], ["ult_20", "20"], ["ult_50", "50"], ["ult_100", "100"], ["historico", "Todo"]]} />}>
          <SimpleTable max={330} rows={byRecent} cols={[
            { k: "numero", h: "N°", f: (x) => <Ball sm n={x.numero} /> },
            { k: "ult_10", h: "Últ. 10", f: (x) => `${x.ult_10}%` }, { k: "ult_20", h: "Últ. 20", f: (x) => `${x.ult_20}%` },
            { k: "ult_50", h: "Últ. 50", f: (x) => `${x.ult_50}%` }, { k: "ult_100", h: "Últ. 100", f: (x) => `${x.ult_100}%` },
            { k: "historico", h: "Total", f: (x) => `${x.historico}%` }, { k: "tendencia", h: "Tendencia", f: (x) => fmt(x.tendencia, 2) },
          ]} />
        </Card>
        <Card title="2 · Índice de tendencia reciente" sub={rec.nota + " Índice = (tasa corta − tasa larga) / error estándar."}>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={rec.filas}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="numero" tickFormatter={pad} interval={1} tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tickLine={false} axisLine={false} width={34} />
              <Tooltip labelFormatter={(l) => `Número ${pad(l)}`} formatter={(v) => fmt(v, 2)} />
              <ReferenceLine y={0} stroke={c.muted} />
              <Bar dataKey="tendencia" name="Tendencia" maxBarSize={18} radius={[4, 4, 4, 4]}>
                {rec.filas.map((x) => <Cell key={x.numero} fill={x.tendencia >= 0 ? c.c1 : c.c2} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <h2 className="mt">Recencia y ausencia</h2>
      <Notice kind="warn"><b>Importante: </b>{r.nota}</Notice>
      <div className="grid g2">
        <Card title="7 · Sorteos desde la última aparición">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={r.filas}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="numero" tickFormatter={pad} interval={1} tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tickLine={false} axisLine={false} width={30} />
              <Tooltip labelFormatter={(l) => `Número ${pad(l)}`} />
              <Bar dataKey="sorteos_desde" name="Sorteos sin salir" fill={c.c4} {...bar} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Tabla de recencia" sub={`Frecuencia reciente = apariciones en los últimos ${r.ventana_reciente} sorteos`}>
          <SimpleTable max={280} rows={byGap} cols={[
            { k: "numero", h: "N°", f: (x) => <Ball sm n={x.numero} /> },
            { k: "ultima_aparicion", h: "Última aparición", f: (x) => fmtDate(x.ultima_aparicion) },
            { k: "sorteos_desde", h: "Sorteos desde" }, { k: "frecuencia_reciente", h: "Frec. reciente" }, { k: "clase", h: "Clase", l: 1 },
          ]} />
        </Card>
      </div>

      <h2 className="mt">Pares y tríos</h2>
      <div className="grid g2">
        <Card title="3 · Heatmap de pares" sub="Veces que cada par de números apareció en el mismo sorteo">
          <PairHeatmap matrix={analysis.pares.matriz} />
        </Card>
        <Card title="10 pares más frecuentes" sub={analysis.pares.nota}>
          <SimpleTable rows={analysis.pares.top} cols={[
            { k: "p", h: "Par", l: 1, f: (x) => <div className="row"><Ball sm n={x.a} /><Ball sm n={x.b} /></div> },
            { k: "veces", h: "Veces" }, { k: "pct_sorteos", h: "% sorteos", f: (x) => `${x.pct_sorteos}%` }, { k: "lift", h: "Fuerza (lift)" },
          ]} />
        </Card>
      </div>
      <Card title="Tríos con frecuencia suficiente" sub={`Mínimo ${analysis.trios.minimo} apariciones · ${analysis.trios.total_con_frecuencia_minima} tríos cumplen`}>
        <Notice kind="warn"><b>Tamaño de muestra pequeño. </b>{analysis.trios.advertencia}</Notice>
        <div className="mt-s"><SimpleTable max={300} rows={analysis.trios.top} cols={[
          { k: "t", h: "Trío", l: 1, f: (x) => <div className="row">{x.trio.map((n) => <Ball sm key={n} n={n} />)}</div> },
          { k: "veces", h: "Veces" }, { k: "pct_sorteos", h: "% sorteos", f: (x) => `${x.pct_sorteos}%` },
        ]} /></div>
      </Card>

      <h2 className="mt">Estructura de los sorteos</h2>
      <p className="sub">{e.leyenda}. Se compara lo observado con la distribución teórica exacta calculada sobre las 736,281 combinaciones posibles.</p>
      <div className="grid g2">
        <ObsVsTheory title="4 · Pares e impares" sub={`impares/pares · χ² p = ${fmt(e.pruebas.impares.p, 3)}`} rows={e.par_impar} />
        <ObsVsTheory title="5 · Bajos (01–15) y altos (16–31)" sub={`bajos/altos · χ² p = ${fmt(e.pruebas.bajos.p, 3)}`} rows={e.bajo_alto} />
        <ObsVsTheory title="6 · Distribución de la suma" sub={`Media ${e.suma.media} · mediana ${e.suma.mediana} · mín ${e.suma.minimo} · máx ${e.suma.maximo} · teórica ${e.suma.teorico_media} ± ${e.suma.teorico_desv}`} rows={e.suma.histograma} x="rango" />
        <ObsVsTheory title="Pares consecutivos por sorteo" sub="Ej.: 14-15 cuenta como 1 par consecutivo" rows={e.consecutivos} x="pares_consecutivos" />
      </div>
      <Card title="Décadas (01–10 / 11–20 / 21–31)" sub="Cantidad de números en cada década">
        <SimpleTable max={300} rows={e.decadas} cols={[{ k: "patron", h: "Patrón", l: 1 }, { k: "veces", h: "Veces" }, { k: "pct", h: "% obs.", f: (x) => `${x.pct}%` }, { k: "teorico_pct", h: "% teórico", f: (x) => `${x.teorico_pct}%` }]} />
      </Card>
      <div className="row"><div className="spacer" /><button className="btn primary" onClick={() => setTab("indices")}>Siguiente: Índices →</button></div>
    </div>
  );
}
