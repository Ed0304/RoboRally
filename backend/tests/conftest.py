
"""Pytest fixtures. Dummy env only; no real credentials or databases."""

import os

os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/test")
os.environ.setdefault("SESSION_SECRET", "test-secret-not-real")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
