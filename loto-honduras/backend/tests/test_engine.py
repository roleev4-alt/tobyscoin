from dataclasses import replace
from datetime import date

import numpy as np

from app import stats as st
from app.backtest import conclude, integrity_checks, monte_carlo, run_backtest, INVALID_MSG
from app.config import ModelConfig
from app.engine import generate_portfolios, portfolio_hash, portfolio_report
from app.scoring import HistoryModel
from app.synthetic import synthetic_draws
from app.validation import Draw

DRAWS = synthetic_draws()
CFG = ModelConfig(n_candidates=1500)


def _valid_portfolio(C):
    assert C.shape == (10, 6)
    assert len({tuple(r) for r in C.tolist()}) == 10
    for r in C.tolist():
        assert r == sorted(r) and len(set(r)) == 6 and 1 <= r[0] and r[-1] <= 31


def test_portfolios_are_valid_and_modes_differ():
    res = generate_portfolios(DRAWS, CFG)
    for mode, p in res["portfolios"].items():
        _valid_portfolio(p["combos"])
    rep_c = portfolio_report(res, "concentrado", CFG.seed)["resumen"]
    rep_d = portfolio_report(res, "diversificado", CFG.seed)["resumen"]
    assert rep_d["diversidad"]["indice"] > rep_c["diversidad"]["indice"]
    assert rep_c["score_estadistico"] >= rep_d["score_estadistico"]


def test_number_breakdown_sums_to_score():
    m = HistoryModel(DRAWS, CFG)
    for row in m.number_table():
        assert abs(sum(p["puntos"] for p in row["desglose"]) - row["score"]) < 0.2
        assert 0 <= row["score"] <= 100


def test_reproducible_with_seed():
    a = generate_portfolios(DRAWS, CFG)["portfolios"]["equilibrado"]["combos"]
    b = generate_portfolios(DRAWS, CFG)["portfolios"]["equilibrado"]["combos"]
    c = generate_portfolios(DRAWS, replace(CFG, seed=CFG.seed + 1))["portfolios"]["equilibrado"]["combos"]
    assert portfolio_hash(a) == portfolio_hash(b)
    assert portfolio_hash(a) != portfolio_hash(c)


def test_future_draws_do_not_affect_past_portfolio():
    """Canario de data leakage: alterar sorteos futuros no cambia la jugada de una fecha pasada."""
    cut = 60
    target = DRAWS[cut].fecha
    altered = DRAWS[:cut] + [Draw(d.fecha, (1, 2, 3, 4, 5, 6)) for d in DRAWS[cut:]]
    h1 = generate_portfolios(DRAWS[:cut], CFG, context=target)["portfolios"]["equilibrado"]["combos"]
    h2 = generate_portfolios(altered[:cut], CFG, context=target)["portfolios"]["equilibrado"]["combos"]
    assert portfolio_hash(h1) == portfolio_hash(h2)


def test_monte_carlo_shapes():
    mc = monte_carlo(DRAWS[:5], 200, np.random.default_rng(1))["hits"]
    assert mc.shape == (200, 5, 10) and mc.min() >= 0 and mc.max() <= 6
    # Media cercana a la esperanza hipergeométrica 36/31.
    assert abs(mc.mean() - 36 / 31) < 0.05


def test_theoretical_distributions():
    th = st.theoretical()
    assert th["total_combinaciones"] == 736281
    assert abs(sum(th["impares"].values()) - 1) < 1e-9
    assert abs(sum(st.hits_pmf().values()) - 1) < 1e-9


def test_backtest_on_fair_data_is_valid_and_finds_no_edge():
    res = run_backtest(DRAWS, CFG, date(2026, 4, 30), mc_sims=300, weight_trials=40)
    assert res["valido"], res["integridad"]
    assert all(c["ok"] for c in res["integridad"])
    assert res["conclusion"]["veredicto"] in ("sin_ventaja", "diferencia_nominal")
    for f in res["folds"]:
        assert f["pesos_datos_hasta"] < f["prueba"][0]


def test_integrity_detects_contamination():
    good = run_backtest(DRAWS, CFG, date(2026, 8, 31), mc_sims=100, weight_trials=10, optimize=False)
    assert good["valido"]
    # Simulamos un sorteo sellado que "vio" su propio resultado.
    from app.engine import random_portfolio, make_rng
    d = DRAWS[-1]
    C = np.array(sorted({tuple(sorted(np.random.default_rng(i).choice(31, 6, replace=False) + 1)) for i in range(10)}))
    sealed = [{"fecha": d.fecha, "fold": 1, "historial_n": len(DRAWS), "historial_hasta": d.fecha,
               "pesos_hasta": DRAWS[-2].fecha, "portafolios": {"equilibrado": C}, "aleatorio": random_portfolio(make_rng(1, d.fecha, 7)),
               "seq": 0, "hashes": {}}]
    folds = [{"fold": 1, "pesos_datos_hasta": DRAWS[-2].fecha.isoformat(), "prueba": [d.fecha.isoformat(), d.fecha.isoformat()],
              "pesos": CFG.weights}]
    checks = integrity_checks(sealed, folds, [d], 1, True, DRAWS, CFG, True)
    assert not checks[0]["ok"]
    assert conclude({}, [], False, 1, {}, {})["texto"] == INVALID_MSG
