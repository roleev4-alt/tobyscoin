import io

import pandas as pd

from app.validation import parse_text, read_upload, validate_rows


def test_valid_and_sorted():
    rep = validate_rows([["05/07/2025", 31, 2, 15, 7, 22, 9], ["2025-07-02", 1, 2, 3, 4, 5, 6]])
    assert len(rep.valid) == 2 and not rep.errors
    assert rep.valid[0].fecha.isoformat() == "2025-07-02"
    assert rep.valid[1].numeros == (2, 7, 9, 15, 22, 31)


def test_rejections():
    rows = [
        ["2025-07-01", 1, 2, 3, 4, 5, 34],      # fuera de rango (01–33)
        ["2025-07-02", 1, 2, 3, 4, 5, 5],       # repetido
        ["2025-07-03", 1, 2, 3, 4, 5],          # incompleto
        ["2025-07-04", 1, 2, 3, 4, 5, 6, 7],    # demasiados
        ["31/02/2025", 1, 2, 3, 4, 5, 6],       # fecha inválida
        ["", 1, 2, 3, 4, 5, 6],                 # sin fecha
        ["2025-07-05", 1, 2, "x", 4, 5, 6],     # no numérico
        ["2025-07-06", 1, 2, 3, 4, 5, 6],
        ["2025-07-06", 7, 8, 9, 10, 11, 12],    # fecha duplicada
        ["2025-07-07", 0, 2, 3, 4, 5, 6],       # cero fuera de rango
    ]
    rep = validate_rows(rows)
    tipos = [e["tipo"] for e in rep.errors]
    assert len(rep.valid) == 1
    assert tipos == ["fuera_de_rango", "repetido", "incompleto", "valor_invalido", "fecha_invalida",
                     "incompleto", "valor_invalido", "duplicado", "fuera_de_rango"]


def test_same_combo_warning():
    rep = validate_rows([["2025-07-01", 1, 2, 3, 4, 5, 6], ["2025-07-02", 6, 5, 4, 3, 2, 1]])
    assert len(rep.valid) == 2 and rep.warnings[0]["tipo"] == "combinacion_repetida"


def test_csv_named_and_positional():
    named = "fecha;n1;n2;n3;n4;n5;n6\n01/07/2025;1;2;3;4;5;6\n"
    assert len(validate_rows(read_upload("a.csv", named.encode())).valid) == 1
    pos = "Fecha,A,B,C,D,E,F\n2025-07-01,10,11,12,13,14,15\n"
    assert len(validate_rows(read_upload("b.csv", pos.encode())).valid) == 1


def test_excel():
    buf = io.BytesIO()
    pd.DataFrame({"fecha": ["2025-07-01"], "numero1": [1], "numero2": [2], "numero3": [3],
                  "numero4": [4], "numero5": [5], "numero6": [31]}).to_excel(buf, index=False)
    rep = validate_rows(read_upload("x.xlsx", buf.getvalue()))
    assert rep.valid[0].numeros == (1, 2, 3, 4, 5, 31)


def test_parse_pasted_text():
    txt = """Resultados 9:00 p.m. del 11 de Marzo del 2026 Loto Super Premio: 23 - 28 - 02 - 22 - 33 - 18 Diaria: 49 Multi-X: 2X
Miércoles, 14 Octubre 2026
07
08
29
30
31
33
Premio mayor L 10,000,000.00
05-09-2026 | 9 12 18 20 23 26
26/08/2026 3 9 14 16 18
"""
    rep = validate_rows(parse_text(txt))
    got = {d.fecha.isoformat(): d.numeros for d in rep.valid}
    assert got == {"2026-03-11": (2, 18, 22, 23, 28, 33), "2026-10-14": (7, 8, 29, 30, 31, 33),
                   "2026-09-05": (9, 12, 18, 20, 23, 26)}
    assert [e["tipo"] for e in rep.errors] == ["incompleto"]


def test_numbers_in_single_cell():
    rep = validate_rows([["14/10/2026", "07 08 29 30 31 33"], ["Sábado, 10 Octubre 2026", "01-02-07-12-14-29"]])
    assert len(rep.valid) == 2 and not rep.errors
