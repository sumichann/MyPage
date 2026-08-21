const field = document.querySelector("#concept-field");
const count = document.querySelector("#concept-count");
const layoutToggle = document.querySelector("#layout-toggle");

const categoryOrder = [
  "identity",
  "interest",
  "project",
  "research",
  "tech-skill",
  "tool",
  "music",
  "books",
  "thought",
];

const categoryWeight = {
  identity: 780,
  project: 760,
  research: 700,
  interest: 650,
  thought: 650,
  music: 620,
  books: 620,
  "tech-skill": 600,
  tool: 560,
};

let layoutMode = "scatter";
let scatterSeed = createSeed();
let resizeTimer;

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

function createSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(maximum, Math.max(minimum, value));
}

function layoutBounds() {
  const mobile = field.clientWidth <= 704;
  const side = mobile ? 14 : 36;
  return {
    left: side,
    right: field.clientWidth - side,
    top: mobile ? 82 : 72,
    bottom: field.clientHeight - (mobile ? 132 : 92),
  };
}

function measureWords(words) {
  return words.map((word) => ({
    word,
    width: word.offsetWidth,
    height: word.offsetHeight,
  }));
}

function sizeField(measurements) {
  const width = Math.max(280, field.clientWidth - (field.clientWidth <= 704 ? 28 : 72));
  const density = field.clientWidth <= 704 ? 0.3 : 0.44;
  const totalArea = measurements.reduce((area, item) => {
    return area + (item.width + 24) * (item.height + 20);
  }, 0);
  const activeCategories = new Set(measurements.map(({ word }) => word.dataset.category)).size;
  const clusterRows = field.clientWidth <= 560 ? activeCategories : Math.ceil(activeCategories / 3);
  const areaHeight = totalArea / (width * density) + 220;
  const clusterHeight = clusterRows * (field.clientWidth <= 560 ? 190 : 250) + 190;
  field.style.height = `${Math.ceil(Math.max(window.innerHeight, areaHeight, clusterHeight))}px`;
}

function overlapScore(candidate, placed, gap = 12) {
  return placed.reduce((score, other) => {
    const overlapWidth = Math.min(candidate.right, other.right) - Math.max(candidate.left, other.left) + gap;
    const overlapHeight = Math.min(candidate.bottom, other.bottom) - Math.max(candidate.top, other.top) + gap;
    if (overlapWidth <= 0 || overlapHeight <= 0) return score;
    return score + overlapWidth * overlapHeight;
  }, 0);
}

function makeRectangle(x, y, measurement) {
  return {
    x,
    y,
    left: x - measurement.width / 2,
    right: x + measurement.width / 2,
    top: y - measurement.height / 2,
    bottom: y + measurement.height / 2,
  };
}

function scatterPositions(measurements, bounds) {
  const random = seededRandom(scatterSeed ^ field.clientWidth ^ field.clientHeight);
  const placed = [];
  const positions = new Map();
  const largestFirst = [...measurements].sort((a, b) => {
    return b.width * b.height - a.width * a.height;
  });

  largestFirst.forEach((measurement) => {
    const minX = bounds.left + measurement.width / 2;
    const maxX = bounds.right - measurement.width / 2;
    const minY = bounds.top + measurement.height / 2;
    const maxY = bounds.bottom - measurement.height / 2;
    let bestRectangle;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < 140; attempt += 1) {
      const x = minX + random() * Math.max(0, maxX - minX);
      const y = minY + random() * Math.max(0, maxY - minY);
      const rectangle = makeRectangle(x, y, measurement);
      const score = overlapScore(rectangle, placed);
      if (score < bestScore) {
        bestRectangle = rectangle;
        bestScore = score;
      }
      if (score === 0) break;
    }

    placed.push(bestRectangle);
    positions.set(measurement.word, bestRectangle);
  });

  return positions;
}

function clusterPositions(measurements, bounds) {
  const groups = new Map();
  measurements.forEach((measurement) => {
    const category = measurement.word.dataset.category;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(measurement);
  });

  const categories = [
    ...categoryOrder.filter((category) => groups.has(category)),
    ...[...groups.keys()].filter((category) => !categoryOrder.includes(category)),
  ];
  const availableWidth = bounds.right - bounds.left;
  const availableHeight = bounds.bottom - bounds.top;
  const columns = field.clientWidth <= 560
    ? 1
    : Math.min(3, Math.max(1, Math.ceil(Math.sqrt(categories.length * availableWidth / availableHeight))));
  const rows = Math.ceil(categories.length / columns);
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  const positions = new Map();

  categories.forEach((category, categoryIndex) => {
    const group = groups.get(category).sort((a, b) => {
      return b.width * b.height - a.width * a.height;
    });
    const row = Math.floor(categoryIndex / columns);
    const itemsInRow = Math.min(columns, categories.length - row * columns);
    const columnOffset = (columns - itemsInRow) * cellWidth / 2;
    const column = categoryIndex % columns;
    const centerX = bounds.left + columnOffset + (column + 0.5) * cellWidth;
    const centerY = bounds.top + (row + 0.5) * cellHeight;
    const groupArea = group.reduce((area, item) => area + (item.width + 18) * (item.height + 16), 0);
    const naturalRadius = Math.sqrt(groupArea / Math.PI) * 0.78;
    const radiusX = Math.min(cellWidth * 0.43, naturalRadius);
    const radiusY = Math.min(cellHeight * 0.43, naturalRadius);

    group.forEach((measurement, itemIndex) => {
      const progress = group.length === 1 ? 0 : Math.sqrt((itemIndex + 0.35) / group.length);
      const angle = (labelHash(measurement.word.textContent) % 360) * Math.PI / 180
        + itemIndex * 2.399963;
      const x = clamp(
        centerX + Math.cos(angle) * radiusX * progress,
        bounds.left + measurement.width / 2,
        bounds.right - measurement.width / 2,
      );
      const y = clamp(
        centerY + Math.sin(angle) * radiusY * progress,
        bounds.top + measurement.height / 2,
        bounds.bottom - measurement.height / 2,
      );
      positions.set(measurement.word, { x, y });
    });
  });

  return positions;
}

function updateToggle() {
  const clustered = layoutMode === "cluster";
  layoutToggle.setAttribute("aria-pressed", String(clustered));
  layoutToggle.textContent = clustered ? "scatter words" : "group by genre";
}

function layoutWords() {
  const words = [...field.querySelectorAll(".concept")];
  if (words.length === 0) return;

  field.style.height = "";
  const measurements = measureWords(words);
  sizeField(measurements);
  const bounds = layoutBounds();
  const positions = layoutMode === "cluster"
    ? clusterPositions(measurements, bounds)
    : scatterPositions(measurements, bounds);

  field.dataset.layout = layoutMode;
  positions.forEach((position, word) => {
    word.style.left = `${position.x.toFixed(1)}px`;
    word.style.top = `${position.y.toFixed(1)}px`;
    word.dataset.positioned = "true";
  });
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
    fragment.append(word);
  });

  field.replaceChildren(fragment);
  field.setAttribute("aria-busy", "false");
  count.textContent = `${concepts.length} words / AI-generated`;
  layoutToggle.disabled = false;
  requestAnimationFrame(layoutWords);
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

layoutToggle.addEventListener("click", () => {
  layoutMode = layoutMode === "scatter" ? "cluster" : "scatter";
  if (layoutMode === "scatter") scatterSeed = createSeed();
  updateToggle();
  layoutWords();
});

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(layoutWords, 160);
});

updateToggle();
loadConcepts();
