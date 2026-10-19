"""Auditoría de equidad, índice de popularidad y prueba en vivo."""
from datetime import date, timedelta

import numpy as np
from fastapi.testclient import TestClient

from app.config import ModelConfig, MODEL_PRESETS
from app.engine import generate_portfolios, portfolio_hash
from app.fairness import audit
from app.main import app, store
from app.popularity import popularity
from app.synthetic import synthetic_draws
from app.validation import Draw

client = TestClient(app)


def test_fairness_on_fair_lottery_finds_no_bias():
    r = audit(synthetic_draws(seed=3), sims=400)
    assert r["valido"] and not r["hay_evidencia"]
    assert r["potencia"]["sorteos_para_detectar_20pct"] > 1000


def test_fairness_detects_strong_bias():
    rng = np.random.default_rng(1)
    p = np.ones(33); p[[0, 1, 2]] = 4.0  # 01, 02 y 03 muy cargados
    p /= p.sum()
    d0 = date(2025, 1, 1)
    draws = [Draw(d0 + timedelta(days=3 * i), tuple(sorted((rng.choice(33, 6, replace=False, p=p) + 1).tolist())))
             for i in range(300)]
    r = audit(draws, sims=400)
    assert r["hay_evidencia"]
    assert next(t for t in r["pruebas"] if t["clave"] == "uniformidad")["p_holm"] < 0.05


def test_popularity_ranks_obvious_patterns_higher():
    C = np.array([[1, 2, 3, 4, 5, 6], [5, 10, 15, 20, 25, 30], [13, 17, 22, 26, 29, 33]])
    pop, _ = popularity(C)
    assert pop[0] > pop[2] and pop[1] > pop[2]


def test_v10_unchanged_by_optional_weight():
    draws = synthetic_draws()
    a = generate_portfolios(draws, ModelConfig.from_dict({}))["portfolios"]["equilibrado"]["combos"]
    b = generate_portfolios(draws, ModelConfig.from_dict({"combo_weights": {"anti_popularidad": 0}}))["portfolios"]["equilibrado"]["combos"]
    assert portfolio_hash(a) == portfolio_hash(b)
    assert "anti_popularidad" not in ModelConfig.from_dict({}).combo_weights
    assert "anti_popularidad" in ModelConfig.from_dict(MODEL_PRESETS["v1.1"]["config"]).combo_weights


def test_live_freeze_evaluate_and_integrity():
    store.clear_draws()
    for e in store.live():
        store.delete_live(e["id"])
    draws = synthetic_draws()
    store.insert_draws(draws[:-1], "test")
    target = draws[-1].fecha.isoformat()
    r = client.post("/api/live/freeze", json={"fecha_sorteo": target, "version": "v1.0"})
    assert r.status_code == 200, r.text
    assert client.post("/api/live/freeze", json={"fecha_sorteo": target, "version": "v1.0"}).status_code == 409
    L = client.get("/api/live").json()
    assert L["registros"][0]["estado"] == "pendiente"
    store.insert_draws([draws[-1]], "test")  # llega el resultado
    L = client.get("/api/live").json()
    reg = L["registros"][0]
    assert reg["estado"] == "evaluado" and len(reg["aciertos"]) == 10
    assert L["resumen"]["v1.0"]["sorteos_evaluados"] == 1
    # No se puede congelar un sorteo ya jugado ni borrar uno evaluado.
    assert client.post("/api/live/freeze", json={"fecha_sorteo": target, "version": "v1.1"}).status_code == 409
    assert client.delete(f"/api/live/{reg['id']}").status_code == 409
    store.clear_draws()
