const CASE_TYPES = [
  { id: "W26_H18", shortName: "26×18", width: 26, height: 18 },
  { id: "W39_H18", shortName: "39×18", width: 39, height: 18 },
  { id: "W52_H18", shortName: "52×18", width: 52, height: 18 },
  { id: "W26_H24", shortName: "26×24", width: 26, height: 24 },
  { id: "W39_H24", shortName: "39×24", width: 39, height: 24 },
  { id: "W52_H24", shortName: "52×24", width: 52, height: 24 },
  { id: "W26_H30", shortName: "26×30", width: 26, height: 30 },
  { id: "W39_H30", shortName: "39×30", width: 39, height: 30 },
  { id: "W52_H30", shortName: "52×30", width: 52, height: 30 },
];

const CASE_COLORS = {
  H18: { bg: "#ecfdf5", border: "#34d399", text: "#064e3b" },
  H24: { bg: "#f0f9ff", border: "#38bdf8", text: "#0c4a6e" },
  H30: { bg: "#fffbeb", border: "#fbbf24", text: "#78350f" },
};

const EPSILON = 0.001;
const STORAGE_KEY = "storage-case-layout-v1";

let state = loadSavedLayout() || {
  spaceWidth: 120,
  spaceHeight: 90,
  cases: [],
};

let selectedUid = null;
let dragging = null;
let boardScale = 3;
let notice = "";
let resetConfirming = false;

const app = document.querySelector("#app");

function loadSavedLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cases)) return null;

    return {
      spaceWidth: Number(parsed.spaceWidth) || 120,
      spaceHeight: Number(parsed.spaceHeight) || 90,
      cases: parsed.cases.filter(
        (item) => item && item.uid && item.typeId && CASE_TYPES.some((type) => type.id === item.typeId)
      ),
    };
  } catch {
    return null;
  }
}

function saveLayout() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できない環境では、画面上の操作だけ継続します。
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCm(value) {
  return Number.isInteger(value) ? `${value}cm` : `${value.toFixed(1)}cm`;
}

function getCaseType(typeId) {
  return CASE_TYPES.find((type) => type.id === typeId);
}

function canFit(type) {
  return type.width <= state.spaceWidth && type.height <= state.spaceHeight;
}

function getColor(typeId) {
  if (typeId.includes("H18")) return CASE_COLORS.H18;
  if (typeId.includes("H24")) return CASE_COLORS.H24;
  return CASE_COLORS.H30;
}

function createCase(type) {
  return {
    uid: `${type.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    typeId: type.id,
    x: 0,
    y: 0,
    width: type.width,
    height: type.height,
  };
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB - EPSILON && endA > startB + EPSILON;
}

function rectsOverlap(a, b) {
  return (
    rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width) &&
    rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height)
  );
}

function hasCollision(target, cases, ignoreUid) {
  return cases.some((item) => item.uid !== ignoreUid && rectsOverlap(target, item));
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(2))))];
}

function buildSnapCandidates(item, cases, spaceWidth, spaceHeight) {
  const others = cases.filter((caseItem) => caseItem.uid !== item.uid);
  const xValues = [0, spaceWidth - item.width];
  const yValues = [0, spaceHeight - item.height];

  for (const other of others) {
    xValues.push(other.x, other.x + other.width, other.x - item.width, other.x + other.width - item.width);
    yValues.push(other.y, other.y + other.height, other.y - item.height, other.y + other.height - item.height);
  }

  return {
    xValues: uniqueNumbers(xValues).filter((x) => x >= -EPSILON && x <= spaceWidth - item.width + EPSILON),
    yValues: uniqueNumbers(yValues).filter((y) => y >= -EPSILON && y <= spaceHeight - item.height + EPSILON),
  };
}

function findNearestSnappedPosition(item, desiredX, desiredY, cases, spaceWidth, spaceHeight) {
  const clampedDesiredX = clamp(desiredX, 0, Math.max(0, spaceWidth - item.width));
  const clampedDesiredY = clamp(desiredY, 0, Math.max(0, spaceHeight - item.height));
  const { xValues, yValues } = buildSnapCandidates(item, cases, spaceWidth, spaceHeight);
  const candidates = [];

  for (const x of xValues) {
    for (const y of yValues) {
      const candidate = {
        ...item,
        x: clamp(x, 0, Math.max(0, spaceWidth - item.width)),
        y: clamp(y, 0, Math.max(0, spaceHeight - item.height)),
      };

      if (!hasCollision(candidate, cases, item.uid)) {
        const distance = Math.hypot(candidate.x - clampedDesiredX, candidate.y - clampedDesiredY);
        candidates.push({ candidate, score: distance + candidate.y * 0.01 + candidate.x * 0.001 });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.candidate || item;
}

function findBottomLeftAvailablePosition(item, cases, spaceWidth, spaceHeight) {
  const { xValues, yValues } = buildSnapCandidates(item, cases, spaceWidth, spaceHeight);
  const candidates = [];

  for (const y of yValues) {
    for (const x of xValues) {
      const candidate = {
        ...item,
        x: clamp(x, 0, Math.max(0, spaceWidth - item.width)),
        y: clamp(y, 0, Math.max(0, spaceHeight - item.height)),
      };

      if (!hasCollision(candidate, cases, item.uid)) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return candidates[0] || null;
}

function buildLayoutText() {
  const countLines = CASE_TYPES.map((type) => {
    const count = state.cases.filter((item) => item.typeId === type.id).length;
    return count > 0 ? `${type.shortName}: ${count}個` : null;
  }).filter(Boolean);

  const positionLines = [...state.cases]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item, index) => {
      const type = getCaseType(item.typeId);
      return `${index + 1}. ${type?.shortName || item.typeId} 左${formatCm(item.x)} / 下${formatCm(item.y)}`;
    });

  return [
    "収納ケースレイアウト",
    "",
    `収納サイズ: 幅${formatCm(state.spaceWidth)} × 高さ${formatCm(state.spaceHeight)}`,
    "",
    "使用ケース:",
    ...(countLines.length > 0 ? countLines : ["なし"]),
    "",
    "配置:",
    ...(positionLines.length > 0 ? positionLines : ["なし"]),
  ].join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function icon(name) {
  const paths = {
    magnet:
      '<path d="M6 15a6 6 0 0 0 12 0v-3h-4v3a2 2 0 0 1-4 0v-3H6v3Z"/><path d="M6 9V5h4v4"/><path d="M14 9V5h4v4"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    download:
      '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    copy:
      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  };

  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function colorVars(typeId) {
  const color = getColor(typeId);
  return `--case-bg:${color.bg};--case-border:${color.border};--case-text:${color.text};`;
}

function render() {
  const selectedCase = state.cases.find((item) => item.uid === selectedUid) || null;
  const selectedType = selectedCase ? getCaseType(selectedCase.typeId) : null;
  const layoutWarnings = getLayoutWarnings();

  app.innerHTML = `
    <div class="app">
      <div class="shell">
        <header class="header">
          <h1 class="title">収納ケースレイアウト</h1>
        </header>
        <div class="layout">
          <aside class="stack">
            <section class="panel case-panel">
              <div class="panel-body stack">
                <div class="field-grid">
                  <label class="field">幅 cm<input id="space-width" class="input" type="number" min="1" value="${state.spaceWidth}"></label>
                  <label class="field">高さ cm<input id="space-height" class="input" type="number" min="1" value="${state.spaceHeight}"></label>
                </div>
                <div class="case-grid">
                  ${CASE_TYPES.map(
                    (type) => `
                      <button class="case-button" data-add="${type.id}" style="${colorVars(type.id)}" ${
                        type.width <= state.spaceWidth && type.height <= state.spaceHeight ? "" : "disabled"
                      }>
                        ${type.shortName}
                      </button>
                    `
                  ).join("")}
                </div>
                ${notice ? `<div class="notice">${notice}</div>` : ""}
                <div class="layout-warning" ${layoutWarnings.length > 0 ? "" : "hidden"}>
                  <strong>配置を確認してください</strong>
                  <div class="layout-warning-text">${layoutWarnings.join("<br>")}</div>
                </div>
              </div>
            </section>
            <section class="panel size-panel">
              <details class="size-details">
                <summary class="size-toggle">
                  <span>収納サイズ</span>
                  <strong class="size-value">${formatCm(state.spaceWidth)} × ${formatCm(state.spaceHeight)}</strong>
                </summary>
                <div class="panel-body">
                  <div class="field-grid">
                    <label class="field">幅 cm<input id="space-width" class="input" type="number" min="1" value="${state.spaceWidth}"></label>
                    <label class="field">高さ cm<input id="space-height" class="input" type="number" min="1" value="${state.spaceHeight}"></label>
                  </div>
                </div>
              </details>
            </section>
            <section class="panel">
              <div class="panel-body actions">
                ${
                  resetConfirming
                    ? `<div class="confirm-row">
                        <span class="confirm-text">すべて削除しますか？</span>
                        <button class="button ghost" id="cancel-reset">キャンセル</button>
                        <button class="button danger" id="confirm-reset">削除</button>
                      </div>`
                    : `<button class="button" id="compact">${icon("magnet")}自動整列</button>
                      <div class="button-row">
                        <button class="button danger" id="delete-selected" ${selectedCase ? "" : "disabled"}>${icon("trash")}削除${
                          selectedCase ? ` ${selectedType?.shortName || selectedCase.typeId}` : ""
                        }</button>
                        <button class="button ghost" id="request-reset" ${
                          state.cases.length === 0 ? "disabled" : ""
                        }>${icon("trash")}全削除</button>
                      </div>`
                }
              </div>
            </section>
            <section class="panel">
              <div class="panel-body button-row">
                <button class="button" id="save-image" ${state.cases.length === 0 ? "disabled" : ""}>${icon("download")}画像保存</button>
                <button class="button" id="copy-layout" ${state.cases.length === 0 ? "disabled" : ""}>${icon("copy")}配置をコピー</button>
              </div>
            </section>
          </aside>
          <main class="panel board-panel">
            <div class="board-head">
              <h2 class="section-title">配置図</h2>
              <div class="summary">${formatCm(state.spaceWidth)} × ${formatCm(state.spaceHeight)}</div>
            </div>
            <div class="board-scroll" id="board-scroll">
              <div class="board-frame">
                <div id="board" class="board" style="width:${state.spaceWidth * boardScale}px;height:${
                  state.spaceHeight * boardScale
                }px;background-size:${10 * boardScale}px ${10 * boardScale}px;">
                  ${state.cases
                    .map((item) => {
                      const type = getCaseType(item.typeId);
                      const selected = item.uid === selectedUid ? " selected" : "";
                      const active = dragging?.uid === item.uid ? " dragging" : "";
                      return `<button
                        class="case-item${selected}${active}"
                        data-uid="${item.uid}"
                        style="${colorVars(item.typeId)}left:${item.x * boardScale}px;bottom:${
                          item.y * boardScale
                        }px;width:${item.width * boardScale}px;height:${item.height * boardScale}px;"
                        title="${type?.shortName || item.typeId} / 左${item.x}cm 下${item.y}cm"
                      >${type?.shortName || item.typeId}</button>`;
                    })
                    .join("")}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  `;

  app.querySelector(".case-panel .field-grid")?.remove();
  bindEvents();
}

function updateScale() {
  const scroll = document.querySelector("#board-scroll");
  const width = scroll?.clientWidth || 360;
  boardScale = clamp((width - 34) / Math.max(1, state.spaceWidth), 1.8, 4.5);
}

function rerender() {
  const activeId = document.activeElement?.id || "";
  const selectionStart = getSelectionPosition(document.activeElement, "selectionStart");
  const selectionEnd = getSelectionPosition(document.activeElement, "selectionEnd");

  updateScale();
  saveLayout();
  render();

  if (activeId) {
    const nextActiveElement = document.getElementById(activeId);
    nextActiveElement?.focus({ preventScroll: true });
    restoreSelection(nextActiveElement, selectionStart, selectionEnd);
  }
}

function getSelectionPosition(element, key) {
  try {
    return typeof element?.[key] === "number" ? element[key] : null;
  } catch {
    return null;
  }
}

function restoreSelection(element, selectionStart, selectionEnd) {
  if (selectionStart === null || selectionEnd === null) return;

  try {
    element?.setSelectionRange(selectionStart, selectionEnd);
  } catch {
    // Number inputs do not support selection ranges in some browsers.
  }
}

function bindEvents() {
  document.querySelectorAll("#space-width").forEach((input) => input.addEventListener("input", (event) => {
    updateSpaceSize("width", event.target.value);
  }));

  document.querySelectorAll("#space-height").forEach((input) => input.addEventListener("input", (event) => {
    updateSpaceSize("height", event.target.value);
  }));

  document.querySelectorAll("#space-width").forEach((input) => input.addEventListener("blur", (event) => {
    event.target.value = state.spaceWidth;
  }));

  document.querySelectorAll("#space-height").forEach((input) => input.addEventListener("blur", (event) => {
    event.target.value = state.spaceHeight;
  }));

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addCase(button.dataset.add));
  });

  document.querySelector("#compact")?.addEventListener("click", compactLeftBottom);
  document.querySelector("#delete-selected")?.addEventListener("click", deleteSelected);
  document.querySelector("#request-reset")?.addEventListener("click", () => {
    resetConfirming = true;
    render();
  });
  document.querySelector("#cancel-reset")?.addEventListener("click", () => {
    resetConfirming = false;
    render();
  });
  document.querySelector("#confirm-reset")?.addEventListener("click", resetAll);
  document.querySelector("#save-image")?.addEventListener("click", saveImage);
  document.querySelector("#copy-layout")?.addEventListener("click", copyLayout);

  document.querySelectorAll("[data-uid]").forEach((item) => {
    item.addEventListener("pointerdown", startDrag);
    item.addEventListener("pointermove", moveDrag);
    item.addEventListener("pointerup", endDrag);
    item.addEventListener("pointercancel", endDrag);
  });

  document.querySelector("#board")?.addEventListener("pointerdown", clearSelectionFromBoard);
}

function clearSelectionFromBoard(event) {
  if (event.target.closest(".case-item")) return;
  clearSelection();
}

function clearSelection() {
  if (!selectedUid) return;

  selectedUid = null;
  document.querySelectorAll(".case-item.selected").forEach((element) => element.classList.remove("selected"));
  const deleteButton = document.querySelector("#delete-selected");
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.innerHTML = `${icon("trash")}削除`;
  }
}

function updateSpaceSize(axis, rawValue) {
  const nextValue = Number(rawValue);

  if (!Number.isFinite(nextValue) || nextValue < 1) return;

  if (axis === "width") {
    state.spaceWidth = nextValue;
  } else {
    state.spaceHeight = nextValue;
  }

  updateScale();
  updateLayoutView();
  saveLayout();
}

function updateLayoutView() {
  const sizeText = `${formatCm(state.spaceWidth)} × ${formatCm(state.spaceHeight)}`;

  document.querySelectorAll(".summary").forEach((element) => {
    element.textContent = sizeText;
  });

  document.querySelectorAll(".size-value").forEach((element) => {
    element.textContent = sizeText;
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    const type = getCaseType(button.dataset.add);
    button.disabled = !type || !canFit(type);
  });

  const board = document.querySelector("#board");
  if (!board) return;

  board.style.width = `${state.spaceWidth * boardScale}px`;
  board.style.height = `${state.spaceHeight * boardScale}px`;
  board.style.backgroundSize = `${10 * boardScale}px ${10 * boardScale}px`;

  state.cases.forEach((item) => {
    const element = board.querySelector(`[data-uid="${CSS.escape(item.uid)}"]`);
    if (!element) return;

    element.style.left = `${item.x * boardScale}px`;
    element.style.bottom = `${item.y * boardScale}px`;
    element.style.width = `${item.width * boardScale}px`;
    element.style.height = `${item.height * boardScale}px`;
  });

  updateLayoutWarnings();
}

function getLayoutWarnings() {
  const warnings = [];
  const overflowItems = state.cases.filter(
    (item) =>
      item.x < -EPSILON ||
      item.y < -EPSILON ||
      item.x + item.width > state.spaceWidth + EPSILON ||
      item.y + item.height > state.spaceHeight + EPSILON
  );
  const overlapPairs = [];

  for (let index = 0; index < state.cases.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < state.cases.length; nextIndex += 1) {
      if (rectsOverlap(state.cases[index], state.cases[nextIndex])) {
        overlapPairs.push([state.cases[index], state.cases[nextIndex]]);
      }
    }
  }

  if (overflowItems.length > 0) {
    warnings.push(`収納サイズに収まっていないケースがあります。${overflowItems.map(formatCaseLabel).join("、")}`);
  }

  if (overlapPairs.length > 0) {
    warnings.push(
      `ケース同士が重なっています。${overlapPairs
        .map(([a, b]) => `${formatCaseLabel(a)} と ${formatCaseLabel(b)}`)
        .join("、")}`
    );
  }

  return warnings;
}

function formatCaseLabel(item) {
  const type = getCaseType(item.typeId);
  return type?.shortName || item.typeId;
}

function updateLayoutWarnings() {
  const warningElement = document.querySelector(".layout-warning");
  const warningTextElement = document.querySelector(".layout-warning-text");
  if (!warningElement || !warningTextElement) return;

  const warnings = getLayoutWarnings();
  warningElement.hidden = warnings.length === 0;
  warningTextElement.innerHTML = warnings.join("<br>");
}

function addCase(typeId) {
  resetConfirming = false;
  const type = getCaseType(typeId);
  if (!type) return;

  const positionedCase = findBottomLeftAvailablePosition(createCase(type), state.cases, state.spaceWidth, state.spaceHeight);
  if (!positionedCase) {
    notice = `${type.shortName} を置ける空きがありません。`;
    render();
    return;
  }

  state.cases = [...state.cases, positionedCase];
  selectedUid = positionedCase.uid;
  notice = "";
  rerender();
}

function deleteSelected() {
  resetConfirming = false;
  if (!selectedUid) return;
  state.cases = state.cases.filter((item) => item.uid !== selectedUid);
  selectedUid = null;
  notice = "";
  rerender();
}

function resetAll() {
  state.cases = [];
  selectedUid = null;
  notice = "";
  resetConfirming = false;
  rerender();
}

function compactLeftBottom() {
  resetConfirming = false;
  const placed = [];

  for (const item of state.cases) {
    const positioned = findBottomLeftAvailablePosition({ ...item, x: 0, y: 0 }, placed, state.spaceWidth, state.spaceHeight);
    placed.push(positioned || item);
  }

  state.cases = placed;
  notice = "";
  rerender();
}

function startDrag(event) {
  const uid = event.currentTarget.dataset.uid;
  const item = state.cases.find((caseItem) => caseItem.uid === uid);
  if (!item) return;

  resetConfirming = false;
  selectedUid = uid;
  document.querySelectorAll(".case-item").forEach((element) => {
    element.classList.toggle("selected", element.dataset.uid === uid);
    element.classList.remove("dragging");
  });
  event.currentTarget.classList.add("dragging");
  const rect = event.currentTarget.getBoundingClientRect();
  dragging = {
    uid,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragging) return;
  const item = state.cases.find((caseItem) => caseItem.uid === dragging.uid);
  const board = document.querySelector("#board");
  if (!item || !board) return;

  const boardRect = board.getBoundingClientRect();
  const desiredX = (event.clientX - boardRect.left - dragging.offsetX) / boardScale;
  const desiredY = (boardRect.bottom - event.clientY - item.height * boardScale + dragging.offsetY) / boardScale;
  const snapped = findNearestSnappedPosition(item, desiredX, desiredY, state.cases, state.spaceWidth, state.spaceHeight);

  state.cases = state.cases.map((caseItem) =>
    caseItem.uid === item.uid ? { ...caseItem, x: snapped.x, y: snapped.y } : caseItem
  );
  event.currentTarget.style.left = `${snapped.x * boardScale}px`;
  event.currentTarget.style.bottom = `${snapped.y * boardScale}px`;
}

function endDrag(event) {
  if (!dragging) return;
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released by the browser.
  }
  dragging = null;
  notice = "";
  rerender();
}

function saveImage() {
  resetConfirming = false;

  const source = document.querySelector(".board-panel");
  if (!source) return;

  try {
    saveMeasuredLayoutImage(source);
    notice = "";
  } catch {
    notice = "画像保存に失敗しました。ブラウザの制限がある可能性があります。";
    render();
  }
}

function saveMeasuredLayoutImage(source) {
  const sourceRect = source.getBoundingClientRect();
  const width = Math.ceil(sourceRect.width);
  const height = Math.ceil(sourceRect.height);
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  drawBox(ctx, 0, 0, width, height, window.getComputedStyle(source));
  drawHeader(ctx, source);

  const scroll = source.querySelector(".board-scroll");
  const frame = source.querySelector(".board-frame");
  const board = source.querySelector("#board");

  if (!scroll || !frame || !board) return;

  const scrollRect = relativeRect(scroll, sourceRect);
  const frameRect = relativeRect(frame, sourceRect);
  const boardRect = relativeRect(board, sourceRect);
  const boardStyle = window.getComputedStyle(board);

  drawBox(ctx, scrollRect.x, scrollRect.y, scrollRect.width, scrollRect.height, window.getComputedStyle(scroll));
  drawBox(ctx, frameRect.x, frameRect.y, frameRect.width, frameRect.height, window.getComputedStyle(frame));

  ctx.save();
  roundedRect(ctx, boardRect.x, boardRect.y, boardRect.width, boardRect.height, parsePixels(boardStyle.borderRadius));
  ctx.clip();
  drawBoard(ctx, board, boardRect);

  board.querySelectorAll(".case-item").forEach((caseElement) => {
    drawCase(ctx, caseElement, sourceRect);
  });

  ctx.restore();
  downloadCanvas(canvas);
}

function drawHeader(ctx, source) {
  const sourceRect = source.getBoundingClientRect();
  const title = source.querySelector(".section-title");
  const summary = source.querySelector(".board-head .summary");

  if (title) {
    drawElementText(ctx, title, relativeRect(title, sourceRect), "left");
  }

  if (summary) {
    drawElementText(ctx, summary, relativeRect(summary, sourceRect), "right");
  }
}

function drawBoard(ctx, board, rect) {
  const style = window.getComputedStyle(board);
  const scale = rect.width / Math.max(1, state.spaceWidth);

  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = "rgba(31, 41, 51, 0.07)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= state.spaceWidth; x += 10) {
    const px = rect.x + x * scale;
    ctx.beginPath();
    ctx.moveTo(px, rect.y);
    ctx.lineTo(px, rect.y + rect.height);
    ctx.stroke();
  }

  for (let y = 0; y <= state.spaceHeight; y += 10) {
    const py = rect.y + y * scale;
    ctx.beginPath();
    ctx.moveTo(rect.x, py);
    ctx.lineTo(rect.x + rect.width, py);
    ctx.stroke();
  }
}

function drawCase(ctx, caseElement, sourceRect) {
  const rect = relativeRect(caseElement, sourceRect);
  const style = window.getComputedStyle(caseElement);

  drawBox(ctx, rect.x, rect.y, rect.width, rect.height, style);
  drawElementText(ctx, caseElement, rect, "center");
}

function drawElementText(ctx, element, rect, align) {
  const style = window.getComputedStyle(element);
  const text = element.textContent.trim();

  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  const x = align === "right" ? rect.x + rect.width : align === "center" ? rect.x + rect.width / 2 : rect.x;
  ctx.fillText(text, x, rect.y + rect.height / 2);
}

function drawBox(ctx, x, y, width, height, style) {
  const radius = parsePixels(style.borderRadius);
  const borderWidth = Math.max(
    parsePixels(style.borderTopWidth),
    parsePixels(style.borderRightWidth),
    parsePixels(style.borderBottomWidth),
    parsePixels(style.borderLeftWidth)
  );

  if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
    ctx.fillStyle = style.backgroundColor;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fill();
  }

  if (borderWidth > 0 && style.borderTopColor && style.borderTopStyle !== "none") {
    const inset = borderWidth / 2;
    ctx.strokeStyle = style.borderTopColor;
    ctx.lineWidth = borderWidth;
    roundedRect(ctx, x + inset, y + inset, width - borderWidth, height - borderWidth, Math.max(0, radius - inset));
    ctx.stroke();
  }
}

function relativeRect(element, parentRect) {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left - parentRect.left,
    y: rect.top - parentRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function parsePixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function downloadCanvas(canvas) {
  const link = document.createElement("a");
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(
    2,
    "0"
  )}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  link.download = `storage-case-layout-${timestamp}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function copyLayout() {
  resetConfirming = false;
  if (state.cases.length === 0) return;

  try {
    const copied = await copyTextToClipboard(buildLayoutText());
    notice = copied ? "配置テキストをコピーしました。" : "コピーできませんでした。手動で選択してコピーしてください。";
  } catch {
    notice = "コピーできませんでした。ブラウザの制限がある可能性があります。";
  }
  render();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

window.addEventListener("resize", () => {
  updateScale();
  updateLayoutView();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearSelection();
  }
});

render();
updateScale();
updateLayoutView();
