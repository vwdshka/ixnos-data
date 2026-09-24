"""Runtime settings, read from IXNOS_DATA_* environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IXNOS_DATA_", env_file=".env", extra="ignore")

    database_url: str | None = None

    user_agent: str = "ixnos-data-pipeline/0.1"
    http_timeout_seconds: float = 20.0

    khmdhs_base_url: str = "https://cerpp.eprocurement.gov.gr/khmdhs-opendata"
    # At 2s apart KHMDHS answered 429 almost at once; at 4s 429s are occasional and the
    # retry loop absorbs them.
    khmdhs_min_interval_seconds: float = 4.0

    diavgeia_base_url: str = "https://diavgeia.gov.gr/luminapi/opendata"
    # Diavgeia showed no 429s at 1s apart; 2s keeps a margin.
    diavgeia_min_interval_seconds: float = 2.0

    # Raw API pages for closed days are written here and reused instead of refetched.
    raw_cache_dir: Path | None = None
