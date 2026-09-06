// Concept Mapページ専用。UIイベントを各モジュールへつなぐ入口。
import {
  categoryWeight,
  clamp,
  createSeed,
  labelHash,
  loadConceptData,
  mixAxes,
  mobileVisualSize,
  normalizeMix,
  visualSize,
} from "../concept-data.js";
import { layoutWords } from "../concept-layout.js";
import {
  createAudioController,
  hasIndividualSound,
  soundAxes,
  soundVolumeScales,
} from "../concept-audio.js";

const field = document.querySelector("#concept-field");
const count = document.querySelector("#concept-count");
const layoutToggle = document.querySelector("#layout-toggle");
const mapPlaybackToggle = document.querySelector("#map-playback-toggle");
const mixerPanel = document.querySelector("#human-mixer");
const mixerToggle = document.querySelector("#mixer-toggle");
const mixerToggleIcon = document.querySelector("#mixer-toggle-icon");
const mixerReset = document.querySelector("#mixer-reset");
const mixerInputs = [...document.querySelectorAll("[data-mix-axis]")];

let layoutMode = "scatter";
let scatterSeed = createSeed();
let resizeTimer;
let lastLayoutWidth = window.innerWidth;

function mixerVolume(axis) {
  const input = mixerInputs.find((item) => item.dataset.mixAxis === axis);
  const mixerLevel = clamp(Number(input?.value ?? 100) / 200, 0, 1);
  return mixerLevel * (soundVolumeScales[axis] ?? 1);
}

function updateMapPlaybackState(active) {
  document.documentElement.classList.toggle("map-playing", active);
  document.body.classList.toggle("map-playing", active);
  mapPlaybackToggle.setAttribute("aria-pressed", String(active));
  mapPlaybackToggle.textContent = active ? "stop this map" : "play this map";
}

const audio = createAudioController({
  field,
  getMixerVolume: mixerVolume,
  onMapPlaybackChange: updateMapPlaybackState,
});

function currentMixLevels() {
  return Object.fromEntries(mixerInputs.map((input) => {
    return [input.dataset.mixAxis, Number(input.value) / 100];
  }));
}

function mixedProminence(mix, levels) {
  const totalScore = mixAxes.reduce((total, axis) => total + mix[axis], 0);
  if (totalScore === 0) return 1;
  return mixAxes.reduce((total, axis) => total + mix[axis] * levels[axis], 0) / totalScore;
}

function applyMixer() {
  const levels = currentMixLevels();
  const words = [...field.querySelectorAll(".concept")];

  mixerInputs.forEach((input) => {
    input.nextElementSibling.value = input.value;
  });

  words.forEach((word) => {
    const mix = JSON.parse(word.dataset.mix);
    const prominence = mixedProminence(mix, levels);
    const size = clamp(Number(word.dataset.baseSize) * prominence, 0, 6.2);
    const mobileSize = clamp(Number(word.dataset.baseMobileSize) * prominence, 0, 1.8);
    const opacity = prominence === 0 ? 0 : clamp(0.24 + prominence * 0.76, 0.24, 1);

    word.style.setProperty("--concept-size", `${size.toFixed(2)}rem`);
    word.style.setProperty("--concept-size-mobile", `${mobileSize.toFixed(2)}rem`);
    word.style.setProperty("--concept-opacity", opacity.toFixed(2));
    word.style.zIndex = String(Math.round(prominence * 100));
    word.style.setProperty("--concept-delay", "0ms");
  });
}

function setMixerDrawerOpen(open) {
  mixerPanel.dataset.open = String(open);
  mixerToggle.setAttribute("aria-expanded", String(open));
  mixerToggle.setAttribute("aria-label", `${open ? "Hide" : "Show"} human mixer`);
  const mobile = window.matchMedia("(max-width: 44rem)").matches;
  mixerToggleIcon.textContent = mobile
    ? (open ? "↓" : "↑")
    : (open ? "→" : "←");
}

function updateLayoutToggle() {
  const clustered = layoutMode === "cluster";
  layoutToggle.setAttribute("aria-pressed", String(clustered));
  layoutToggle.textContent = clustered ? "scatter words" : "group by genre";
}

function renderConcepts(concepts) {
  const weights = concepts.map(({ weight }) => weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const fragment = document.createDocumentFragment();

  concepts.forEach((concept, index) => {
    const mix = normalizeMix(concept);
    const hasSound = hasIndividualSound(mix);
    const word = document.createElement(hasSound ? "button" : "p");
    const size = visualSize(concept, minWeight, maxWeight);
    const mobileSize = mobileVisualSize(size);
    const tilt = ((labelHash(concept.label) % 9) - 4) * 0.35;

    word.className = "concept";
    if (hasSound) {
      word.type = "button";
      word.dataset.sound = "true";
      word.dataset.playing = "false";
      word.setAttribute("aria-pressed", "false");
      word.setAttribute("aria-label", `Play sound for ${concept.label}`);
    }
    word.dataset.category = concept.category;
    word.dataset.mix = JSON.stringify(mix);
    word.dataset.sourceIndex = String(index);
    word.dataset.baseSize = size.toFixed(3);
    word.dataset.baseMobileSize = mobileSize.toFixed(3);
    word.textContent = concept.label;
    word.style.setProperty("--concept-size", `${size.toFixed(2)}rem`);
    word.style.setProperty("--concept-size-mobile", `${mobileSize.toFixed(2)}rem`);
    word.style.setProperty("--concept-weight", categoryWeight[concept.category] || 600);
    word.style.setProperty("--concept-tilt", `${tilt.toFixed(2)}deg`);
    word.style.setProperty("--concept-delay", `${Math.min(index * 45, 480)}ms`);
    fragment.append(word);
  });

  field.replaceChildren(fragment);
  field.setAttribute("aria-busy", "false");
  count.textContent = `${concepts.length} words / AI-generated`;
  layoutToggle.disabled = false;
  mapPlaybackToggle.disabled = false;
  audio.prepareAudioBuffers().catch((error) => {
    console.error("Could not prepare map music", error);
  });
  applyMixer();
  requestAnimationFrame(() => layoutWords(field, layoutMode, scatterSeed));
}

async function loadConceptMap() {
  try {
    renderConcepts(await loadConceptData());
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
  updateLayoutToggle();
  layoutWords(field, layoutMode, scatterSeed);
});

mapPlaybackToggle.addEventListener("click", audio.toggleMapPlayback);

mixerToggle.addEventListener("click", () => {
  setMixerDrawerOpen(mixerToggle.getAttribute("aria-expanded") !== "true");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mixerToggle.getAttribute("aria-expanded") === "true") {
    setMixerDrawerOpen(false);
    mixerToggle.focus();
  }
});

mixerInputs.forEach((input) => {
  input.addEventListener("input", () => {
    applyMixer();
    if (soundAxes.includes(input.dataset.mixAxis)) {
      audio.updateSoundVolume(input.dataset.mixAxis);
    }
  });
});

mixerReset.addEventListener("click", () => {
  mixerInputs.forEach((input) => {
    input.value = "100";
  });
  applyMixer();
  soundAxes.forEach(audio.updateSoundVolume);
});

field.addEventListener("click", (event) => {
  const word = event.target.closest(".concept[data-sound]");
  if (!word || !field.contains(word)) return;
  audio.toggleConceptSound(word);
});

window.addEventListener("resize", () => {
  const nextWidth = window.innerWidth;
  if (Math.abs(nextWidth - lastLayoutWidth) < 16) return;

  lastLayoutWidth = nextWidth;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => layoutWords(field, layoutMode, scatterSeed), 160);
});

updateLayoutToggle();
updateMapPlaybackState(false);
setMixerDrawerOpen(!window.matchMedia("(max-width: 44rem)").matches);
loadConceptMap();
