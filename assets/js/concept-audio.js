// 単語クリックと「PLAY THIS MAP」のWeb Audio処理。
import {
  clamp,
  labelHash,
  seededRandom,
} from "./concept-data.js";

const researchMaterialUrls = {
  writing: new URL("../audio/research-writing.mp3", import.meta.url),
  keyboard: new URL("../audio/research-keyboard.mp3", import.meta.url),
  charge: new URL("../audio/research-charge.mp3", import.meta.url),
};

const createMaterialUrls = {
  page: new URL("../audio/turning_page.mp3", import.meta.url),
};

const playSoundUrls = {
  1: new URL("../audio/play-drum-1.mp3", import.meta.url),
  2: new URL("../audio/play-drum-2.mp3", import.meta.url),
  3: new URL("../audio/play-drum-3.mp3", import.meta.url),
};

const exploreSoundUrls = {
  0: new URL("../audio/explore-0-2.mp3", import.meta.url),
  1: new URL("../audio/explore-1.mp3", import.meta.url),
  2: new URL("../audio/explore-2.mp3", import.meta.url),
};

const mapStemUrls = {
  research: new URL("../audio/map-research.mp3", import.meta.url),
  create: new URL("../audio/map-create.mp3", import.meta.url),
  play: new URL("../audio/map-play.mp3", import.meta.url),
  explore: new URL("../audio/map-explore.mp3", import.meta.url),
  reflect: new URL("../audio/map-reflect.mp3", import.meta.url),
};

const mapBedUrls = {
  walk: new URL("../audio/map-walk.mp3", import.meta.url),
};

const mapBedVolumes = { walk: 2 };
export const soundAxes = Object.keys(mapStemUrls);
export const soundVolumeScales = {
  research: 2,
  create: 2,
  play: 1,
  explore: 0.6,
  reflect: 4,
};

export function hasIndividualSound(mix) {
  if (["research", "create", "play"].some((axis) => mix[axis] > 0)) return true;
  const exploreLevel = clamp(Math.round(Number(mix.explore)), 0, 3);
  return Object.hasOwn(exploreSoundUrls, exploreLevel);
}

function researchPattern(label, level, phraseDuration, writingDuration) {
  const random = seededRandom(labelHash(label));
  const writingStart = random() * Math.max(0, writingDuration - phraseDuration);
  const slots = Array.from({ length: 14 }, (_, index) => index + 1);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
  }

  const hitCount = { 1: 0, 2: 4, 3: 8 }[level];
  const keyboardTimes = slots
    .slice(0, hitCount)
    .map((slot) => slot * phraseDuration / 16)
    .sort((first, second) => first - second);
  const chargeTime = level < 3 ? undefined : 0;
  return { writingStart, keyboardTimes, chargeTime };
}

function createPattern(label, phraseDuration) {
  const random = seededRandom(labelHash(label));
  const slots = Array.from({ length: 3 }, (_, index) => index + 1);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
  }

  return slots
    .slice(0, 1)
    .map((slot) => slot * phraseDuration / 4)
    .sort((first, second) => first - second);
}

function setConceptWordPlaying(word, playing) {
  if (!word) return;
  word.dataset.playing = String(playing);
  word.setAttribute("aria-pressed", String(playing));
  word.setAttribute("aria-label", `${playing ? "Stop" : "Play"} sound for ${word.textContent}`);
}

function stopSources(sources) {
  sources.forEach((source) => {
    try {
      source.stop();
    } catch {
      // すでに終了したAudioBufferSourceNodeは停止できない。
    }
    source.disconnect();
  });
}

function connectWithGain(context, source, destination, volume) {
  const gainNode = context.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode).connect(destination);
}

export function createAudioController({ field, getMixerVolume, onMapPlaybackChange }) {
  let audioContext;
  let audioBuffersPromise;
  let activeConceptWord;
  let conceptPlaybackId = 0;
  let conceptSources = [];
  let conceptGainNodes = {};
  let mapPlaybackId = 0;
  let mapPlaybackActive = false;
  let mapSources = [];
  let mapGainNodes = {};
  let mapWordTimers = [];
  let activeMapWord;

  function getAudioContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is not supported");
      audioContext = new AudioContextClass();
    }
    return audioContext;
  }

  async function loadAudioBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url.pathname}: HTTP ${response.status}`);
    return getAudioContext().decodeAudioData(await response.arrayBuffer());
  }

  function prepareAudioBuffers() {
    if (audioBuffersPromise) return audioBuffersPromise;

    const urls = [];
    Object.entries(researchMaterialUrls).forEach(([name, url]) => {
      urls.push([`research:${name}`, url]);
    });
    Object.entries(createMaterialUrls).forEach(([name, url]) => {
      urls.push([`create:${name}`, url]);
    });
    Object.entries(playSoundUrls).forEach(([level, url]) => {
      urls.push([`play:${level}`, url]);
    });
    Object.entries(exploreSoundUrls).forEach(([level, url]) => {
      urls.push([`explore:${level}`, url]);
    });
    Object.entries(mapStemUrls).forEach(([axis, url]) => {
      urls.push([`map:${axis}`, url]);
    });
    Object.entries(mapBedUrls).forEach(([name, url]) => {
      urls.push([`map-bed:${name}`, url]);
    });

    audioBuffersPromise = Promise.all(urls.map(async ([key, url]) => {
      return [key, await loadAudioBuffer(url)];
    })).then((entries) => Object.fromEntries(entries));
    return audioBuffersPromise;
  }

  function updateSoundVolume(axis) {
    const volume = getMixerVolume(axis);
    const gainNodes = [conceptGainNodes[axis], mapGainNodes[axis]].filter(Boolean);
    gainNodes.forEach((gainNode) => {
      gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.015);
    });
  }

  function clearMapWordHighlight() {
    mapWordTimers.forEach((timer) => window.clearTimeout(timer));
    mapWordTimers = [];
    if (activeMapWord) activeMapWord.dataset.mapPlaying = "false";
    activeMapWord = undefined;
  }

  function mapPlaybackWords() {
    return [...field.querySelectorAll(".concept")].sort((first, second) => {
      const firstMix = JSON.parse(first.dataset.mix);
      const secondMix = JSON.parse(second.dataset.mix);
      return firstMix.play - secondMix.play
        || firstMix.research - secondMix.research
        || Number(first.dataset.sourceIndex) - Number(second.dataset.sourceIndex);
    });
  }

  function scheduleMapWordHighlights(playbackId, startTime, phraseDuration) {
    clearMapWordHighlight();
    mapPlaybackWords().forEach((word, index) => {
      const delay = Math.max(0, startTime + index * phraseDuration - audioContext.currentTime);
      const timer = window.setTimeout(() => {
        if (playbackId !== mapPlaybackId || !mapPlaybackActive) return;
        if (activeMapWord) activeMapWord.dataset.mapPlaying = "false";
        word.dataset.mapPlaying = "true";
        activeMapWord = word;
      }, delay * 1000);
      mapWordTimers.push(timer);
    });
  }

  function finishConceptPlayback(playbackId) {
    if (playbackId !== conceptPlaybackId) return;
    conceptPlaybackId += 1;
    setConceptWordPlaying(activeConceptWord, false);
    activeConceptWord = undefined;
    conceptSources = [];
    conceptGainNodes = {};
  }

  function stopConceptSound() {
    conceptPlaybackId += 1;
    stopSources(conceptSources);
    conceptSources = [];
    conceptGainNodes = {};
    setConceptWordPlaying(activeConceptWord, false);
    activeConceptWord = undefined;
  }

  async function playConceptSound(word) {
    stopConceptSound();
    const playbackId = conceptPlaybackId;
    const context = getAudioContext();
    const resumePromise = context.resume();
    const buffersPromise = prepareAudioBuffers();
    const mix = JSON.parse(word.dataset.mix);

    activeConceptWord = word;
    setConceptWordPlaying(word, true);

    try {
      const [, buffers] = await Promise.all([resumePromise, buffersPromise]);
      if (playbackId !== conceptPlaybackId) return;

      const startTime = context.currentTime + 0.03;
      const conceptCount = field.querySelectorAll(".concept").length;
      const phraseDuration = buffers["map:research"].duration / conceptCount;
      const researchLevel = clamp(Math.round(Number(mix.research)), 0, 3);
      if (researchLevel > 0) {
        const researchGain = context.createGain();
        researchGain.gain.value = getMixerVolume("research");
        researchGain.connect(context.destination);
        conceptGainNodes.research = researchGain;

        const writingBuffer = buffers["research:writing"];
        const keyboardBuffer = buffers["research:keyboard"];
        const chargeBuffer = buffers["research:charge"];
        const pattern = researchPattern(
          word.textContent,
          researchLevel,
          phraseDuration,
          writingBuffer.duration,
        );

        const writingSource = context.createBufferSource();
        writingSource.buffer = writingBuffer;
        connectWithGain(context, writingSource, researchGain, 0.42);
        writingSource.start(startTime, pattern.writingStart, phraseDuration);
        conceptSources.push(writingSource);

        pattern.keyboardTimes.forEach((keyTime) => {
          const keyboardSource = context.createBufferSource();
          keyboardSource.buffer = keyboardBuffer;
          connectWithGain(context, keyboardSource, researchGain, 0.72);
          keyboardSource.start(startTime + keyTime);
          keyboardSource.stop(startTime + phraseDuration);
          conceptSources.push(keyboardSource);
        });

        if (pattern.chargeTime !== undefined) {
          const chargeSource = context.createBufferSource();
          chargeSource.buffer = chargeBuffer;
          connectWithGain(context, chargeSource, researchGain, 0.8);
          chargeSource.start(startTime + pattern.chargeTime);
          chargeSource.stop(startTime + phraseDuration);
          conceptSources.push(chargeSource);
        }
      }

      const createLevel = clamp(Math.round(Number(mix.create)), 0, 3);
      if (createLevel > 0) {
        const createGain = context.createGain();
        createGain.gain.value = getMixerVolume("create");
        createGain.connect(context.destination);
        conceptGainNodes.create = createGain;

        const pageBuffer = buffers["create:page"];
        createPattern(word.textContent, phraseDuration).forEach((pageTime) => {
          const pageSource = context.createBufferSource();
          pageSource.buffer = pageBuffer;
          connectWithGain(context, pageSource, createGain, 0.62);
          pageSource.start(startTime + pageTime);
          pageSource.stop(startTime + phraseDuration);
          conceptSources.push(pageSource);
        });
      }

      const playLevel = clamp(Math.round(Number(mix.play)), 0, 3);
      if (playLevel > 0) {
        const playGain = context.createGain();
        playGain.gain.value = getMixerVolume("play");
        playGain.connect(context.destination);
        conceptGainNodes.play = playGain;

        const playSource = context.createBufferSource();
        playSource.buffer = buffers[`play:${playLevel}`];
        playSource.connect(playGain);
        playSource.start(startTime, 0, phraseDuration);
        conceptSources.push(playSource);
      }

      const exploreLevel = clamp(Math.round(Number(mix.explore)), 0, 3);
      if (Object.hasOwn(exploreSoundUrls, exploreLevel)) {
        const exploreGain = context.createGain();
        exploreGain.gain.value = getMixerVolume("explore");
        exploreGain.connect(context.destination);
        conceptGainNodes.explore = exploreGain;

        const exploreSource = context.createBufferSource();
        exploreSource.buffer = buffers[`explore:${exploreLevel}`];
        exploreSource.connect(exploreGain);
        exploreSource.start(startTime, 0, phraseDuration);
        conceptSources.push(exploreSource);
      }

      if (conceptSources.length === 0) {
        finishConceptPlayback(playbackId);
        return;
      }
      const endMarker = context.createBufferSource();
      endMarker.buffer = context.createBuffer(1, 1, context.sampleRate);
      endMarker.connect(context.destination);
      endMarker.start(startTime + phraseDuration);
      endMarker.addEventListener("ended", () => finishConceptPlayback(playbackId));
      conceptSources.push(endMarker);
    } catch (error) {
      console.error("Could not play concept sound", error);
      finishConceptPlayback(playbackId);
    }
  }

  function finishMapPlayback(playbackId) {
    if (playbackId !== mapPlaybackId) return;
    mapPlaybackId += 1;
    mapPlaybackActive = false;
    mapSources = [];
    mapGainNodes = {};
    clearMapWordHighlight();
    onMapPlaybackChange(false);
  }

  function stopMapPlayback() {
    mapPlaybackId += 1;
    stopSources(mapSources);
    mapSources = [];
    mapGainNodes = {};
    mapPlaybackActive = false;
    clearMapWordHighlight();
    onMapPlaybackChange(false);
  }

  async function startMapPlayback() {
    stopConceptSound();
    const playbackId = mapPlaybackId;
    const context = getAudioContext();
    const resumePromise = context.resume();
    const buffersPromise = prepareAudioBuffers();
    mapPlaybackActive = true;
    onMapPlaybackChange(true);

    try {
      const [, buffers] = await Promise.all([resumePromise, buffersPromise]);
      if (playbackId !== mapPlaybackId) return;

      const words = mapPlaybackWords();
      if (words.length === 0) throw new Error("No concept words found");
      const startTime = context.currentTime + 0.05;
      const phraseDuration = buffers["map:research"].duration / words.length;
      scheduleMapWordHighlights(playbackId, startTime, phraseDuration);

      soundAxes.forEach((axis) => {
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        source.buffer = buffers[`map:${axis}`];
        gainNode.gain.value = getMixerVolume(axis);
        source.connect(gainNode).connect(context.destination);
        source.start(startTime);
        mapSources.push(source);
        mapGainNodes[axis] = gainNode;
      });
      Object.keys(mapBedUrls).forEach((name) => {
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        source.buffer = buffers[`map-bed:${name}`];
        gainNode.gain.value = mapBedVolumes[name] ?? 1;
        source.connect(gainNode).connect(context.destination);
        source.start(startTime);
        mapSources.push(source);
      });
      mapSources[0].addEventListener("ended", () => finishMapPlayback(playbackId));
    } catch (error) {
      console.error("Could not play map music", error);
      finishMapPlayback(playbackId);
    }
  }

  function toggleMapPlayback() {
    if (mapPlaybackActive) stopMapPlayback();
    else startMapPlayback();
  }

  function toggleConceptSound(word) {
    const wasPlaying = activeConceptWord === word;
    if (mapPlaybackActive) stopMapPlayback();
    if (wasPlaying) stopConceptSound();
    else playConceptSound(word);
  }

  return {
    prepareAudioBuffers,
    toggleConceptSound,
    toggleMapPlayback,
    updateSoundVolume,
  };
}
