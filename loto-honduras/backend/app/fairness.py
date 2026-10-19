"""AUDITORÍA DE EQUIDAD DEL SORTEO (perspectiva del auditor de juegos / ingeniero).

La única forma conocida de obtener ventaja real en una lotería es que el sorteo
NO sea justo: bolas o máquinas con sesgo físico, o un generador defectuoso.
Este módulo prueba formalmente esa hipótesis con los resultados históricos:

  1. Uniformidad      ¿algunos números salen más que otros?              (χ² de bondad de ajuste)
  2. Estabilidad      ¿los números frecuentes en la 1.ª mitad lo siguen   (correlación de Spearman
                      siendo en la 2.ª? Un sesgo físico real persiste;    entre mitades, permutación)
                      el azar no.
  3. Memoria          ¿sorteos consecutivos comparten más números de lo   (solapamiento lag-1 y lag-2,
                      normal?                                            permutación)
  4. Pares            ¿hay pares que salen juntos más de lo esperable?   (dispersión de conteos de
                                                                         pares vs. simulación justa)
  5. Estructura       par/impar y bajo/alto vs. distribución exacta      (χ²)

Se corrige por comparaciones múltiples (Holm) y se informa la potencia: qué tan
grande tendría que ser un sesgo para poder detectarlo con los sorteos disponibles.
"""
from __future__ import annotations

import numpy as np
from scipy import stats as sps

from . import stats as st
from .config import PICK
from .validation import Draw

N = st.N
P = PICK / N


def _perm_p(observed: float, null: np.ndarray, greater: bool = True) -> float:
    if greater:
        return float((1 + (null >= observed - 1e-12).sum()) / (1 + len(null)))
    return float((1 + (null <= observed + 1e-12).sum()) / (1 + len(null)))


def _holm(pvals: dict) -> dict:
    items = sorted(pvals.items(), key=lambda kv: kv[1])
    m, out, run = len(items), {}, 0.0
    for i, (k, p) in enumerate(items):
        run = max(run, min(1.0, (m - i) * p))
        out[k] = run
    return out


def _fair_matrix(rng: np.random.Generator, n: int) -> np.ndarray:
    keys = rng.random((n, N))
    pick = np.argpartition(keys, PICK, axis=1)[:, :PICK]
    X = np.zeros((n, N), dtype=np.int8)
    X[np.arange(n)[:, None], pick] = 1
    return X


def detectable_bias(n_draws: int, alpha: float = 0.05, power: float = 0.80) -> dict:
    """Sesgo mínimo detectable en UN número (corrigiendo por mirar los N números)."""
    if n_draws <= 0:
        return {}
    z_a = sps.norm.ppf(1 - alpha / (2 * N))
    z_b = sps.norm.ppf(power)
    delta = (z_a + z_b) * np.sqrt(P * (1 - P) / n_draws)
    return {"prob_base_pct": round(100 * P, 2), "minimo_detectable_pct": round(100 * (P + delta), 2),
            "aumento_relativo_pct": round(100 * delta / P, 1),
            "sorteos_para_detectar_10pct": int(np.ceil(((z_a + z_b) / (0.10 * P)) ** 2 * P * (1 - P))),
            "sorteos_para_detectar_20pct": int(np.ceil(((z_a + z_b) / (0.20 * P)) ** 2 * P * (1 - P)))}


def audit(draws: list[Draw], sims: int = 2000, seed: int = 12345) -> dict:
    n = len(draws)
    if n < 30:
        return {"sorteos": n, "valido": False, "mensaje": "Se necesitan al menos 30 sorteos para la auditoría."}
    rng = np.random.default_rng(seed)
    X = st.to_matrix(draws).astype(np.int32)
    C = st.combos_array(draws)
    tests, pvals = [], {}

    # 1. Uniformidad
    counts = X.sum(axis=0)
    exp = n * P
    chi2 = float(((counts - exp) ** 2 / exp).sum())
    p1 = float(sps.chi2.sf(chi2, N - 1))
    tests.append({"clave": "uniformidad", "prueba": "Uniformidad de frecuencias (χ²)",
                  "pregunta": "¿Algunos números salen más que otros?",
                  "estadistico": round(chi2, 2), "p": p1,
                  "detalle": f"Más frecuente: {int(st.NUMS[counts.argmax()]):02d} ({int(counts.max())} veces); "
                             f"menos frecuente: {int(st.NUMS[counts.argmin()]):02d} ({int(counts.min())}); esperado {exp:.1f}."})
    pvals["uniformidad"] = p1

    # 2. Estabilidad entre mitades (un sesgo real persiste en el tiempo)
    h = n // 2
    f1, f2 = X[:h].sum(axis=0), X[h:].sum(axis=0)
    rho = float(sps.spearmanr(f1, f2).correlation)
    null = np.empty(sims)
    for i in range(sims):
        Y = _fair_matrix(rng, n)
        null[i] = sps.spearmanr(Y[:h].sum(axis=0), Y[h:].sum(axis=0)).correlation
    p2 = _perm_p(rho, null)
    tests.append({"clave": "estabilidad", "prueba": "Estabilidad entre mitades (Spearman)",
                  "pregunta": "¿Los números frecuentes en la primera mitad siguen siéndolo en la segunda?",
                  "estadistico": round(rho, 3), "p": p2,
                  "detalle": "Correlación cercana a 0 = las frecuencias cambian al azar; positiva y significativa = posible sesgo persistente."})
    pvals["estabilidad"] = p2

    # 3. Memoria entre sorteos consecutivos
    for lag in (1, 2):
        ov = float((X[lag:] * X[:-lag]).sum(axis=1).mean())
        null = np.empty(sims)
        for i in range(sims):
            Y = X[rng.permutation(n)]
            null[i] = (Y[lag:] * Y[:-lag]).sum(axis=1).mean()
        p3 = float(min(1.0, 2 * min(_perm_p(ov, null), _perm_p(ov, null, greater=False))))
        tests.append({"clave": f"memoria_{lag}", "prueba": f"Memoria entre sorteos (separación {lag})",
                      "pregunta": f"¿Un sorteo comparte más números de lo normal con el de {lag} sorteo(s) atrás?",
                      "estadistico": round(ov, 3), "p": p3,
                      "detalle": f"Números compartidos en promedio: {ov:.3f} (azar: {PICK * PICK / N:.3f})."})
        pvals[f"memoria_{lag}"] = p3

    # 4. Dispersión de pares
    PM = X.T @ X
    iu = np.triu_indices(N, 1)
    disp = float(PM[iu].var())
    null = np.empty(sims // 2)
    for i in range(len(null)):
        Y = _fair_matrix(rng, n)
        null[i] = (Y.T @ Y)[iu].var()
    p4 = _perm_p(disp, null)
    tests.append({"clave": "pares", "prueba": "Dispersión de pares",
                  "pregunta": "¿Hay pares de números que salen juntos más de lo que el azar explica?",
                  "estadistico": round(disp, 3), "p": p4,
                  "detalle": f"Varianza de los conteos de pares: {disp:.3f} (azar: {null.mean():.3f})."})
    pvals["pares"] = p4

    # 5. Estructura
    th = st.theoretical()
    for key, vals, label in (("impares", st.odd_count(C), "Par / impar"), ("bajos", st.low_count(C), "Bajo / alto")):
        r = st._chi_vs_theory(vals, th[key])
        if r.get("p") is not None:
            tests.append({"clave": key, "prueba": f"Estructura {label} (χ²)",
                          "pregunta": f"¿La proporción {label.lower()} difiere de la teórica?",
                          "estadistico": r["chi2"], "p": float(r["p"]), "detalle": ""})
            pvals[key] = float(r["p"])

    adj = _holm(pvals)
    for t in tests:
        t["p"] = round(t["p"], 4)
        t["p_holm"] = round(adj[t["clave"]], 4)
        t["resultado"] = ("Evidencia de sesgo" if t["p_holm"] < 0.05 else
                          "Indicio (no significativo tras corrección)" if t["p"] < 0.05 else "Compatible con azar")
    flagged = [t for t in tests if t["p_holm"] < 0.05]
    hints = [t for t in tests if t["p"] < 0.05 and t["p_holm"] >= 0.05]
    if flagged:
        verdict = ("Se detectó al menos una desviación significativa: " + ", ".join(t["prueba"] for t in flagged) +
                   ". Antes de concluir que hay sesgo, debe confirmarse con sorteos nuevos (no usados en esta prueba) "
                   "y descartarse errores de transcripción.")
    elif hints:
        verdict = ("Hay indicios aislados (" + ", ".join(t["prueba"] for t in hints) + ") que no resisten la "
                   "corrección por comparaciones múltiples. Los resultados son compatibles con un sorteo justo.")
    else:
        verdict = "Ninguna prueba detecta sesgo. Los resultados son compatibles con un sorteo justo."
    return {"sorteos": n, "valido": True, "pruebas": tests, "veredicto": verdict,
            "hay_evidencia": bool(flagged), "potencia": detectable_bias(n),
            "nota": ("No detectar sesgo no prueba que no exista: con pocos sorteos solo se detectan sesgos grandes. "
                     "La sección de potencia indica el tamaño mínimo detectable.")}
