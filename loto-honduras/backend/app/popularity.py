"""ÍNDICE DE POPULARIDAD (perspectiva del actuario / economista del comportamiento).

Ninguna combinación tiene más probabilidad de salir que otra. Lo que SÍ cambia
es cuántas personas jugaron la misma combinación: si el premio mayor se reparte
entre los ganadores, ganar con una combinación "popular" significa cobrar menos.

No existen datos públicos de qué combinaciones juegan los hondureños, así que
el índice se basa en sesgos documentados en estudios de loterías de otros países:
  · fechas de cumpleaños y meses (números bajos, ≤ 12 y ≤ 31)
  · secuencias consecutivas y progresiones aritméticas (05-10-15-20…)
  · múltiplos "redondos" (de 5 o de 7) y el número de la suerte 07
  · repetir combinaciones ganadoras recientes
  · agrupar todo en una misma década

Es una heurística transparente: cada componente se muestra por separado.
Evitar combinaciones populares NO aumenta la probabilidad de ganar; solo
mejora el reparto esperado SI se gana un premio compartido.
"""
from __future__ import annotations

import numpy as np

from . import stats as st

COMPONENT_WEIGHTS = {
    "cumpleanos": 0.25,
    "secuencias": 0.20,
    "progresion": 0.15,
    "redondos": 0.10,
    "ganadores_recientes": 0.20,
    "agrupamiento": 0.10,
}
LABELS = {
    "cumpleanos": "Números de fechas (≤12 y ≤31)",
    "secuencias": "Secuencias consecutivas",
    "progresion": "Progresión aritmética",
    "redondos": "Múltiplos de 5/7 y el 07",
    "ganadores_recientes": "Parecido a ganadores recientes",
    "agrupamiento": "Todo en pocas décadas",
}


def _longest_run(row: np.ndarray) -> int:
    best = cur = 1
    for a, b in zip(row[:-1], row[1:]):
        cur = cur + 1 if b - a == 1 else 1
        best = max(best, cur)
    return best


def _longest_ap(row: np.ndarray) -> int:
    """Mayor cantidad de números en progresión aritmética (paso ≥ 2)."""
    s = set(int(x) for x in row)
    best = 2
    vals = sorted(s)
    for i, a in enumerate(vals):
        for b in vals[i + 1:]:
            d = b - a
            if d < 2:
                continue
            k, nxt = 2, b + d
            while nxt in s:
                k, nxt = k + 1, nxt + d
            best = max(best, k)
    return best


def components(C: np.ndarray, recent: np.ndarray | None = None) -> dict:
    """C: K×6 ordenado. Devuelve cada componente en [0,1] (1 = muy popular)."""
    C = np.asarray(C, dtype=int)
    k = len(C)
    le12 = (C <= 12).sum(axis=1)
    le31 = (C <= 31).sum(axis=1)
    cumple = np.clip((le12 - 2) / 4, 0, 1) * 0.6 + (le31 == 6) * 0.4
    runs = np.array([_longest_run(r) for r in C])
    secuencias = np.clip((runs - 2) / 3, 0, 1)
    aps = np.array([_longest_ap(r) for r in C])
    progresion = np.clip((aps - 3) / 3, 0, 1)
    mult = ((C % 5 == 0) | (C % 7 == 0)).sum(axis=1)
    redondos = np.clip((mult - 2) / 3, 0, 1) * 0.8 + (C == 7).any(axis=1) * 0.2
    if recent is not None and len(recent):
        R = np.zeros((len(recent), st.N + 1), dtype=np.int8)
        R[np.arange(len(recent))[:, None], np.asarray(recent, dtype=int)] = 1
        B = np.zeros((k, st.N + 1), dtype=np.int8)
        B[np.arange(k)[:, None], C] = 1
        shared = (B.astype(np.int32) @ R.T.astype(np.int32)).max(axis=1)
        ganadores = np.clip((shared - 2) / 3, 0, 1)
    else:
        ganadores = np.zeros(k)
    dec = st.decade_code(C)
    used = (dec // 100 > 0).astype(int) + ((dec // 10) % 10 > 0).astype(int) + (dec % 10 > 0).astype(int)
    agrupamiento = (used == 1) * 1.0 + (used == 2) * 0.3
    return {"cumpleanos": cumple, "secuencias": secuencias, "progresion": progresion,
            "redondos": redondos, "ganadores_recientes": ganadores, "agrupamiento": agrupamiento}


def popularity(C: np.ndarray, recent: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    comp = components(C, recent)
    weighted = sum(comp[c] * w for c, w in COMPONENT_WEIGHTS.items())
    strongest = np.max(np.vstack([comp[c] for c in COMPONENT_WEIGHTS]), axis=0)
    # Un solo rasgo muy marcado (p. ej. 01-02-03-04-05-06) basta para que una combinación sea popular.
    return np.clip(0.6 * weighted + 0.4 * strongest, 0, 1), comp


def explain(combo, recent=None) -> dict:
    pop, comp = popularity(np.array([combo]), recent)
    return {"popularidad": round(float(pop[0]) * 100, 1),
            "componentes": [{"clave": c, "etiqueta": LABELS[c], "valor": round(float(comp[c][0]), 2),
                             "peso": w} for c, w in COMPONENT_WEIGHTS.items()]}
