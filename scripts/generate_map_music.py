#!/usr/bin/env python3
"""Build aligned, gapless audio stems from the current concept order."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[1]
CONCEPTS_PATH = ROOT / "data" / "concepts.json"
AUDIO_DIR = ROOT / "assets" / "audio"
BEATS_PER_MINUTE = 65
BEATS_PER_PHRASE = 4
PHRASE_DURATION = BEATS_PER_PHRASE * 60 / BEATS_PER_MINUTE
RESEARCH_SOUNDS = {
    "writing": AUDIO_DIR / "research-writing.mp3",
    "keyboard": AUDIO_DIR / "research-keyboard.mp3",
    "charge": AUDIO_DIR / "research-charge.mp3",
}


def concepts() -> list[dict]:
    payload = json.loads(CONCEPTS_PATH.read_text(encoding="utf-8"))
    return payload.get("concepts", [])


def mix_level(concept: dict, axis: str) -> int:
    value = round(float(concept.get("mix", {}).get(axis, 0)))
    return max(0, min(value, 3))


def label_hash(label: str) -> int:
    value = 7
    for character in label:
        value = (value * 31 + ord(character)) & 0xFFFFFFFF
    return value


def seeded_random(seed: int) -> Callable[[], float]:
    state = seed & 0xFFFFFFFF

    def random_value() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        value = state
        value = ((value ^ (value >> 15)) * (value | 1)) & 0xFFFFFFFF
        value ^= (value + (((value ^ (value >> 7)) * (value | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((value ^ (value >> 14)) & 0xFFFFFFFF) / 4294967296

    return random_value


def research_pattern(
    label: str,
    level: int,
    phrase_duration: float,
    writing_duration: float,
    charge_duration: float,
) -> tuple[float, list[float], float | None]:
    random_value = seeded_random(label_hash(label))
    writing_start = random_value() * max(0, writing_duration - phrase_duration)
    slots = list(range(1, 15))
    for index in range(len(slots) - 1, 0, -1):
        swap_index = int(random_value() * (index + 1))
        slots[index], slots[swap_index] = slots[swap_index], slots[index]

    hit_count = {1: 0, 2: 4, 3: 8}[level]
    keyboard_times = sorted(slot * phrase_duration / 16 for slot in slots[:hit_count])
    if level < 3:
        charge_time = None
    else:
        charge_time = 0 if random_value() < 0.5 else max(0, phrase_duration - charge_duration)
    return writing_start, keyboard_times, charge_time


def media_metadata(ffprobe: str, source: Path) -> dict:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=sample_rate:format=duration:format_tags=iTunSMPB",
            "-of",
            "json",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def media_duration(ffprobe: str, source: Path) -> float:
    return float(media_metadata(ffprobe, source)["format"]["duration"])


def run_ffmpeg(ffmpeg: str, arguments: list[str]) -> None:
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *arguments],
        check=True,
    )


def render_research_phrase(
    ffmpeg: str,
    output_path: Path,
    label: str,
    level: int,
    phrase_duration: float,
    writing_duration: float,
    charge_duration: float,
) -> None:
    writing_start, keyboard_times, charge_time = research_pattern(
        label,
        level,
        phrase_duration,
        writing_duration,
        charge_duration,
    )
    arguments = [
        "-ss",
        f"{writing_start:.9f}",
        "-t",
        f"{phrase_duration:.9f}",
        "-i",
        str(RESEARCH_SOUNDS["writing"]),
    ]
    for _ in keyboard_times:
        arguments.extend(["-i", str(RESEARCH_SOUNDS["keyboard"])])
    if charge_time is not None:
        arguments.extend(["-i", str(RESEARCH_SOUNDS["charge"])])

    fade_out_start = max(0, phrase_duration - 0.03)
    filters = [
        f"[0:a]volume=0.42,afade=t=in:st=0:d=0.03,"
        f"afade=t=out:st={fade_out_start:.9f}:d=0.03[writing]"
    ]
    inputs = ["[writing]"]
    input_index = 1
    for key_index, key_time in enumerate(keyboard_times):
        delay = round(key_time * 1000)
        filters.append(f"[{input_index}:a]volume=0.72,adelay={delay}|{delay}[key{key_index}]")
        inputs.append(f"[key{key_index}]")
        input_index += 1
    if charge_time is not None:
        delay = round(charge_time * 1000)
        filters.append(f"[{input_index}:a]volume=0.8,adelay={delay}|{delay}[charge]")
        inputs.append("[charge]")

    filters.append(
        f"{''.join(inputs)}amix=inputs={len(inputs)}:duration=longest:normalize=0,"
        "alimiter=limit=0.95[out]"
    )
    arguments.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[out]",
            "-t",
            f"{phrase_duration:.9f}",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-codec:a",
            "pcm_s16le",
            str(output_path),
        ]
    )
    run_ffmpeg(ffmpeg, arguments)


def render_stem(ffmpeg: str, playlist_path: Path, output_path: Path) -> None:
    rendered_path = playlist_path.with_suffix(".mp3")
    run_ffmpeg(
        ffmpeg,
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(playlist_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "128k",
            str(rendered_path),
        ],
    )
    shutil.copy2(rendered_path, output_path)


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe are required to generate map music")

    concept_items = concepts()
    if not concept_items:
        raise SystemExit("No concepts were found")

    missing = [source for source in RESEARCH_SOUNDS.values() if not source.is_file()]
    if missing:
        raise SystemExit(f"Missing sound: {missing[0]}")

    phrase_duration = PHRASE_DURATION
    writing_duration = media_duration(ffprobe, RESEARCH_SOUNDS["writing"])
    charge_duration = media_duration(ffprobe, RESEARCH_SOUNDS["charge"])

    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary_path = Path(temporary_directory)
        silence_path = temporary_path / "silence.wav"
        run_ffmpeg(
            ffmpeg,
            [
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=stereo",
                "-t",
                f"{phrase_duration:.9f}",
                "-codec:a",
                "pcm_s16le",
                str(silence_path),
            ],
        )

        research_playlist = []
        for index, concept in enumerate(concept_items):
            research_level = mix_level(concept, "research")
            if research_level:
                phrase_path = temporary_path / f"research-{index}.wav"
                render_research_phrase(
                    ffmpeg,
                    phrase_path,
                    concept["label"],
                    research_level,
                    phrase_duration,
                    writing_duration,
                    charge_duration,
                )
                research_playlist.append(phrase_path)
            else:
                research_playlist.append(silence_path)

        playlist_path = temporary_path / "map-research.txt"
        playlist_path.write_text(
            "".join(f"file '{source.as_posix()}'\n" for source in research_playlist),
            encoding="utf-8",
        )
        output_path = AUDIO_DIR / "map-research.mp3"
        render_stem(ffmpeg, playlist_path, output_path)
        print(f"Generated {output_path.relative_to(ROOT)} from {len(research_playlist)} phrases")


if __name__ == "__main__":
    main()
