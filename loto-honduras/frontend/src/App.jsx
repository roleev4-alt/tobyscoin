import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, fmtDate } from "./api.js";
import { ComboAudit, Ctx, Disclaimer, Modal, Notice, NumberAudit } from "./ui.jsx";
import Datos from "./views/Datos.jsx";
import Analisis from "./views/Analisis.jsx";
import Indices from "./views/Indices.jsx";
import Portafolio from "./views/Portafolio.jsx";
import Laboratorio from "./views/Laboratorio.jsx";
import Auditoria from "./views/Auditoria.jsx";

const TABS = [
  ["datos", "Datos históricos"],
  ["analisis", "Análisis"],
  ["indices", "Índices"],
  ["portafolio", "Portafolio"],
  ["laboratorio", "Laboratorio / Backtesting"],
  ["auditoria", "Auditoría y versiones"],
];

export default function App() {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("loto.tab") || "datos"; } catch { return "datos"; }
  });
  const [info, setInfo] = useState(null);
  const [draws, setDraws] = useState([]);
  const [periodo, setPeriodo] = useState({ inicio: "2025-07-01", fin: "2026-10-04" });
  const [config, setConfig] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [numbers, setNumbers] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [backtest, setBacktest] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");

  const refreshData = useCallback(async () => {
    const [i, d] = await Promise.all([api.get("/info"), api.get("/draws")]);
    setInfo(i);
    setDraws(d.sorteos);
    setConfig((c) => c || i.config_por_defecto);
    return i;
  }, []);

  useEffect(() => { refreshData().catch((e) => setError(e.message)); }, [refreshData]);
  useEffect(() => { try { localStorage.setItem("loto.tab", tab); } catch { /* sin almacenamiento */ } }, [tab]);

  const total = info?.datos?.total || 0;
  const loadAnalysis = useCallback(async () => {
    if (!config) return;
    try {
      setAnalysis(await api.post("/analysis", { periodo, config }));
      setError("");
    } catch (e) { setError(e.message); }
  }, [periodo, config]);

  const loadNumbers = useCallback(async () => {
    if (!config) return;
    try { setNumbers((await api.post("/numbers", { periodo, config })).numeros); } catch { setNumbers(null); }
  }, [periodo, config]);

  useEffect(() => { if (total) loadAnalysis(); else setAnalysis(null); }, [total, periodo, loadAnalysis]);
  useEffect(() => { if (total) loadNumbers(); }, [total, periodo, config?.weights, loadNumbers]);

  const ctx = useMemo(() => ({
    info, draws, periodo, setPeriodo, config, setConfig, analysis, numbers, portfolio, setPortfolio,
    backtest, setBacktest, refreshData, setTab,
    openNumber: (n) => setModal({ type: "n", n }),
    openCombo: (a) => setModal({ type: "c", a }),
  }), [info, draws, periodo, config, analysis, numbers, portfolio, backtest, refreshData]);

  const synthetic = info?.datos?.sinteticos > 0;
  const lastUpdate = info?.datos?.ultima_importacion;

  return (
    <Ctx.Provider value={ctx}>
      <header className="header">
        <div className="wrap">
          <div className="brand">
            <div className="logo">31</div>
            <div><div className="t1">LOTO HONDURAS</div><div className="t2">ANALIZADOR ESTADÍSTICO</div></div>
          </div>
          <div className="meta">
            <span>Período: <b>{fmtDate(periodo.inicio)} – {fmtDate(periodo.fin)}</b></span>
            <span>Cantidad de sorteos analizados: <b>{analysis ? analysis.sorteos : 0}</b></span>
            <span>Última actualización: <b>{lastUpdate ? fmtDate(lastUpdate) : "—"}</b></span>
          </div>
        </div>
        <nav className="wrap tabs">
          {TABS.map(([k, l], i) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              <span className="step">{i + 1}</span>{l}
            </button>
          ))}
        </nav>
      </header>
      <main className="wrap">
        {synthetic && (
          <div className="mt-s" style={{ marginBottom: 12 }}>
            <Notice kind="danger"><b>DATOS DE DEMOSTRACIÓN SINTÉTICOS.</b> Los sorteos cargados fueron simulados con una lotería justa y
              NO son resultados reales de Loto Honduras. Importe los resultados oficiales en la pestaña «Datos históricos».</Notice>
          </div>
        )}
        {error && <div style={{ marginBottom: 12 }}><Notice kind="danger"><b>Error: </b>{error}</Notice></div>}
        {!info ? <div className="loading">Cargando…</div> : (
          <>
            {tab === "datos" && <Datos />}
            {tab === "analisis" && <Analisis />}
            {tab === "indices" && <Indices />}
            {tab === "portafolio" && <Portafolio />}
            {tab === "laboratorio" && <Laboratorio />}
            {tab === "auditoria" && <Auditoria />}
          </>
        )}
      </main>
      <footer className="wrap">
        {info && <Disclaimer text={info.advertencia} />}
        <p className="mt-s">Modelo v{info?.version_modelo} · Herramienta estadística experimental. No predice resultados ni garantiza premios.</p>
      </footer>
      {modal && (
        <Modal onClose={() => setModal(null)}>
          {modal.type === "n" ? <NumberAudit n={modal.n} numbers={numbers} draws={draws} analysis={analysis} /> : <ComboAudit a={modal.a} />}
        </Modal>
      )}
    </Ctx.Provider>
  );
}
