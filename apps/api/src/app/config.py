"""Runtime configuration, read from the environment (see .env.example)."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["local", "ci", "staging", "production"] = "local"
    log_level: str = "info"

    database_url: str = "postgresql+asyncpg://teslimsulaiman@127.0.0.1:55439/scorepilot"
    database_schema: str = "stackprep"
    database_pool_size: int = 10

    redis_url: str = "redis://127.0.0.1:6379/0"

    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    #: Where question_assets.storage_uri is resolved from. Empty means the repository root,
    #: which is right wherever the API runs from a checkout; the Docker image copies the
    #: figures in and sets this to its own root.
    asset_root: str = ""

    openai_api_key: str = ""
    # The coach no longer writes the explanation: the reviewed steps are stored and the board
    # plays them from the database. The model only answers what a student asks at the board,
    # which is short and bounded, so the efficient tier of the current generation is used —
    # GPT-6 Luna, a generation past gpt-4o at about a twentieth of its price.
    #
    # The earlier rule was "deliberately not the cheap model", because explaining the reviewed
    # working, inventing nothing and revealing nothing early is refusal behaviour, and refusal
    # is what a smaller model gives up first. That concern stands: it has not been measured on
    # Luna. If the coach starts giving answers away, move this to gpt-6-sol.
    ai_runtime_model: str = "gpt-6-luna"
    ai_batch_model: str = "gpt-6-luna"
    #: How hard a reasoning model thinks before answering. "low", not "none": a student's
    #: question about a maths step deserves a moment's working, and "none" answers without
    #: any. Empty leaves the parameter out entirely, which a non-reasoning model such as
    #: gpt-4o needs, because it rejects the parameter.
    ai_reasoning_effort: Literal["", "none", "low", "medium", "high"] = "low"
    ai_daily_calls_per_student: int = Field(default=20, ge=0)
    #: Send the reviewed diagram with the question. A coach that cannot see the figure is
    #: guessing at any step that points into it. Costs more per turn than the text does, so
    #: it is a switch a deployment can throw.
    ai_send_figures: bool = True
    #: Speak the coach's explanation aloud. The board is the summary; the voice is the lesson,
    #: so this is not a decoration — with it off, most of the teaching is simply not delivered.
    ai_speak: bool = True
    #: Still OpenAI's current speech model; the GPT-6 models write text and do not speak.
    ai_speech_model: str = "gpt-4o-mini-tts"
    #: OpenAI's own recommendation for best quality on this model, over the older "alloy".
    ai_speech_voice: str = "marin"
    #: Let the student ask by speaking instead of typing. On: the consent position for
    #: recording a minor is certified, so this is now an ordinary feature rather than a
    #: blocked one. The audio is still transcribed and dropped inside the request — only the
    #: words are kept, in `tutor_turns`, exactly as a typed question would be.
    ai_listen: bool = True
    ai_transcription_model: str = "gpt-transcribe"

    @field_validator("database_schema")
    @classmethod
    def _schema_is_a_bare_identifier(cls, value: str) -> str:
        # The schema name is interpolated into search_path, so it must not be
        # able to carry anything but an identifier.
        if not _IDENTIFIER.match(value):
            raise ValueError("database_schema must be a lowercase SQL identifier")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
