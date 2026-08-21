from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from concept_generator.config import Settings
from concept_generator.openai_api import (
    INSTRUCTIONS,
    build_request_payload,
    extract_response_text,
    generate_concepts,
)
from concept_generator.output import write_concepts
from concept_generator.schema import CONCEPT_CATEGORIES
from concept_generator.sources import (
    collect_editorial_sources,
    collect_public_github_profile,
)
from concept_generator.youtube import collect_public_youtube_channel


class SettingsTests(unittest.TestCase):
    def test_api_key_is_required(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "OPENAI_API_KEY"):
            Settings.from_environment({}, Path("/project"))

    def test_youtube_api_key_is_required(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "YOUTUBE_API_KEY"):
            Settings.from_environment({"OPENAI_API_KEY": "test-key"}, Path("/project"))

    def test_defaults_are_stable(self) -> None:
        settings = Settings.from_environment(
            {"OPENAI_API_KEY": "test-key", "YOUTUBE_API_KEY": "youtube-key"},
            Path("/project"),
        )
        self.assertEqual(settings.model, "gpt-5.4-mini")
        self.assertEqual(settings.github_username, "sumichann")
        self.assertEqual(settings.youtube_handle, "@sumihosdrums")
        self.assertEqual(settings.youtube_max_videos, 30)
        self.assertEqual(settings.output_path, Path("/project/data/concepts.json"))

    def test_youtube_video_limit_is_validated(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 1 and 50"):
            Settings.from_environment(
                {
                    "OPENAI_API_KEY": "test-key",
                    "YOUTUBE_API_KEY": "youtube-key",
                    "YOUTUBE_MAX_VIDEOS": "51",
                },
                Path("/project"),
            )


class SourceTests(unittest.TestCase):
    def test_missing_content_directory_has_no_editorial_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = collect_editorial_sources(root / "content", root)

        self.assertEqual(sources, [])

    def test_editorial_sources_are_sorted_and_named_relative_to_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            content = root / "content"
            content.mkdir()
            (content / "b.md").write_text("second", encoding="utf-8")
            (content / "a.md").write_text("first", encoding="utf-8")
            (content / "ignored.txt").write_text("ignored", encoding="utf-8")

            sources = collect_editorial_sources(content, root)

        self.assertEqual(
            sources,
            [
                {"source": "content/a.md", "text": "first"},
                {"source": "content/b.md", "text": "second"},
            ],
        )

    def test_github_source_excludes_forks(self) -> None:
        responses = [
            {"name": "Sumi", "bio": "Bio", "company": None, "location": None, "blog": ""},
            [
                {"name": "original", "fork": False, "topics": ["ai"]},
                {"name": "forked", "fork": True, "topics": []},
            ],
        ]

        def requester(*_args, **_kwargs):
            return responses.pop(0)

        source = collect_public_github_profile("sumichann", None, requester)
        profile = json.loads(source["text"])

        self.assertEqual(source["source"], "github.com/sumichann")
        self.assertEqual([repo["name"] for repo in profile["repositories"]], ["original"])

    def test_youtube_source_uses_handle_and_preserves_upload_order(self) -> None:
        responses = [
            {
                "items": [
                    {
                        "id": "channel-id",
                        "snippet": {
                            "title": "Sumiho's Drums",
                            "description": "Drum channel",
                            "publishedAt": "2020-01-01T00:00:00Z",
                            "country": "JP",
                        },
                        "contentDetails": {"relatedPlaylists": {"uploads": "uploads-id"}},
                        "statistics": {"subscriberCount": "10", "videoCount": "2"},
                    }
                ]
            },
            {
                "items": [
                    {"contentDetails": {"videoId": "new-video"}},
                    {"contentDetails": {"videoId": "old-video"}},
                ]
            },
            {
                "items": [
                    {
                        "id": "old-video",
                        "snippet": {"title": "Old", "description": "old description"},
                        "contentDetails": {"duration": "PT1M"},
                        "statistics": {"viewCount": "20"},
                    },
                    {
                        "id": "new-video",
                        "snippet": {
                            "title": "New drum cover",
                            "description": "new description",
                            "tags": ["drums", "cover"],
                        },
                        "contentDetails": {"duration": "PT2M"},
                        "statistics": {"viewCount": "30", "likeCount": "4"},
                    },
                ]
            },
        ]
        requested_urls = []

        def requester(url, **_kwargs):
            requested_urls.append(url)
            return responses.pop(0)

        source = collect_public_youtube_channel("sumihosdrums", "secret-key", 2, requester)
        channel = json.loads(source["text"])

        self.assertEqual(source["source"], "youtube.com/@sumihosdrums")
        self.assertIn("forHandle=%40sumihosdrums", requested_urls[0])
        self.assertIn("playlistId=uploads-id", requested_urls[1])
        self.assertIn("maxResults=2", requested_urls[1])
        self.assertEqual(
            [video["id"] for video in channel["videos"]],
            ["new-video", "old-video"],
        )
        self.assertEqual(channel["videos"][0]["tags"], ["drums", "cover"])

    def test_youtube_error_redacts_api_key(self) -> None:
        def requester(*_args, **_kwargs):
            raise RuntimeError("request failed with key=secret-key")

        with self.assertRaisesRegex(RuntimeError, r"key=\[REDACTED\]"):
            collect_public_youtube_channel("@sumihosdrums", "secret-key", requester=requester)


class OpenAITests(unittest.TestCase):
    def test_request_uses_structured_output_schema(self) -> None:
        payload = build_request_payload("test-model", [{"source": "notes", "text": "AI"}])
        self.assertEqual(payload["model"], "test-model")
        self.assertFalse(payload["store"])
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertTrue(payload["text"]["format"]["strict"])
        category_schema = payload["text"]["format"]["schema"]["properties"]["concepts"]["items"][
            "properties"
        ]["category"]
        self.assertEqual(category_schema["enum"], CONCEPT_CATEGORIES)
        self.assertEqual(
            CONCEPT_CATEGORIES,
            [
                "identity",
                "interest",
                "project",
                "research",
                "tech-skill",
                "tool",
                "music",
                "books",
                "thought",
            ],
        )

    def test_tech_skill_requires_demonstrated_technical_work(self) -> None:
        self.assertIn("tech-skill for demonstrated technical capabilities", INSTRUCTIONS)
        self.assertIn("Do not use tech-skill for instruments", INSTRUCTIONS)

    def test_extract_response_text(self) -> None:
        response = {
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": '{"concepts": []}'}],
                }
            ]
        }
        self.assertEqual(extract_response_text(response), '{"concepts": []}')

    def test_generate_concepts_parses_api_result(self) -> None:
        concepts = [{"label": "AI"}]

        def requester(*_args, **_kwargs):
            return {
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps({"concepts": concepts}),
                            }
                        ],
                    }
                ]
            }

        self.assertEqual(generate_concepts("key", "model", [], requester), concepts)


class OutputTests(unittest.TestCase):
    def test_write_concepts_adds_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "nested" / "concepts.json"
            write_concepts(
                output_path,
                "test-model",
                [{"label": "AI"}],
                clock=lambda: datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc),
            )
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["generatedAt"], "2026-08-21T12:00:00Z")
        self.assertEqual(payload["model"], "test-model")
        self.assertEqual(payload["concepts"], [{"label": "AI"}])


if __name__ == "__main__":
    unittest.main()
