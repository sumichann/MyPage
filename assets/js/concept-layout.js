// Concept Mapの座標計算。このファイルは音やボタンの状態を扱わない。
import {
  categoryOrder,
  clamp,
  labelHash,
  seededRandom,
} from "./concept-data.js";

function layoutBounds(field) {
  const mobile = field.clientWidth <= 704;
  const side = mobile ? 14 : 36;
  return {
    left: side,
    right: field.clientWidth - side,
    top: mobile ? 205 : 72,
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

function sizeField(field, measurements) {
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

function scatterPositions(field, measurements, bounds, scatterSeed) {
  const random = seededRandom(scatterSeed ^ field.clientWidth ^ field.clientHeight);
  const placed = [];
  const positions = new Map();
  const largestFirst = [...measurements].sort((first, second) => {
    return second.width * second.height - first.width * first.height;
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

function clusterPositions(field, measurements, bounds) {
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
    const group = groups.get(category).sort((first, second) => {
      return second.width * second.height - first.width * first.height;
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

export function layoutWords(field, layoutMode, scatterSeed) {
  const words = [...field.querySelectorAll(".concept")];
  if (words.length === 0) return;

  field.style.height = "";
  const measurements = measureWords(words);
  sizeField(field, measurements);
  const bounds = layoutBounds(field);
  const positions = layoutMode === "cluster"
    ? clusterPositions(field, measurements, bounds)
    : scatterPositions(field, measurements, bounds, scatterSeed);

  field.dataset.layout = layoutMode;
  positions.forEach((position, word) => {
    word.style.left = `${position.x.toFixed(1)}px`;
    word.style.top = `${position.y.toFixed(1)}px`;
    word.dataset.positioned = "true";
  });
}
