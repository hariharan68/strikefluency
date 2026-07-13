from datetime import timedelta

from app.core.security import create_access_token, verify_token
from app.services.auth_service import normalize_email
from app.services.jti_store import deny_jti, is_denied


def test_email_normalization_is_stable():
    assert normalize_email("  Trader@Example.COM ") == "trader@example.com"


def test_access_token_contains_revocation_claims():
    token = create_access_token("user", "tenant", "trader", expires_delta=timedelta(minutes=1), session_id="family", token_version=3)
    claims = verify_token(token)
    assert claims["sid"] == "family"
    assert claims["tv"] == 3
    assert claims["jti"]


def test_jti_denylist_is_disabled_by_default():
    assert not is_denied("not-denied")
    deny_jti("not-denied", 4102444800)
    assert not is_denied("not-denied")
