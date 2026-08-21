const field = document.querySelector("#concept-field");
const count = document.querySelector("#concept-count");

const categoryWeight = {
  identity: 780,
  project: 760,
  research: 700,
  interest: 650,
  thought: 650,
  music: 620,
  books: 620,
  skill: 600,
  tool: 560,
};

function labelHash(label) {
  return [...label].reduce((hash, character) => {
    return (hash * 31 + character.codePointAt(0)) >>> 0;
  }, 7);
}

function visualSize(concept, minWeight, maxWeight) {
  const range = Math.max(1, maxWeight - minWeight);
  const normalized = (concept.weight - minWeight) / range;
  const lengthAdjustment = Math.max(0.62, 1 - Math.max(0, concept.label.length - 10) * 0.018);
  return (1.25 + normalized * 3.4) * lengthAdjustment;
}

function renderConcepts(concepts) {
  const weights = concepts.map(({ weight }) => weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const fragment = document.createDocumentFragment();

  concepts.forEach((concept, index) => {
    const word = document.createElement("p");
    const hash = labelHash(concept.label);
    const tilt = ((hash % 9) - 4) * 0.35;

    word.className = "concept";
    word.dataset.category = concept.category;
    word.textContent = concept.label;
    word.style.setProperty("--concept-size", `${visualSize(concept, minWeight, maxWeight).toFixed(2)}rem`);
    word.style.setProperty("--concept-weight", categoryWeight[concept.category] || 600);
    word.style.setProperty("--concept-tilt", `${tilt.toFixed(2)}deg`);
    word.style.setProperty("--concept-delay", `${Math.min(index * 45, 480)}ms`);
    word.style.order = hash % 100;
    fragment.append(word);
  });

  field.replaceChildren(fragment);
  field.setAttribute("aria-busy", "false");
  count.textContent = `${concepts.length} words / AI-generated`;
}

async function loadConcepts() {
  try {
    const response = await fetch(new URL("../data/concepts.json", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload.concepts) || payload.concepts.length === 0) {
      throw new Error("No concepts found");
    }

    renderConcepts(payload.concepts);
  } catch (error) {
    console.error("Could not load concept map", error);
    const message = document.createElement("p");
    message.className = "loading error";
    message.textContent = "words could not be loaded.";
    field.replaceChildren(message);
    field.setAttribute("aria-busy", "false");
  }
}

loadConcepts();
