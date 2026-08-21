"""Application orchestration for concept generation."""

from __future__ import annotations

from .config import Settings
from .openai_api import generate_concepts
from .output import write_concepts
from .sources import collect_editorial_sources, collect_public_github_profile
from .youtube import collect_public_youtube_channel


def main() -> None:
    settings = Settings.from_environment()
    sources = [
        *collect_editorial_sources(settings.content_dir, settings.root),
        collect_public_github_profile(
            settings.github_username,
            settings.github_token,
        ),
        collect_public_youtube_channel(
            settings.youtube_handle,
            settings.youtube_api_key,
            settings.youtube_max_videos,
        ),
    ]
    concepts = generate_concepts(
        settings.api_key,
        settings.model,
        sources,
    )
    write_concepts(settings.output_path, settings.model, concepts)
    print(f"Generated {len(concepts)} concepts with {settings.model}.")
