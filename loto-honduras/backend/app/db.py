"""Persistencia SQLite (migrable a PostgreSQL: SQL estándar, sin extensiones).

Tablas:
  draws        sorteos validados, con fuente y fecha de importación
  imports      bitácora de cada importación (fuente, filas, rechazos)
  experiments  configuración + dataset hash + seed + resultados (reproducibilidad)
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib
import json
import os
import sqlite3
import threading
from functools import wraps

from .validation import Draw

DB_PATH = os.environ.get("LOTO_DB", os.path.join(os.path.dirname(__file__), "..", "loto.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS draws (
    fecha TEXT PRIMARY KEY,
    n1 INTEGER NOT NULL, n2 INTEGER NOT NULL, n3 INTEGER NOT NULL,
    n4 INTEGER NOT NULL, n5 INTEGER NOT NULL, n6 INTEGER NOT NULL,
    fuente TEXT NOT NULL,
    sintetico INTEGER NOT NULL DEFAULT 0,
    importado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    fuente TEXT NOT NULL,
    filas INTEGER NOT NULL,
    insertados INTEGER NOT NULL,
    rechazados INTEGER NOT NULL,
    detalle TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creado TEXT NOT NULL,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    model_version TEXT NOT NULL,
    seed INTEGER NOT NULL,
    dataset_hash TEXT NOT NULL,
    periodo_inicio TEXT,
    periodo_fin TEXT,
    config TEXT NOT NULL,
    params TEXT NOT NULL,
    resultado TEXT NOT NULL,
    resultado_hash TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def locked(fn):
    """La API atiende peticiones en varios hilos: el acceso a la conexión se serializa."""
    @wraps(fn)
    def inner(self, *a, **k):
        with self.lock:
            return fn(self, *a, **k)
    return inner


class Store:
    def __init__(self, path: str = DB_PATH):
        self.path = path
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.lock = threading.RLock()

    # ---------- sorteos ----------
    @locked
    def insert_draws(self, draws: list[Draw], fuente: str, sintetico: bool = False,
                     replace: bool = False) -> dict:
        inserted, skipped = 0, []
        ts = now_iso()
        for d in draws:
            exists = self.conn.execute("SELECT n1,n2,n3,n4,n5,n6 FROM draws WHERE fecha=?", (d.key(),)).fetchone()
            if exists and not replace:
                if tuple(exists) != d.numeros:
                    skipped.append({"fecha": d.key(), "motivo": "Ya existe un sorteo distinto en esa fecha (conflicto)"})
                else:
                    skipped.append({"fecha": d.key(), "motivo": "Duplicado (ya registrado)"})
                continue
            self.conn.execute(
                "INSERT OR REPLACE INTO draws VALUES (?,?,?,?,?,?,?,?,?,?)",
                (d.key(), *d.numeros, fuente, int(sintetico), ts),
            )
            inserted += 1
        self.conn.commit()
        return {"insertados": inserted, "omitidos": skipped}

    @locked
    def log_import(self, fuente: str, filas: int, insertados: int, rechazados: int, detalle: dict):
        self.conn.execute(
            "INSERT INTO imports (fecha,fuente,filas,insertados,rechazados,detalle) VALUES (?,?,?,?,?,?)",
            (now_iso(), fuente, filas, insertados, rechazados, json.dumps(detalle, default=str)),
        )
        self.conn.commit()

    @locked
    def imports(self) -> list[dict]:
        rows = self.conn.execute("SELECT id,fecha,fuente,filas,insertados,rechazados FROM imports ORDER BY id DESC LIMIT 50")
        return [dict(r) for r in rows]

    @locked
    def draws(self, start: date | None = None, end: date | None = None) -> list[Draw]:
        q, args = "SELECT * FROM draws WHERE 1=1", []
        if start:
            q += " AND fecha >= ?"
            args.append(start.isoformat())
        if end:
            q += " AND fecha <= ?"
            args.append(end.isoformat())
        q += " ORDER BY fecha"
        return [Draw(date.fromisoformat(r["fecha"]), (r["n1"], r["n2"], r["n3"], r["n4"], r["n5"], r["n6"]))
                for r in self.conn.execute(q, args)]

    @locked
    def draw_rows(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM draws ORDER BY fecha DESC")]

    @locked
    def delete_draw(self, fecha: str) -> bool:
        cur = self.conn.execute("DELETE FROM draws WHERE fecha=?", (fecha,))
        self.conn.commit()
        return cur.rowcount > 0

    @locked
    def clear_draws(self, only_synthetic: bool = False):
        self.conn.execute("DELETE FROM draws" + (" WHERE sintetico=1" if only_synthetic else ""))
        self.conn.commit()

    @locked
    def data_info(self) -> dict:
        r = self.conn.execute(
            "SELECT COUNT(*) c, MIN(fecha) mn, MAX(fecha) mx, MAX(importado) imp, SUM(sintetico) s FROM draws"
        ).fetchone()
        fuentes = [dict(x) for x in self.conn.execute("SELECT fuente, COUNT(*) c FROM draws GROUP BY fuente")]
        return {"total": r["c"], "desde": r["mn"], "hasta": r["mx"], "ultima_importacion": r["imp"],
                "sinteticos": r["s"] or 0, "fuentes": fuentes}

    # ---------- experimentos ----------
    @locked
    def save_experiment(self, tipo: str, nombre: str, model_version: str, seed: int, dataset_hash: str,
                        periodo: tuple, config: dict, params: dict, resultado: dict) -> int:
        res_json = json.dumps(resultado, sort_keys=True, default=str)
        cur = self.conn.execute(
            "INSERT INTO experiments (creado,tipo,nombre,model_version,seed,dataset_hash,periodo_inicio,periodo_fin,"
            "config,params,resultado,resultado_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (now_iso(), tipo, nombre, model_version, seed, dataset_hash, periodo[0], periodo[1],
             json.dumps(config, sort_keys=True), json.dumps(params, sort_keys=True, default=str), res_json,
             result_hash(resultado)),
        )
        self.conn.commit()
        return cur.lastrowid

    @locked
    def experiments(self, tipo: str | None = None) -> list[dict]:
        q = "SELECT id,creado,tipo,nombre,model_version,seed,dataset_hash,periodo_inicio,periodo_fin,resultado_hash FROM experiments"
        args = []
        if tipo:
            q += " WHERE tipo=?"
            args.append(tipo)
        return [dict(r) for r in self.conn.execute(q + " ORDER BY id DESC", args)]

    @locked
    def experiment(self, exp_id: int) -> dict | None:
        r = self.conn.execute("SELECT * FROM experiments WHERE id=?", (exp_id,)).fetchone()
        if not r:
            return None
        d = dict(r)
        for k in ("config", "params", "resultado"):
            d[k] = json.loads(d[k])
        return d


def dataset_hash(draws: list[Draw]) -> str:
    h = hashlib.sha256()
    for d in draws:
        h.update(f"{d.key()}:{','.join(map(str, d.numeros))};".encode())
    return h.hexdigest()[:16]


def result_hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]
