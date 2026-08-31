# kusahata.com

Personal website published with GitHub Pages at <https://kusahata.com>.

## AI-generated concept map

The site can generate a structured personal concept map at deploy time using
the OpenAI Responses API. The current sources are public GitHub profile and
repository metadata, public YouTube channel and video metadata, and the
normalized public RSS feed from <https://note.com/chenchuchu>. Brave Search
also discovers public web pages that mention Sumiaki Kusahata; only sanitized
visible excerpts from identity-matching pages are used. Optional editorial
sources can be added under `content/`.
The generator is split into focused modules under `scripts/concept_generator/`,
and its public output is `data/concepts.json`. The
`scripts/generate_concepts.py` file is the thin command-line entry point.

Each generated concept also has five independent human-mixer scores:
`research`, `create`, `play`, `explore`, and `reflect`. The dedicated
`concepts.html` concept-map page combines those scores with the concept's
identity weight to adjust its visual size, opacity, and stacking order without
changing its category color. The landing page starts with About and reuses the
matching generated words as static accents in each section.

Before running the workflows, add repository Actions secrets named
`OPENAI_API_KEY`, `YOUTUBE_API_KEY`, and `BRAVE_SEARCH_API_KEY`. The YouTube key
needs access to the YouTube Data API v3. Never commit an API key or put it in
the website source.

Run the **Generate personal concept map** workflow manually, or edit a file in
`content/` on `main` to trigger it automatically. The **Sync external sources**
workflow checks note, YouTube, and Brave-discovered public pages every Sunday
at 09:17 JST. It commits stable snapshots only when meaningful source content
changes, then dispatches concept generation. View, subscriber, like, and
comment counts are excluded so those volatile counters do not cause
unnecessary OpenAI API requests.

Run the generator unit tests with:

```sh
python3 -m unittest discover -s tests
```
