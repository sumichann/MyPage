# kusahata.com

Personal website published with GitHub Pages at <https://kusahata.com>.

## AI-generated concept map

The site can generate a structured personal concept map at deploy time using
the OpenAI Responses API. The current sources are public GitHub profile and
repository metadata, public YouTube channel and video metadata, and the
normalized public RSS feed from <https://note.com/chenchuchu>. Optional
editorial sources can be added under `content/`.
The generator is split into focused modules under `scripts/concept_generator/`,
and its public output is `data/concepts.json`. The
`scripts/generate_concepts.py` file is the thin command-line entry point.

Before running the workflow, add repository Actions secrets named
`OPENAI_API_KEY` and `YOUTUBE_API_KEY`. The YouTube key needs access to the
YouTube Data API v3. Never commit an API key or put it in the website source.

Run the **Generate personal concept map** workflow manually, or edit a file in
`content/` on `main` to trigger it automatically. The **Sync note feed**
workflow checks note every Sunday at 09:17 JST and commits
`data/note-feed.json` only when the feed changes. The concept generator runs
every Sunday at 09:47 JST, after the note sync, and refreshes its live GitHub
and YouTube sources at that time.

Run the generator unit tests with:

```sh
python3 -m unittest discover -s tests
```
