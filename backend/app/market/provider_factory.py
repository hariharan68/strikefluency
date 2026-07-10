from app.market.base import MarketDataProvider
import logging

logger = logging.getLogger(__name__)

_provider_instance = None


def get_market_provider() -> MarketDataProvider:
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = _create_provider()
    return _provider_instance


def reset_provider():
    global _provider_instance
    _provider_instance = None
    try:
        from app.brokers.registry import reset_adapter_registry
        reset_adapter_registry()
    except Exception:
        pass


def _create_provider() -> MarketDataProvider:
    from app.config import settings
    provider_name = getattr(settings, "MARKET_DATA_PROVIDER", "mock").lower()
    logger.info(f"Initialising market data provider: {provider_name}")

    if provider_name == "fyers":
        return _create_fyers_provider(settings)

    logger.info("Using mock market data provider")
    from app.market.mock_provider import MockMarketDataProvider
    return MockMarketDataProvider()


def _create_fyers_provider(settings) -> MarketDataProvider:
    from app.market.mock_provider import MockMarketDataProvider
    from app.services.fyers_auth_service import get_saved_access_token

    app_id = getattr(settings, "FYERS_APP_ID", "") or getattr(settings, "FYERS_CLIENT_ID", "")
    access_token = get_saved_access_token()

    if not app_id or not access_token:
        logger.warning("Fyers credentials missing. Using mock provider.")
        return MockMarketDataProvider()

    try:
        from app.market.fyers_provider import FyersMarketDataProvider
        provider = FyersMarketDataProvider(
            app_id=app_id,
            access_token=access_token,
        )
        if provider.is_connected():
            logger.info("Fyers provider ready - live data active")
            return provider

        logger.warning("Fyers token invalid. Using mock provider.")
        return MockMarketDataProvider()

    except Exception as e:
        logger.error(f"Fyers init error: {e}. Using mock.")
        return MockMarketDataProvider()

