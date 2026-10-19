"""PRUEBA EN VIVO PRE-REGISTRADA (perspectiva del estadístico).

El backtesting reconstruye el pasado; la prueba en vivo es la evidencia más
fuerte posible: jugadas congeladas ANTES de cada sorteo real, evaluadas
después contra el resultado. El plan se fija de antemano (pre-registro) para
no poder "mover la meta" al ver los resultados:

  · Métrica principal: aciertos promedio por jugada del modelo v1.0.
  · Hipótesis nula:    igual al azar (36/33 ≈ 1.091).
  · Tamaño previsto:   100 sorteos (1,000 jugadas).
  · Prueba:            unilateral, α = 0.05, contra 5,000 portafolios aleatorios
                       evaluados sobre los mismos sorteos.
  · Regla de parada:   no se declara nada antes de completar los 100 sorteos;
                       los resultados parciales se muestran solo como avance.
"""
from __future__ import annotations

from datetime import date

import numpy as np
from scipy import stats as sps

from . import stats as st
from .backtest import monte_carlo
from .config import PICK, PORTFOLIO_SIZE
from .engine import make_rng
from .validation import Draw

EXPECTED = PICK * PICK / st.N
PLAN = {
    "version_principal": "v1.0",
    "metrica": "Aciertos promedio por jugada",
    "hipotesis_nula": f"Igual al azar ({EXPECTED:.3f} aciertos por jugada)",
    "sorteos_objetivo": 100,
    "alfa": 0.05,
    "prueba": "Unilateral contra 5,000 portafolios aleatorios evaluados sobre los mismos sorteos",
    "regla_de_parada": "No se declara ventaja ni fracaso antes de completar los sorteos objetivo.",
}


def line_variance() -> float:
    rv = sps.hypergeom(st.N, PICK, PICK)
    return float(rv.var())


def detectable_effect(n_draws: int, power: float = 0.80, alpha: float = 0.05) -> dict:
    """Mejora mínima (en aciertos por jugada) detectable con n sorteos × 10 jugadas."""
    se = np.sqrt(line_variance() / (PORTFOLIO_SIZE * max(n_draws, 1)))
    delta = (sps.norm.ppf(1 - alpha) + sps.norm.ppf(power)) * se
    return {"sorteos": n_draws, "mejora_minima": round(float(delta), 3),
            "promedio_minimo": round(EXPECTED + float(delta), 3),
            "mejora_relativa_pct": round(100 * float(delta) / EXPECTED, 1)}


def evaluate(entries: list[dict], draws: list[Draw], sims: int = 5000) -> dict:
    by_date = {d.fecha.isoformat(): d.numeros for d in draws}
    rows = []
    for e in entries:
        res = by_date.get(e["fecha_sorteo"])
        row = {k: e[k] for k in ("id", "creado", "fecha_sorteo", "version", "origen", "historial_hasta",
                                 "historial_n", "hash", "nota", "combos")}
        if res is None:
            row.update(estado="pendiente", resultado=None, aciertos=None)
        else:
            hits = [len(set(c) & set(res)) for c in e["combos"]]
            row.update(estado="evaluado", resultado=list(res), aciertos=hits, total=sum(hits),
                       promedio=round(float(np.mean(hits)), 3), mejor=max(hits))
        rows.append(row)

    resumen = {}
    for version in sorted({r["version"] for r in rows}):
        ev = [r for r in rows if r["version"] == version and r["estado"] == "evaluado"]
        n = len(ev)
        info = {"version": version, "sorteos_evaluados": n, "pendientes": sum(
            1 for r in rows if r["version"] == version and r["estado"] == "pendiente")}
        if n:
            H = np.array([r["aciertos"] for r in ev])
            mean = float(H.mean())
            test_draws = [Draw(date.fromisoformat(r["fecha_sorteo"]), tuple(r["resultado"])) for r in ev]
            mc = monte_carlo(test_draws, sims, make_rng(777, None, n))["hits"].mean(axis=(1, 2))
            p = float((1 + (mc >= mean - 1e-12).sum()) / (1 + sims))
            se = float(H.mean(axis=1).std(ddof=1) / np.sqrt(n)) if n > 1 else None
            info.update({
                "jugadas": int(H.size), "aciertos_totales": int(H.sum()),
                "promedio": round(mean, 3), "esperado_azar": round(EXPECTED, 3),
                "diferencia": round(mean - EXPECTED, 3),
                "ic95": [round(mean - 1.96 * se, 3), round(mean + 1.96 * se, 3)] if se else None,
                "p_valor": round(p, 4),
                "percentil_vs_azar": round(float((mc < mean).mean() * 100), 1),
                "distribucion": {str(k): int((H == k).sum()) for k in range(PICK + 1)},
                "sorteos_con_3_o_mas": int((H.max(axis=1) >= 3).sum()),
                "esperado_sorteos_con_3_o_mas": round(n * (1 - (1 - sum(
                    sps.hypergeom(st.N, PICK, PICK).pmf(k) for k in range(3, PICK + 1))) ** PORTFOLIO_SIZE), 1),
                "mejor_resultado": int(H.max()),
                "avance_pct": round(100 * n / PLAN["sorteos_objetivo"], 1),
                "evolucion": [{"fecha": r["fecha_sorteo"], "promedio_acumulado": round(float(H[:i + 1].mean()), 3)}
                              for i, r in enumerate(ev)],
            })
            if n < PLAN["sorteos_objetivo"]:
                info["lectura"] = (f"Avance {n} de {PLAN['sorteos_objetivo']} sorteos. Según el plan pre-registrado, "
                                   "todavía no se puede concluir nada; el resultado parcial es solo informativo.")
            elif p < PLAN["alfa"]:
                info["lectura"] = ("Plan completado: el modelo superó al azar con significancia estadística. "
                                   "Conviene replicar con un nuevo bloque de sorteos antes de darlo por confirmado.")
            else:
                info["lectura"] = "Plan completado: el modelo NO superó al azar de forma significativa."
        resumen[version] = info
    return {"plan": PLAN, "potencia": [detectable_effect(k) for k in (25, 50, 100, 200, 500)],
            "registros": rows, "resumen": resumen}
