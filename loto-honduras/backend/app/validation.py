"""DATA → VALIDATION.

Convierte filas crudas (CSV, Excel, captura manual, fuente remota) en sorteos
validados. Nunca corrige ni completa datos en silencio: cada fila rechazada
queda registrada con el motivo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
import io
import re

import pandas as pd

from .config import NUM_MAX, NUM_MIN, PICK


@dataclass
class Draw:
    fecha: date
    numeros: tuple[int, ...]  # ordenados

    def key(self) -> str:
        return self.fecha.isoformat()


@dataclass
class ValidationReport:
    total_rows: int = 0
    valid: list[Draw] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)

    def summary(self) -> dict:
        kinds: dict[str, int] = {}
        for e in self.errors:
            kinds[e["tipo"]] = kinds.get(e["tipo"], 0) + 1
        return {
            "filas_leidas": self.total_rows,
            "sorteos_validos": len(self.valid),
            "filas_rechazadas": len(self.errors),
            "errores_por_tipo": kinds,
            "errores": self.errors[:200],
            "advertencias": self.warnings[:200],
        }


DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y", "%m/%d/%Y"]


def parse_date(value) -> date | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.date()
    s = str(value).strip()
    if not s:
        return None
    s = s.split(" ")[0] if re.match(r"^\d{4}-\d{2}-\d{2} ", s) else s
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_int(value) -> int | None:
    if value is None:
        return None
    if isinstance(value, float):
        if pd.isna(value) or not value.is_integer():
            return None
        return int(value)
    if isinstance(value, int):
        return value
    s = str(value).strip()
    if not re.fullmatch(r"\d{1,2}", s):
        return None
    return int(s)


def validate_rows(rows: list[dict | list], source_label: str = "") -> ValidationReport:
    """Cada fila: {'fecha': ..., 'numeros': [...]} o lista [fecha, n1..n6]."""
    rep = ValidationReport(total_rows=len(rows))
    seen_dates: dict[str, int] = {}
    seen_combos: dict[tuple, str] = {}
    for i, row in enumerate(rows, start=1):
        if isinstance(row, dict):
            raw_date = row.get("fecha")
            raw_nums = list(row.get("numeros") or [])
        else:
            raw_date, raw_nums = (row[0] if row else None), list(row[1:])
        raw_nums = [n for n in raw_nums if not (n is None or (isinstance(n, float) and pd.isna(n)) or str(n).strip() == "")]
        ctx = {"fila": i, "fuente": source_label, "valor": f"{raw_date} | {raw_nums}"}

        d = parse_date(raw_date)
        if raw_date is None or str(raw_date).strip() in ("", "nan", "NaT"):
            rep.errors.append({**ctx, "tipo": "incompleto", "motivo": "Fecha faltante"})
            continue
        if d is None:
            rep.errors.append({**ctx, "tipo": "fecha_invalida", "motivo": f"Fecha no reconocida: {raw_date}"})
            continue
        if len(raw_nums) < PICK:
            rep.errors.append({**ctx, "tipo": "incompleto", "motivo": f"Solo {len(raw_nums)} números (se requieren {PICK})"})
            continue
        if len(raw_nums) > PICK:
            rep.errors.append({**ctx, "tipo": "valor_invalido", "motivo": f"{len(raw_nums)} números (se requieren exactamente {PICK})"})
            continue
        nums = [_parse_int(n) for n in raw_nums]
        if any(n is None for n in nums):
            rep.errors.append({**ctx, "tipo": "valor_invalido", "motivo": "Valor no numérico o no entero"})
            continue
        if any(n < NUM_MIN or n > NUM_MAX for n in nums):
            rep.errors.append({**ctx, "tipo": "fuera_de_rango", "motivo": f"Números fuera de {NUM_MIN:02d}–{NUM_MAX:02d}"})
            continue
        if len(set(nums)) != PICK:
            rep.errors.append({**ctx, "tipo": "repetido", "motivo": "Números repetidos dentro del sorteo"})
            continue
        if d.isoformat() in seen_dates:
            rep.errors.append({**ctx, "tipo": "duplicado", "motivo": f"Fecha duplicada (ya en fila {seen_dates[d.isoformat()]})"})
            continue
        combo = tuple(sorted(nums))
        if combo in seen_combos:
            rep.warnings.append({**ctx, "tipo": "combinacion_repetida",
                                 "motivo": f"Misma combinación que el sorteo del {seen_combos[combo]}"})
        seen_dates[d.isoformat()] = i
        seen_combos[combo] = d.isoformat()
        rep.valid.append(Draw(d, combo))
    rep.valid.sort(key=lambda dr: dr.fecha)
    return rep


_NUM_COL = re.compile(r"^(n|num|numero|número|bola|b)?\s*_?\s*([1-6])$", re.I)


def dataframe_to_rows(df: pd.DataFrame) -> list[list]:
    """Acepta columnas con nombre (fecha, n1..n6 / numero1..) o posicionales."""
    df = df.dropna(how="all")
    cols = [str(c).strip() for c in df.columns]
    date_col = next((c for c in cols if c.lower() in ("fecha", "date", "dia", "día")), None)
    num_cols = sorted([c for c in cols if _NUM_COL.match(c)], key=lambda c: int(_NUM_COL.match(c).group(2)))
    df.columns = cols
    if date_col and len(num_cols) == PICK:
        return [[r[date_col], *[r[c] for c in num_cols]] for _, r in df.iterrows()]
    # Posicional: primera columna fecha, el resto números (se valida el conteo).
    return [list(r.values) for _, r in df.iterrows()]


def read_upload(filename: str, content: bytes) -> list[list]:
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm", ".xls")):
        df = pd.read_excel(io.BytesIO(content), dtype=object)
    else:
        text = content.decode("utf-8-sig", errors="replace")
        sep = ";" if text.count(";") > text.count(",") else ","
        df = pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False)
    return dataframe_to_rows(df)
