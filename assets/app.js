const field = document.querySelector("#concept-field");
const count = document.querySelector("#concept-count");
const layoutToggle = document.querySelector("#layout-toggle");
const mixerPanel = document.querySelector("#human-mixer");
const mixerToggle = document.querySelector("#mixer-toggle");
const mixerToggleIcon = document.querySelector("#mixer-toggle-icon");
const mixerReset = document.querySelector("#mixer-reset");
const mixerInputs = [...document.querySelectorAll("[data-mix-axis]")];
const researchMixerInput = document.querySelector("[data-mix-axis='research']");
const sectionConceptGroups = [...document.querySelectorAll(".section-concept-words")];
const latestVideoPlayer = document.querySelector("#latest-video-player");
const latestVideoLink = document.querySelector("#latest-video-link");
const latestVideoDate = document.querySelector("#latest-video-date");
const latestNoteLink = document.querySelector("#latest-note-link");
const latestNoteExcerpt = document.querySelector("#latest-note-excerpt");
const latestNoteDate = document.querySelector("#latest-note-date");

const mixAxes = ["research", "create", "play", "explore", "reflect"];

const categoryOrder = [
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

const categoryWeight = {
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

let layoutMode = "scatter";
let scatterSeed = createSeed();
let resizeTimer;
let lastLayoutWidth = window.innerWidth;
let researchSound;
let activeResearchWord;

const researchSoundUrls = {
  1: new URL("./audio/research-drum-1.mp3", import.meta.url),
  2: new URL("./audio/research-drum-2.mp3", import.meta.url),
  3: new URL("./audio/research-drum-3.mp3", import.meta.url),
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

function mobileVisualSize(size) {
  return Math.min(1.38, Math.max(0.48, size * 0.34));
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

function normalizeMix(concept) {
  const fallback = fallbackMixByCategory[concept.category] || fallbackMixByCategory.identity;
  return Object.fromEntries(mixAxes.map((axis) => {
    const score = Number(concept.mix?.[axis]);
    return [axis, Number.isFinite(score) ? clamp(score, 0, 3) : fallback[axis]];
  }));
}

function setResearchWordPlaying(word, playing) {
  if (!word) return;
  word.dataset.playing = String(playing);
  word.setAttribute("aria-pressed", String(playing));
  word.setAttribute(
    "aria-label",
    `${playing ? "Stop" : "Play"} research level ${word.dataset.soundLevel} sound for ${word.textContent}`,
  );
}

function updateResearchSoundVolume() {
  if (!researchSound) return;
  const mixerValue = Number(researchMixerInput?.value ?? 100);
  researchSound.volume = clamp(mixerValue / 200, 0, 1);
}

function stopResearchSound() {
  if (researchSound) {
    researchSound.pause();
    researchSound.currentTime = 0;
  }
  setResearchWordPlaying(activeResearchWord, false);
  activeResearchWord = undefined;
}

// research要素を持つ単語から、共通のドラム1小節を再生する
function toggleResearchSound(word) {
  if (activeResearchWord === word) {
    stopResearchSound();
    return;
  }

  stopResearchSound();

  const level = clamp(Math.round(Number(word.dataset.soundLevel)), 1, 3);
  const soundUrl = researchSoundUrls[level];

  if (!researchSound) {
    researchSound = new Audio();
    researchSound.preload = "none";
    researchSound.addEventListener("ended", stopResearchSound);
  }

  researchSound.src = soundUrl.href;
  updateResearchSoundVolume();
  activeResearchWord = word;
  setResearchWordPlaying(word, true);
  researchSound.currentTime = 0;
  researchSound.play().catch((error) => {
    console.info("Research sound is not available yet", error);
    if (activeResearchWord === word) stopResearchSound();
  });
}

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

function setMixerDrawerOpen(open) {
  if (!mixerPanel || !mixerToggle) return;
  mixerPanel.dataset.open = String(open);
  mixerToggle.setAttribute("aria-expanded", String(open));
  if (mixerToggleIcon) mixerToggleIcon.textContent = open ? "↓" : "↑";
}

function applyMixer() {
  if (!field) return;
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
  const clusterColumns = field.clientWidth <= 560 ? 2 : 3;
  const clusterRows = Math.ceil(activeCategories / clusterColumns);
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
    ? Math.min(2, categories.length)
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
  if (!layoutToggle) return;
  // "cluster"の時はtrue、"scatter"の時はfalse
  const clustered = layoutMode === "cluster";
  layoutToggle.setAttribute("aria-pressed", String(clustered));
  layoutToggle.textContent = clustered ? "scatter words" : "group by genre";
}

function layoutWords() {
  if (!field) return;
  // field内の.concept要素を取得
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
  // 実際に配置
  positions.forEach((position, word) => {
    word.style.left = `${position.x.toFixed(1)}px`;
    word.style.top = `${position.y.toFixed(1)}px`;
    word.dataset.positioned = "true";
  });
}

// LPのsectionごとのconcept wordをレンダリングする
function renderSectionConcepts(concepts, minWeight, maxWeight) {
  sectionConceptGroups.forEach((group) => {
    const categories = new Set(group.dataset.conceptCategories.split(/\s+/));
    const fragment = document.createDocumentFragment();

    concepts
      .filter((concept) => categories.has(concept.category))
      .forEach((concept) => {
        const word = document.createElement("span");
        const size = visualSize(concept, minWeight, maxWeight);
        word.className = "section-concept-word";
        word.dataset.category = concept.category;
        word.textContent = concept.label;
        word.style.setProperty("--section-concept-size", `${(size * 0.68).toFixed(2)}rem`);
        word.style.setProperty("--section-concept-size-mobile", `${mobileVisualSize(size).toFixed(2)}rem`);
        word.style.setProperty("--concept-weight", categoryWeight[concept.category] || 600);
        fragment.append(word);
      });

    group.replaceChildren(fragment);
  });
}

// concepts.jsonの内容をもとに、conceptsをレンダリングする
function renderConcepts(concepts) {
  const weights = concepts.map(({ weight }) => weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  renderSectionConcepts(concepts, minWeight, maxWeight);
  if (!field) return;
  const fragment = document.createDocumentFragment();

  concepts.forEach((concept, index) => {
    const mix = normalizeMix(concept);
    const hasResearchSound = mix.research > 0;
    const word = document.createElement(hasResearchSound ? "button" : "p");
    const hash = labelHash(concept.label);
    const tilt = ((hash % 9) - 4) * 0.35;

    word.className = "concept";
    if (hasResearchSound) {
      word.type = "button";
      word.dataset.sound = "research";
      word.dataset.soundLevel = String(mix.research);
      word.dataset.playing = "false";
      word.setAttribute("aria-pressed", "false");
      word.setAttribute(
        "aria-label",
        `Play research level ${mix.research} sound for ${concept.label}`,
      );
    }
    word.dataset.category = concept.category;
    word.textContent = concept.label;
    const size = visualSize(concept, minWeight, maxWeight);
    const mobileSize = mobileVisualSize(size);
    word.dataset.mix = JSON.stringify(mix);
    word.dataset.baseSize = size.toFixed(3);
    word.dataset.baseMobileSize = mobileSize.toFixed(3);
    word.style.setProperty("--concept-size", `${size.toFixed(2)}rem`);
    word.style.setProperty("--concept-size-mobile", `${mobileSize.toFixed(2)}rem`);
    word.style.setProperty("--concept-weight", categoryWeight[concept.category] || 600);
    word.style.setProperty("--concept-tilt", `${tilt.toFixed(2)}deg`);
    word.style.setProperty("--concept-delay", `${Math.min(index * 45, 480)}ms`);
    fragment.append(word);
  });

  field.replaceChildren(fragment);
  field.setAttribute("aria-busy", "false");
  if (count) count.textContent = `${concepts.length} words / AI-generated`;
  if (layoutToggle) layoutToggle.disabled = false;
  applyMixer();
  requestAnimationFrame(layoutWords);
}

// concepts.jsonを読み込んで、conceptsをレンダリングする
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
    if (!field) return;
    const message = document.createElement("p");
    message.className = "loading error";
    message.textContent = "words could not be loaded.";
    field.replaceChildren(message);
    field.setAttribute("aria-busy", "false");
  }
}

async function loadLatestNote() {
  // 必要な3要素がすべて存在する場合のみ続行
  if (!latestNoteLink || !latestNoteExcerpt || !latestNoteDate) return;

  try {
    const response = await fetch(new URL("../data/note-feed.json", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    // 最新記事を取得
    const latest = articles
      .filter((article) => article.title && article.url)
      .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))[0];
    if (!latest) throw new Error("No note articles found");
    // URLの検証
    const articleUrl = new URL(latest.url);
    if (articleUrl.protocol !== "https:" || articleUrl.hostname !== "note.com") {
      throw new Error("Unexpected note article URL");
    }
    // latestNoteLink: htmlからa要素を取得したもの
    // リンクを置き換える
    latestNoteLink.href = articleUrl.href;
    // querySelectorで取得した要素のtextContentを置き換える
    latestNoteLink.textContent = `${latest.title} ↗`;

    const description = String(latest.description || "")
      .replace(/続きをみる\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (description) {
      const maximumLength = 140;
      latestNoteExcerpt.textContent = description.length > maximumLength
        ? `${description.slice(0, maximumLength).trimEnd()}…`
        : description;
      latestNoteExcerpt.hidden = false;
    }

    const publishedAt = new Date(latest.publishedAt);
    if (!Number.isNaN(publishedAt.getTime())) {
      latestNoteDate.dateTime = publishedAt.toISOString();
      latestNoteDate.textContent = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(publishedAt);
    }
  } catch (error) {
    console.error("Could not load latest note article", error);
  }
}

async function loadLatestVideo() {
  if (!latestVideoPlayer || !latestVideoLink || !latestVideoDate) return;

  try {
    const response = await fetch(new URL("../data/youtube-feed.json", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const videos = Array.isArray(payload.videos) ? payload.videos : [];
    const latest = videos
      .filter((video) => /^[A-Za-z0-9_-]{11}$/.test(video.id) && video.title)
      .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))[0];
    if (!latest) throw new Error("No YouTube videos found");

    const watchUrl = `https://www.youtube.com/watch?v=${latest.id}`;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${latest.id}`;
    iframe.title = `YouTube: ${latest.title}`;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    // 空のプレイヤー領域にiframeを追加する
    latestVideoPlayer.replaceChildren(iframe);

    latestVideoLink.href = watchUrl;
    latestVideoLink.textContent = `${latest.title} ↗`;

    const publishedAt = new Date(latest.publishedAt);
    if (!Number.isNaN(publishedAt.getTime())) {
      latestVideoDate.dateTime = publishedAt.toISOString();
      latestVideoDate.textContent = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(publishedAt);
    }
  } catch (error) {
    console.error("Could not load latest YouTube video", error);
  }
}

// concepts.htmlの切り替えボタンの処理
layoutToggle?.addEventListener("click", () => {
  layoutMode = layoutMode === "scatter" ? "cluster" : "scatter";
  if (layoutMode === "scatter") scatterSeed = createSeed();
  // 名前変える
  updateToggle();
  // 再配置
  layoutWords();
});

mixerToggle?.addEventListener("click", () => {
  setMixerDrawerOpen(mixerToggle.getAttribute("aria-expanded") !== "true");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mixerToggle?.getAttribute("aria-expanded") === "true") {
    setMixerDrawerOpen(false);
    mixerToggle.focus();
  }
});

mixerInputs.forEach((input) => {
  input.addEventListener("input", () => {
    applyMixer();
    if (input === researchMixerInput) updateResearchSoundVolume();
  });
});

mixerReset?.addEventListener("click", () => {
  mixerInputs.forEach((input) => {
    input.value = "100";
  });
  applyMixer();
  updateResearchSoundVolume();
});

field?.addEventListener("click", (event) => {
  const word = event.target.closest(".concept[data-sound='research']");
  if (!word || !field.contains(word)) return;
  toggleResearchSound(word);
});

window.addEventListener("resize", () => {
  if (!field) return;
  const nextWidth = window.innerWidth;
  if (Math.abs(nextWidth - lastLayoutWidth) < 16) return;

  lastLayoutWidth = nextWidth;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(layoutWords, 160);
});

// 初期状態
updateToggle();
setMixerDrawerOpen(false);
// concepts.jsonを読み込む
loadConcepts();

// 最新の動画と記事を読み込む
loadLatestVideo();
loadLatestNote();
