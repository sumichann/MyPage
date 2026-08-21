import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const OUTPUT_PATH = path.join(ROOT, "data", "concepts.json");
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "sumichann";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is required. Store it as a GitHub Actions secret; never commit it."
  );
}

async function collectEditorialSources() {
  const names = (await readdir(CONTENT_DIR)).filter((name) => name.endsWith(".md"));
  const files = await Promise.all(
    names.sort().map(async (name) => ({
      source: `content/${name}`,
      text: await readFile(path.join(CONTENT_DIR, name), "utf8"),
    }))
  );

  return files;
}

async function collectPublicGitHubProfile() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kusahata-concept-generator",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const [userResponse, reposResponse] = await Promise.all([
    fetch(`https://api.github.com/users/${GITHUB_USERNAME}`, { headers }),
    fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated`,
      { headers }
    ),
  ]);

  if (!userResponse.ok || !reposResponse.ok) {
    throw new Error(
      `GitHub collection failed (${userResponse.status}/${reposResponse.status}).`
    );
  }

  const user = await userResponse.json();
  const repos = await reposResponse.json();

  return {
    source: `github.com/${GITHUB_USERNAME}`,
    text: JSON.stringify(
      {
        profile: {
          name: user.name,
          bio: user.bio,
          company: user.company,
          location: user.location,
          blog: user.blog,
        },
        repositories: repos
          .filter((repo) => !repo.fork)
          .map((repo) => ({
            name: repo.name,
            description: repo.description,
            homepage: repo.homepage,
            language: repo.language,
            topics: repo.topics,
          })),
      },
      null,
      2
    ),
  };
}

const conceptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      minItems: 12,
      maxItems: 36,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", minLength: 1, maxLength: 40 },
          summary: { type: "string", minLength: 1, maxLength: 180 },
          weight: { type: "integer", minimum: 1, maximum: 100 },
          category: { type: "string", minLength: 1, maxLength: 32 },
          related: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 40 },
          },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
        required: ["label", "summary", "weight", "category", "related", "evidence"],
      },
    },
  },
  required: ["concepts"],
};

function responseText(response) {
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text") return content.text;
    }
  }

  throw new Error("OpenAI response did not contain output text.");
}

const sources = [
  ...(await collectEditorialSources()),
  await collectPublicGitHubProfile(),
];

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    store: false,
    instructions: [
      "You are an editorial researcher creating a personal concept map.",
      "Extract distinctive concepts grounded only in the supplied sources.",
      "Prefer specific nouns and short noun phrases over generic personality adjectives.",
      "Merge duplicates, preserve meaningful contrasts, and write concise Japanese summaries.",
      "Weights represent identity relevance, not raw frequency.",
      "Evidence must name source identifiers, never invent private facts.",
    ].join(" "),
    input: JSON.stringify(sources),
    text: {
      format: {
        type: "json_schema",
        name: "personal_concept_map",
        strict: true,
        schema: conceptSchema,
      },
    },
  }),
});

if (!response.ok) {
  const message = await response.text();
  throw new Error(`OpenAI request failed (${response.status}): ${message}`);
}

const payload = await response.json();
const result = JSON.parse(responseText(payload));

await writeFile(
  OUTPUT_PATH,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      model: MODEL,
      concepts: result.concepts,
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Generated ${result.concepts.length} concepts with ${MODEL}.`);
