"""Application orchestration for concept generation."""

from __future__ import annotations

from .config import Settings
from .note import collect_note_source
from .openai_api import generate_concepts
from .output import write_concepts
from .sources import collect_editorial_sources, collect_public_github_profile
from .web_search import collect_web_search_sources
from .youtube import collect_youtube_source


def main() -> None:
    settings = Settings.from_environment()
    sources = [
        *collect_editorial_sources(settings.content_dir, settings.root),
        collect_public_github_profile(
            settings.github_username,
            settings.github_token,
        ),
        collect_youtube_source(settings.youtube_feed_path),
        collect_note_source(settings.note_feed_path),
        *collect_web_search_sources(settings.web_search_feed_path),
    ]
    concepts = generate_concepts(
        settings.api_key,
        settings.model,
        sources,
    )
    write_concepts(settings.output_path, settings.model, concepts)
    print(f"Generated {len(concepts)} concepts with {settings.model}.")
