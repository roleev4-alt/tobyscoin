"""Datos de DEMOSTRACIÓN generados por una lotería justa simulada.

NO son resultados reales de Loto Honduras. Se marcan como sintéticos en la base
de datos y la interfaz lo advierte en todo momento. Sirven para explorar la
herramienta y como prueba de control: sobre datos justos, ninguna estrategia
debería mostrar ventaja frente al azar.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from .config import DEFAULT_PERIOD_END, DEFAULT_PERIOD_START, NUM_MAX, NUM_MIN, PICK
from .validation import Draw

SOURCE_LABEL = "DEMO SINTÉTICO (no son resultados reales)"


def synthetic_draws(start: date = DEFAULT_PERIOD_START, end: date = DEFAULT_PERIOD_END,
                    weekdays=(2, 5), seed: int = 7) -> list[Draw]:
    """Un sorteo cada miércoles y sábado (calendario supuesto, solo para la demo)."""
    rng = np.random.default_rng(seed)
    out, d = [], start
    while d <= end:
        if d.weekday() in weekdays:
            nums = tuple(sorted((rng.choice(NUM_MAX - NUM_MIN + 1, PICK, replace=False) + NUM_MIN).tolist()))
            out.append(Draw(d, nums))
        d += timedelta(days=1)
    return out
