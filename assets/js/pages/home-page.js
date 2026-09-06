// Homeページ専用。Conceptの装飾語と最新note／YouTubeを読み込む。
import {
  categoryWeight,
  loadConceptData,
  mobileVisualSize,
  visualSize,
} from "../concept-data.js";

const sectionConceptGroups = [...document.querySelectorAll(".section-concept-words")];
const latestVideoPlayer = document.querySelector("#latest-video-player");
const latestVideoLink = document.querySelector("#latest-video-link");
const latestVideoDate = document.querySelector("#latest-video-date");
const latestNoteLink = document.querySelector("#latest-note-link");
const latestNoteExcerpt = document.querySelector("#latest-note-excerpt");
const latestNoteDate = document.querySelector("#latest-note-date");

function renderSectionConcepts(concepts) {
  const weights = concepts.map(({ weight }) => weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);

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

async function loadHomeConcepts() {
  try {
    renderSectionConcepts(await loadConceptData());
  } catch (error) {
    console.error("Could not load concept words", error);
  }
}

async function loadLatestNote() {
  if (!latestNoteLink || !latestNoteExcerpt || !latestNoteDate) return;

  try {
    const response = await fetch(new URL("../../../data/note-feed.json", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    const latest = articles
      .filter((article) => article.title && article.url)
      .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))[0];
    if (!latest) throw new Error("No note articles found");

    const articleUrl = new URL(latest.url);
    if (articleUrl.protocol !== "https:" || articleUrl.hostname !== "note.com") {
      throw new Error("Unexpected note article URL");
    }
    latestNoteLink.href = articleUrl.href;
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
    const response = await fetch(new URL("../../../data/youtube-feed.json", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const videos = Array.isArray(payload.videos) ? payload.videos : [];
    const latest = videos
      .filter((video) => /^[A-Za-z0-9_-]{11}$/.test(video.id) && video.title)
      .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))[0];
    if (!latest) throw new Error("No YouTube videos found");

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${latest.id}`;
    iframe.title = `YouTube: ${latest.title}`;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    latestVideoPlayer.replaceChildren(iframe);

    latestVideoLink.href = `https://www.youtube.com/watch?v=${latest.id}`;
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

loadHomeConcepts();
loadLatestVideo();
loadLatestNote();
