"""Configuración central del modelo.

Todos los parámetros que afectan un resultado viven aquí y se serializan
completos en cada experimento, para que cualquier análisis pueda
reproducirse con la misma configuración y el mismo random seed.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
import hashlib
import json

MODEL_VERSION = "1.0.0"

NUM_MIN = 1
NUM_MAX = 31
PICK = 6
PORTFOLIO_SIZE = 10

DEFAULT_PERIOD_START = date(2025, 7, 1)
DEFAULT_PERIOD_END = date(2026, 10, 4)

# Componentes del índice de selección histórica (sección 9). Suman 100.
COMPONENTS = ["historica", "reciente", "tendencia", "pares", "trios", "recencia", "estructura"]
DEFAULT_WEIGHTS = {
    "historica": 25.0,
    "reciente": 20.0,
    "tendencia": 15.0,
    "pares": 15.0,
    "trios": 5.0,
    "recencia": 10.0,
    "estructura": 10.0,
}

# Penalización por números compartidos entre dos combinaciones (sección 14).
# Índice = cantidad de números compartidos. None = descartar.
DEFAULT_OVERLAP_PENALTY = [0.0, 0.5, 2.0, 6.0, 15.0, 40.0, None]

# Score de cada combinación (sección 10). Suman 100.
DEFAULT_COMBO_WEIGHTS = {
    "individual": 35.0,
    "pares": 20.0,
    "trios": 5.0,
    "estructura": 20.0,
    "suma": 10.0,
    "consecutivos": 10.0,
}

# Modos del portafolio (secciones 16-17): lambda = peso de la diversidad.
MODES = {
    "concentrado": {"lambda_div": 0.35, "concentration_cap": 5},
    "equilibrado": {"lambda_div": 1.0, "concentration_cap": 4},
    "diversificado": {"lambda_div": 3.0, "concentration_cap": 3},
}

STRATEGIES = [
    ("S01", "Tendencia histórica"),
    ("S02", "Tendencia reciente"),
    ("S03", "Equilibrada"),
    ("S04", "Pares fuertes"),
    ("S05", "Diversificación"),
    ("S06", "Balance par/impar"),
    ("S07", "Balance bajo/alto"),
    ("S08", "Frecuencia + ausencia"),
    ("S09", "Modelo mixto"),
    ("S10", "Portafolio diversificado"),
]

RECENT_WINDOWS = [10, 20, 50, 100]

DISCLAIMER = (
    "Los sorteos de una lotería justa son eventos independientes. Los resultados "
    "anteriores no cambian la probabilidad matemática de las combinaciones futuras. "
    "Esta herramienta utiliza datos históricos para construir selecciones de manera "
    "estructurada y analizar su comportamiento histórico, no para garantizar resultados."
)


@dataclass
class ModelConfig:
    weights: dict = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    combo_weights: dict = field(default_factory=lambda: dict(DEFAULT_COMBO_WEIGHTS))
    overlap_penalty: list = field(default_factory=lambda: list(DEFAULT_OVERLAP_PENALTY))
    n_candidates: int = 3000
    mode: str = "equilibrado"
    seed: int = 20251001
    recent_window: int = 20
    trend_short: int = 10
    trend_long: int = 50
    min_trio_count: int = 2
    min_score_quantile: float = 0.25  # candidatos bajo este cuantil se descartan
    model_version: str = MODEL_VERSION

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> "ModelConfig":
        cfg = cls()
        for k, v in (d or {}).items():
            if hasattr(cfg, k) and v is not None:
                setattr(cfg, k, v)
        cfg.weights = normalize_weights(cfg.weights, COMPONENTS)
        cfg.combo_weights = normalize_weights(cfg.combo_weights, list(DEFAULT_COMBO_WEIGHTS))
        if cfg.mode not in MODES:
            raise ValueError(f"Modo desconocido: {cfg.mode}")
        if len(cfg.overlap_penalty) != PICK + 1:
            raise ValueError("overlap_penalty debe tener 7 valores (0..6 compartidos)")
        cfg.n_candidates = int(min(max(cfg.n_candidates, 1000), 10000))
        return cfg

    def fingerprint(self) -> str:
        return hashlib.sha256(json.dumps(self.to_dict(), sort_keys=True).encode()).hexdigest()[:16]


def normalize_weights(w: dict, keys: list[str]) -> dict:
    vals = {k: max(float(w.get(k, 0.0)), 0.0) for k in keys}
    total = sum(vals.values())
    if total <= 0:
        raise ValueError("Los pesos deben sumar más de 0")
    return {k: round(100.0 * v / total, 6) for k, v in vals.items()}
