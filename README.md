# kusahata.com

Personal website published with GitHub Pages at <https://kusahata.com>.

## AI-generated concept map

The site can generate a structured personal concept map at deploy time using
the OpenAI Responses API. Source notes live in `content/`, the generator is
`scripts/generate_concepts.py`, and its public output is
`data/concepts.json`.

Before running the workflow, add a repository Actions secret named
`OPENAI_API_KEY`. Never commit an API key or put it in the website source.

Run the **Generate personal concept map** workflow manually, or edit a file in
`content/` on `main` to trigger it automatically.
