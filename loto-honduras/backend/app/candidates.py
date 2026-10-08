"""CANDIDATE GENERATION.

Diez estrategias generan combinaciones candidatas por muestreo ponderado
(sin reemplazo) más filtros estructurales. Las estrategias SOLO generan; la
evaluación contra resultados reales vive en `backtest.py`.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import stats as st
from .config import PICK, STRATEGIES
from .scoring import HistoryModel

N = st.N


@dataclass
class CandidatePool:
    combos: np.ndarray            # K×6 ordenadas (int16)
    strategy: np.ndarray          # K (índice 0..9)
    score: np.ndarray             # K, 0..100
    parts: dict                   # parte -> K
    log: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.combos)


def _sample(rng: np.random.Generator, p: np.ndarray, k: int, size: int = PICK) -> np.ndarray:
    """k combinaciones de `size` números sin reemplazo con probabilidad ∝ p (truco de Gumbel)."""
    p = np.clip(np.asarray(p, float), 1e-9, None)
    keys = np.log(p)[None, :] + rng.gumbel(size=(k, N))
    pick = np.argpartition(-keys, size, axis=1)[:, :size]
    return np.sort(pick + st.NUM_MIN, axis=1).astype(np.int16)


def _pair_walk(rng, m: HistoryModel, k: int) -> np.ndarray:
    """Estrategia 4: cada número siguiente se elige ∝ fuerza de pares con los ya elegidos."""
    start_p = 0.05 + m.comp[:, 3]
    out = np.zeros((k, PICK), dtype=np.int16)
    chosen = np.zeros((k, N), dtype=bool)
    first = rng.choice(N, size=k, p=start_p / start_p.sum())
    chosen[np.arange(k), first] = True
    out[:, 0] = first
    S = m.pair_strength + 0.05
    for step in range(1, PICK):
        aff = chosen.astype(float) @ S  # afinidad acumulada con lo ya elegido
        aff = aff * (0.5 + m.index / 100.0)[None, :]
        aff[chosen] = 0.0
        aff = aff / aff.sum(axis=1, keepdims=True)
        cum = aff.cumsum(axis=1)
        r = rng.random(k)[:, None]
        nxt = np.minimum((cum < r).sum(axis=1), N - 1)
        chosen[np.arange(k), nxt] = True
        out[:, step] = nxt
    return np.sort(out + st.NUM_MIN, axis=1).astype(np.int16)


def _diversifying(rng, p, k, decay=0.08, batch=25) -> np.ndarray:
    """Estrategia 5: reduce el peso de números ya usados para minimizar coincidencias."""
    usage = np.zeros(N)
    parts = []
    for _ in range(int(np.ceil(k / batch))):
        q = p * np.exp(-decay * usage)
        b = _sample(rng, q, batch)
        usage += np.bincount((b - st.NUM_MIN).ravel(), minlength=N)
        parts.append(b)
    return np.vstack(parts)[:k]


def _freq_plus_absence(rng, m: HistoryModel, k: int) -> np.ndarray:
    """Estrategia 8: 4 números de alta frecuencia + 2 de ausencia prolongada.
    La ausencia NO se interpreta como mayor probabilidad futura: solo diversifica."""
    hist = 0.05 + m.comp[:, 0] ** 2
    gap_rank = np.argsort(np.argsort(m.gaps))  # 0 = más reciente
    absence = 0.05 + (gap_rank / (N - 1)) ** 3
    a = _sample(rng, hist, k, size=4)
    mask = np.ones((k, N), bool)
    mask[np.arange(k)[:, None], a - st.NUM_MIN] = False
    keys = np.where(mask, np.log(absence)[None, :] + rng.gumbel(size=(k, N)), -np.inf)
    b = np.argpartition(-keys, 2, axis=1)[:, :2] + st.NUM_MIN
    return np.sort(np.hstack([a, b]), axis=1).astype(np.int16)


def _filter(C: np.ndarray, mask: np.ndarray, log: dict, name: str) -> np.ndarray:
    log["descartados_estructura"] = log.get("descartados_estructura", 0) + int((~mask).sum())
    log.setdefault("por_estrategia_estructura", {})[name] = int((~mask).sum())
    return C[mask]


def generate(m: HistoryModel, rng: np.random.Generator) -> CandidatePool:
    total = m.cfg.n_candidates
    per = int(np.ceil(total / len(STRATEGIES)))
    idx = m.index / 100.0
    comp = m.comp
    log: dict = {"generados": 0, "descartados_estructura": 0}
    blocks, labels = [], []

    def add(s_i, C):
        blocks.append(C)
        labels.append(np.full(len(C), s_i, dtype=np.int8))

    def structured(p, cond, name, s_i, oversample=3):
        C = _sample(rng, p, per * oversample)
        log["generados"] += len(C)
        C = _filter(C, cond(C), log, name)[:per]
        add(s_i, C)

    def plain(C, s_i):
        log["generados"] += len(C)
        add(s_i, C)

    plain(_sample(rng, (0.05 + comp[:, 0]) ** 2, per), 0)                          # S01
    plain(_sample(rng, (0.05 + 0.6 * comp[:, 1] + 0.4 * comp[:, 2]) ** 2, per), 1)  # S02
    plain(_sample(rng, 0.05 + idx, per), 2)                                          # S03
    plain(_pair_walk(rng, m, per), 3)                                                # S04
    plain(_diversifying(rng, 0.1 + idx, per), 4)                                     # S05
    structured(0.05 + idx, lambda C: np.isin(st.odd_count(C), m.top_odd), "S06", 5)  # S06
    structured(0.05 + idx, lambda C: np.isin(st.low_count(C), m.top_low), "S07", 6)  # S07
    plain(_freq_plus_absence(rng, m, per), 7)                                         # S08
    lo, hi = m.sum_iqr
    structured(0.05 + idx, lambda C: (np.isin(st.odd_count(C), m.top_odd) & np.isin(st.low_count(C), m.top_low)
                                      & (st.combo_sum(C) >= lo) & (st.combo_sum(C) <= hi)
                                      & (st.consecutive_count(C) <= 1)), "S09", 8, oversample=8)
    plain(_sample(rng, np.sqrt(0.05 + idx), per), 9)                                  # S10

    C = np.vstack(blocks)
    S = np.concatenate(labels)
    # Duplicados: se conserva la primera aparición (estrategia de menor índice).
    _, first = np.unique(C, axis=0, return_index=True)
    first = np.sort(first)
    log["duplicados"] = int(len(C) - len(first))
    C, S = C[first], S[first]
    score, parts = m.combo_scores(C)
    # Descarte por score: por debajo del cuantil configurado dentro de cada estrategia
    # (así ninguna estrategia queda excluida solo por tener números de menor índice).
    keep = np.zeros(len(C), bool)
    for s_i in range(len(STRATEGIES)):
        sel = S == s_i
        if sel.any():
            thr = np.quantile(score[sel], m.cfg.min_score_quantile)
            keep |= sel & (score >= thr)
    log["descartados_score"] = int((~keep).sum())
    C, S, score = C[keep], S[keep], score[keep]
    parts = {k: v[keep] for k, v in parts.items()}
    log["candidatos_finales"] = int(len(C))
    log["por_estrategia"] = {STRATEGIES[i][1]: int((S == i).sum()) for i in range(len(STRATEGIES))}
    return CandidatePool(C, S, score, parts, log)
