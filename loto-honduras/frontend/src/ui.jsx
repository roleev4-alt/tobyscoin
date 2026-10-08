import React, { createContext, useContext, useEffect, useState } from "react";
import { fmt, fmtDate, pad } from "./api.js";

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function useColors() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const g = (k) => s.getPropertyValue(k).trim();
    return { c1: g("--c1"), c2: g("--c2"), c3: g("--c3"), c4: g("--c4"), c5: g("--c5"), muted: g("--muted"),
      border: g("--border"), primary: g("--primary"), surface: g("--surface"), text: g("--text"), danger: g("--danger") };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => setC(read());
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return c;
}

export const Card = ({ title, sub, right, children, className = "" }) => (
  <section className={`card ${className}`}>
    {(title || right) && (
      <div className="card-h">
        <div>
          {title && <h3>{title}</h3>}
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, hint }) => (
  <div className="stat">
    <span className="l">{label}</span>
    <span className="v">{value}</span>
    {hint && <span className="h">{hint}</span>}
  </div>
);

export function Ball({ n, sm, hit }) {
  const { openNumber } = useApp();
  return (
    <button className={`ball ${sm ? "sm" : ""} ${hit ? "hit" : ""}`} onClick={() => openNumber(n)} title={`Ver auditoría del ${pad(n)}`}>
      {pad(n)}
    </button>
  );
}

export const Balls = ({ nums, sm, hits }) => (
  <div className="balls">{nums.map((n) => <Ball key={n} n={n} sm={sm} hit={hits && hits.includes(n)} />)}</div>
);

export const Notice = ({ kind = "info", children }) => <div className={`notice ${kind}`}>{children}</div>;

export const Disclaimer = ({ text }) => (
  <Notice kind="warn"><b>Advertencia. </b>{text}</Notice>
);

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function heatColor(t, base = "11, 92, 171") {
  const a = Math.max(0, Math.min(1, t));
  return `rgba(${base}, ${0.06 + a * 0.9})`;
}

export function Modal({ onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row"><div className="spacer" /><button className="btn sm" onClick={onClose}>Cerrar ✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function NumberAudit({ n, numbers, draws, analysis }) {
  const row = numbers?.find((r) => r.numero === n);
  const freq = analysis?.frecuencia?.filas?.find((r) => r.numero === n);
  const rec = analysis?.recencia?.filas?.find((r) => r.numero === n);
  const appearances = (draws || []).filter((d) => [d.n1, d.n2, d.n3, d.n4, d.n5, d.n6].includes(n));
  return (
    <div>
      <div className="crumbs">Portafolio › Combinación › <b>Número</b> › Score › Datos históricos</div>
      <div className="row"><span className="ball" style={{ width: 54, height: 54, fontSize: "1.3rem" }}>{pad(n)}</span>
        <div><h2 style={{ margin: 0 }}>Número {pad(n)}</h2>
          {row && <div className="sub">Índice de selección histórica: <b>{fmt(row.score)}</b> / 100 · ranking {row.ranking} de 31</div>}
        </div>
      </div>
      {!row && <p className="sub mt">Genere el índice (pestaña Índices) para ver el desglose.</p>}
      {row && (
        <div className="mt">
          <h4>Desglose del score</h4>
          <table>
            <thead><tr><th className="l">Componente</th><th>Puntos</th><th>Máx.</th><th>Normalizado</th><th>Valor crudo</th></tr></thead>
            <tbody>
              {row.desglose.map((d) => (
                <tr key={d.componente}><td>{d.etiqueta}</td><td><b>{fmt(d.puntos, 2)}</b></td><td>{fmt(d.maximo, 0)}</td>
                  <td>{fmt(d.normalizado, 3)}</td><td>{fmt(d.valor_crudo, 3)}</td></tr>
              ))}
              <tr><td><b>Total</b></td><td><b>{fmt(row.total)}</b></td><td>100</td><td /><td /></tr>
            </tbody>
          </table>
          <p className="small sub mt-s">Cada componente se normaliza entre el mínimo y el máximo de los 31 números (0–1) y se multiplica por su peso.
            Recencia: valor crudo = −(sorteos desde la última aparición). {row.nota}</p>
        </div>
      )}
      {freq && (
        <div className="mt grid g3">
          <Stat label="Apariciones" value={freq.apariciones} hint={`esperado por azar: ${freq.esperado_azar}`} />
          <Stat label="% sorteos" value={`${fmt(freq.pct_sorteos)}%`} hint={freq.clase} />
          <Stat label="Sorteos sin salir" value={rec?.sorteos_desde ?? "—"} hint={rec ? `${rec.clase} · última ${fmtDate(rec.ultima_aparicion)}` : ""} />
        </div>
      )}
      <div className="mt">
        <h4>Datos históricos — sorteos donde apareció ({appearances.length})</h4>
        <div className="scroll" style={{ maxHeight: 300 }}>
          <table>
            <tbody>
              {appearances.map((d) => (
                <tr key={d.fecha}><td>{fmtDate(d.fecha)}</td>
                  <td className="l">{[d.n1, d.n2, d.n3, d.n4, d.n5, d.n6].map((x) => (
                    <span key={x} style={{ fontWeight: x === n ? 800 : 400, color: x === n ? "var(--primary)" : undefined, marginRight: 6 }}>{pad(x)}</span>))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small sub">Lista de todos los sorteos almacenados (puede incluir fechas fuera del período seleccionado).</p>
      </div>
    </div>
  );
}

export function ComboAudit({ a }) {
  return (
    <div>
      <div className="crumbs">Portafolio › <b>Combinación</b> › Números › Score › Datos históricos</div>
      <h2>Opción {pad(a.opcion)}</h2>
      <Balls nums={a.combinacion} />
      <p className="sub mt-s">Estrategia de origen: <b>{a.estrategia}</b> · puesto {a.ranking_en_candidatos} entre los candidatos por score individual</p>
      <div className="grid g3 mt">
        <Stat label="Score final" value={fmt(a.score_final)} />
        <Stat label="Penalización redundancia" value={fmt(a.penalizacion_redundancia, 2)} hint="λ × Σ penalización por compartidos" />
        <Stat label="Aporte a diversidad" value={(a.aporte_diversidad > 0 ? "+" : "") + fmt(a.aporte_diversidad)} hint="índice con vs sin esta jugada" />
      </div>
      <h4 className="mt">Desglose del score (0–100 por parte)</h4>
      <table>
        <tbody>
          <tr><td>Score individual (promedio del índice de sus números)</td><td>{fmt(a.score_individual)}</td></tr>
          <tr><td>Score de pares</td><td>{fmt(a.score_pares)}</td></tr>
          <tr><td>Score de tríos</td><td>{fmt(a.score_trios)}</td></tr>
          <tr><td>Score estructural (par/impar, bajo/alto, décadas)</td><td>{fmt(a.score_estructural)}</td></tr>
          <tr><td>Score de distribución (suma + consecutivos)</td><td>{fmt(a.score_distribucion)}</td></tr>
        </tbody>
      </table>
      <h4 className="mt">Puntos aportados al score final</h4>
      <table><tbody>{Object.entries(a.desglose_puntos).map(([k, v]) => <tr key={k}><td style={{ textTransform: "capitalize" }}>{k}</td><td>{fmt(v, 2)}</td></tr>)}</tbody></table>
      <h4 className="mt">Estructura</h4>
      <p className="small">Impares/pares: {a.estructura.impares}/{6 - a.estructura.impares} · Bajos/altos: {a.estructura.bajos}/{6 - a.estructura.bajos} · Suma: {a.estructura.suma} · Pares consecutivos: {a.estructura.consecutivos}</p>
      <p className="small">Números compartidos con las otras 9 jugadas: {a.compartidos_con_otras.join(", ")}</p>
      <h4 className="mt">¿Por qué fue seleccionada?</h4>
      <ul className="small">{a.por_que.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <p className="sub small">Toque cualquier número para ver su score y sus datos históricos.</p>
    </div>
  );
}

export function SimpleTable({ cols, rows, onRow, max }) {
  return (
    <div className={`tbl-wrap ${max ? "scroll" : ""}`} style={max ? { maxHeight: max } : undefined}>
      <table>
        <thead><tr>{cols.map((c) => <th key={c.k} className={c.l ? "l" : ""}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={onRow ? "click" : ""} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.k} className={c.l ? "l" : ""}>{c.f ? c.f(r) : r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
