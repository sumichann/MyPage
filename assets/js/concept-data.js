// Concept MapとHomeで共有する、データの読み込みと基本計算。
export const mixAxes = ["research", "create", "play", "explore", "reflect"];

export const categoryOrder = [
  "identity",
  "background",
  "interest",
  "project",
  "research",
  "tech-skill",
  "tool",
  "music",
  "books",
  "thought",
];

export const categoryWeight = {
  identity: 780,
  background: 740,
  project: 760,
  research: 700,
  interest: 650,
  thought: 650,
  music: 620,
  books: 620,
  "tech-skill": 600,
  tool: 560,
};

const fallbackMixByCategory = {
  identity: { research: 1, create: 1, play: 1, explore: 1, reflect: 1 },
  background: { research: 2, create: 1, play: 0, explore: 0, reflect: 1 },
  interest: { research: 0, create: 0, play: 1, explore: 3, reflect: 1 },
  project: { research: 1, create: 3, play: 0, explore: 1, reflect: 0 },
  research: { research: 3, create: 1, play: 0, explore: 0, reflect: 1 },
  "tech-skill": { research: 1, create: 3, play: 1, explore: 0, reflect: 0 },
  tool: { research: 1, create: 2, play: 1, explore: 0, reflect: 0 },
  music: { research: 0, create: 1, play: 3, explore: 0, reflect: 0 },
  books: { research: 0, create: 0, play: 0, explore: 1, reflect: 3 },
  thought: { research: 0, create: 0, play: 0, explore: 1, reflect: 3 },
};

export function clamp(value, minimum, maximum) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(maximum, Math.max(minimum, value));
}

export function labelHash(label) {
  return [...label].reduce((hash, character) => {
    return (hash * 31 + character.codePointAt(0)) >>> 0;
  }, 7);
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

export function visualSize(concept, minWeight, maxWeight) {
  const range = Math.max(1, maxWeight - minWeight);
  const normalized = (concept.weight - minWeight) / range;
  const lengthAdjustment = Math.max(0.62, 1 - Math.max(0, concept.label.length - 10) * 0.018);
  return (1.25 + normalized * 3.4) * lengthAdjustment;
}

export function mobileVisualSize(size) {
  return Math.min(1.38, Math.max(0.48, size * 0.34));
}

export function normalizeMix(concept) {
  const fallback = fallbackMixByCategory[concept.category] || fallbackMixByCategory.identity;
  return Object.fromEntries(mixAxes.map((axis) => {
    const score = Number(concept.mix?.[axis]);
    return [axis, Number.isFinite(score) ? clamp(score, 0, 3) : fallback[axis]];
  }));
}

export async function loadConceptData() {
  const response = await fetch(new URL("../../data/concepts.json", import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.concepts) || payload.concepts.length === 0) {
    throw new Error("No concepts found");
  }
  return payload.concepts;
}
