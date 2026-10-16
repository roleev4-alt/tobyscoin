from fastapi.testclient import TestClient

from app.main import app, store

client = TestClient(app)


def test_flow_demo_portfolio_reproduce():
    store.clear_draws()
    assert client.post("/api/demo").status_code == 200
    info = client.get("/api/info").json()
    assert info["datos"]["sinteticos"] == info["datos"]["total"] > 100
    a = client.post("/api/analysis", json={}).json()
    assert len(a["frecuencia"]["filas"]) == info["rango"][1] and a["sorteos"] > 100
    p = client.post("/api/portfolio", json={"config": {"n_candidates": 1000}})
    assert p.status_code == 200, p.text
    body = p.json()
    assert len(body["portafolios"]["equilibrado"]["jugadas"]) == 10
    assert body["mejor_combinacion"]["nota"].startswith("Esta es la combinación")
    r = client.post(f"/api/experiments/{body['experimento_id']}/reproduce").json()
    assert r["reproducido"], r


def test_manual_and_validation_errors():
    store.clear_draws()
    ok = client.post("/api/draws", json={"fecha": "01/07/2025", "numeros": [1, 2, 3, 4, 5, 6]})
    assert ok.status_code == 200
    dup = client.post("/api/draws", json={"fecha": "2025-07-01", "numeros": [1, 2, 3, 4, 5, 7]})
    assert dup.status_code == 409
    bad = client.post("/api/draws", json={"fecha": "2025-07-02", "numeros": [1, 2, 3, 4, 5, 40]})
    assert bad.status_code == 400
    # Con datos reales cargados no se permite mezclar la demo.
    assert client.post("/api/demo").status_code == 409
    up = client.post("/api/import", files={"file": ("d.csv", b"fecha,n1,n2,n3,n4,n5,n6\n2025-07-03,1,2,3,4,5,6\n2025-07-04,1,1,2,3,4,5\n")})
    assert up.json()["insertados"] == 1 and up.json()["filas_rechazadas"] == 1
    store.clear_draws()


def test_paste_preview_then_import():
    store.clear_draws()
    txt = "Miércoles, 14 Octubre 2026 07 08 29 30 31 33\nSábado, 10 Octubre 2026 01 02 07 12 14 29\n"
    prev = client.post("/api/import/text", json={"texto": txt}).json()
    assert prev["vista_previa"] and prev["sorteos_validos"] == 2
    assert store.data_info()["total"] == 0  # la vista previa no guarda nada
    done = client.post("/api/import/text", json={"texto": txt, "confirmar": True, "fuente": "prueba"}).json()
    assert done["insertados"] == 2
    again = client.post("/api/import/text", json={"texto": txt}).json()
    assert all(x["ya_existe"] for x in again["sorteos"])
    store.clear_draws()
