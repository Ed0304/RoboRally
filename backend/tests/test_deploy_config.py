"""Deployment configuration: CORS origins, required env, middleware.

No live services and no sockets: origin parsing is pure, and the CORS
wiring is asserted from the built app's middleware stack (live
preflight belongs in the manual deployment checklist instead).
"""

import importlib

import pytest


def _reload_main(monkeypatch, origins=None):
    if origins is None:
        monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    else:
        monkeypatch.setenv("FRONTEND_ORIGINS", origins)
    import main as app_module

    return importlib.reload(app_module)


def test_frontend_origins_default_localhost(monkeypatch):
    app_module = _reload_main(monkeypatch)
    assert app_module.origins == ["http://localhost:3000"]


def test_frontend_origins_env_list(monkeypatch):
    app_module = _reload_main(
        monkeypatch, "https://app.example.com, http://localhost:3000"
    )
    assert app_module.origins == [
        "https://app.example.com",
        "http://localhost:3000",
    ]


def test_frontend_origins_rejects_wildcard(monkeypatch):
    with pytest.raises(RuntimeError, match="explicit origins"):
        _reload_main(monkeypatch, "*")


def test_cors_middleware_uses_explicit_origins(monkeypatch):
    app_module = _reload_main(
        monkeypatch, "https://app.example.com,http://localhost:3000"
    )
    cors = [
        entry.kwargs
        for entry in app_module.app.user_middleware
        if entry.cls.__name__ == "CORSMiddleware"
    ]
    assert len(cors) == 1
    assert cors[0]["allow_origins"] == [
        "https://app.example.com",
        "http://localhost:3000",
    ]
    assert cors[0]["allow_credentials"] is True


def test_require_env_reads_value_and_hides_it_on_failure():
    from authentication.common import _require_env

    assert _require_env("PATH")  # sanity: real env reads through
    with pytest.raises(RuntimeError) as exc:
        _require_env("ROBORALLY_DEFINITELY_MISSING_SETTING")
    message = str(exc.value)
    assert "ROBORALLY_DEFINITELY_MISSING_SETTING" in message
