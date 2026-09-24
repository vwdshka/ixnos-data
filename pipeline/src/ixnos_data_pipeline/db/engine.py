from sqlalchemy import Engine, create_engine

from ixnos_data_pipeline.config import Settings


def engine_from_settings(settings: Settings) -> Engine:
    if not settings.database_url:
        raise RuntimeError("IXNOS_DATA_DATABASE_URL is not set (see .env.example).")
    return create_engine(settings.database_url, pool_pre_ping=True)
