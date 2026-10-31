def test_api_repond(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_connexion_admin(client, admin):
    r = client.get("/api/v1/auth/me", headers=admin)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"

