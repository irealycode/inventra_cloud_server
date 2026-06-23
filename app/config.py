from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    database_url: str
    admin_token: str
    jwt_secret: str
    jwt_expire_minutes: int = 720
    setup_token_ttl_hours: int = 72

    # License gating — this server only grants multi-store access to licenses
    # that carry this feature, for this app.
    multi_store_feature: str = "multi_store"
    license_app: str = "inventra"


settings = Settings()
