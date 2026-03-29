const $ = (sel) => document.querySelector(sel);

const els = {
  badge: $("#badge"),
  btnOpenDrawer: $("#btnOpenDrawer"),

  screenTitle: $("#screenTitle"),
  screenGame: $("#screenGame"),
  btnStart: $("#btnStart"),

  qText: $("#qText"),
  qHero: $("#qHero"),
  grid: $("#grid"),

  result: $("#result"),
  resLine1: $("#resLine1"),
  resName: $("#resName"),
  resKana: $("#resKana"),
  resLine2: $("#resLine2"),
  btnNext: $("#btnNext"),

  mapStage: $("#mapStage"),
  japanMap: $("#japanMap"),
  mapPrefName: $("#mapPrefName"),
  mapPrefKana: $("#mapPrefKana"),
  btnMapNext: $("#btnMapNext"),
};

const PREFS_JSON_PATH = "data/prefs.json";

let PREFS = [];
let PREFS_BY_REGION = new Map();
let lastRegions = [];
let lastPrefId = null;

let current = null;
let questionToken = 0;

let svgDoc = null;
let svgRoot = null;
let mapReady = false;
let currentMapTarget = null;
let currentOutlinedNodes = [];
let defaultViewBox = "";
let currentMapSeq = 0;

function setBadge(text) {
  if (els.badge) els.badge.textContent = text;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showScreen(name) {
  const isTitle = name === "title";
  const isGame = name === "game";

  if (els.screenTitle) {
    els.screenTitle.hidden = !isTitle;
    els.screenTitle.classList.toggle("screenActive", isTitle);
  }

  if (els.screenGame) {
    els.screenGame.hidden = !isGame;
    els.screenGame.classList.toggle("screenActive", isGame);
  }
}

function hideResult() {
  if (els.result) els.result.hidden = true;
}

function showResult() {
  if (els.result) els.result.hidden = false;
}

function hideMapStage() {
  if (els.mapStage) els.mapStage.hidden = true;
  resetMapStageTexts();
  clearMapHighlight();
  resetMapView();
}

function showMapStage() {
  if (els.mapStage) els.mapStage.hidden = false;
}

function resetMapStageTexts() {
  if (els.mapPrefName) {
    els.mapPrefName.hidden = true;
    els.mapPrefName.classList.remove("show");
    els.mapPrefName.textContent = "";
  }
  if (els.mapPrefKana) {
    els.mapPrefKana.hidden = true;
    els.mapPrefKana.classList.remove("show");
    els.mapPrefKana.textContent = "";
  }
}

function clearQuestionHero() {
  if (!els.qHero) return;
  els.qHero.classList.remove("show", "hide");
  els.qHero.textContent = "";
}

function resetQuestionArea() {
  if (els.qText) els.qText.textContent = "";
}

function normalizePrefs(raw) {
  const prefs = Array.isArray(raw?.prefs) ? raw.prefs : [];
  return prefs
    .map((p) => ({
      id: Number(p.id),
      code: String(p.code || "").padStart(2, "0"),
      kanji: String(p.kanji || ""),
      kana: String(p.kana || ""),
      romaji: String(p.romaji || ""),
      svgId: String(p.svgId || ""),
      regionId: String(p.regionId || ""),
      regionLabel: String(p.regionLabel || ""),
      silhouette: p.silhouette || null,
      mapHighlight: p.mapHighlight || null,
    }))
    .filter((p) => p.id && p.code && p.kanji && p.kana && p.silhouette);
}

async function loadPrefs() {
  const res = await fetch(PREFS_JSON_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`prefs.json の読み込みに失敗しました: ${res.status}`);
  }

  const json = await res.json();
  PREFS = normalizePrefs(json);

  PREFS_BY_REGION = new Map();
  for (const p of PREFS) {
    if (!PREFS_BY_REGION.has(p.regionId)) {
      PREFS_BY_REGION.set(p.regionId, []);
    }
    PREFS_BY_REGION.get(p.regionId).push(p);
  }
}

function pickRegionBalanced() {
  const regions = [...PREFS_BY_REGION.keys()];
  const avoid = new Set(lastRegions.slice(-2));
  let candidates = regions.filter((r) => !avoid.has(r));
  if (!candidates.length) candidates = regions;

  const recentCount = (rid) => lastRegions.filter((x) => x === rid).length;
  candidates.sort((a, b) => recentCount(a) - recentCount(b));

  const bestScore = recentCount(candidates[0]);
  const best = candidates.filter((r) => recentCount(r) === bestScore);
  return best[Math.floor(Math.random() * best.length)];
}

function pickCorrectPref() {
  const rid = pickRegionBalanced();
  const list = PREFS_BY_REGION.get(rid) || [];
  if (!list.length) return null;

  let pool = list;
  if (lastPrefId != null && list.length > 1) {
    pool = list.filter((p) => p.id !== lastPrefId);
    if (!pool.length) pool = list;
  }

  const p = pool[Math.floor(Math.random() * pool.length)];

  lastRegions.push(String(rid));
  if (lastRegions.length > 18) lastRegions = lastRegions.slice(-18);
  lastPrefId = p.id;

  return p;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildChoices(correct) {
  const used = new Set([correct.id]);
  const wrongs = [];

  const regionIds = [...PREFS_BY_REGION.keys()].filter(
    (rid) => rid !== String(correct.regionId)
  );

  for (const rid of shuffle(regionIds)) {
    const list = PREFS_BY_REGION.get(rid) || [];
    const cands = shuffle(list).filter((p) => !used.has(p.id));
    if (cands[0]) {
      wrongs.push(cands[0]);
      used.add(cands[0].id);
    }
    if (wrongs.length >= 3) break;
  }

  if (wrongs.length < 3) {
    for (const p of shuffle(PREFS)) {
      if (wrongs.length >= 3) break;
      if (!used.has(p.id)) {
        wrongs.push(p);
        used.add(p.id);
      }
    }
  }

  return shuffle([correct, ...wrongs.slice(0, 3)]);
}

function buildQuestionText(correct) {
  return `このシルエットから\n${correct.kana} をえらんでね！`;
}

function resetChoiceClasses() {
  els.grid?.querySelectorAll(".choice").forEach((c) => {
    c.classList.remove("picked", "correct", "correctHold", "show");
  });
}

function addCorrectBlink(el) {
  if (!el) return;
  el.classList.add("correct");
  window.setTimeout(() => {
    el.classList.add("correctHold");
  }, 1200);
}

function renderChoicesOnly(choices) {
  if (!els.grid) return;
  els.grid.innerHTML = "";

  for (const p of choices) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.dataset.prefId = String(p.id);
    btn.setAttribute("aria-label", p.kana);

    const img = document.createElement("img");
    img.src = p.silhouette;
    img.alt = "";
    btn.appendChild(img);

    btn.addEventListener("click", () => onPick(p.id, btn));
    els.grid.appendChild(btn);
  }
}

async function animateChoicesIn(token) {
  const items = els.grid?.querySelectorAll(".choice") || [];
  for (let i = 0; i < items.length; i++) {
    if (!current || current.token !== token) return;
    await sleep(90);
    if (!current || current.token !== token) return;
    items[i].classList.add("show");
  }
}

async function renderQuestionWithIntro() {
  const token = ++questionToken;

  hideResult();
  hideMapStage();
  clearQuestionHero();
  resetQuestionArea();
  if (els.grid) els.grid.innerHTML = "";

  const correct = pickCorrectPref();
  if (!correct) {
    setBadge("データがありません");
    return;
  }

  const choices = buildChoices(correct);

  current = {
    token,
    correct,
    choices,
    picked: null,
    isCorrect: false,
    locked: true,
    phase: "question",
  };

  const questionText = buildQuestionText(correct);

  if (els.qHero) {
    els.qHero.textContent = questionText;
    els.qHero.classList.remove("hide");
    void els.qHero.offsetWidth;
    els.qHero.classList.add("show");
  }

  await sleep(1050);
  if (!current || current.token !== token) return;

  if (els.qHero) {
    els.qHero.classList.remove("show");
    els.qHero.classList.add("hide");
  }

  if (els.qText) els.qText.textContent = questionText;

  await sleep(220);
  if (!current || current.token !== token) return;

  renderChoicesOnly(choices);
  current.locked = false;

  await animateChoicesIn(token);
  if (!current || current.token !== token) return;

  clearQuestionHero();
}

function setResultTexts({ correct, picked, isCorrect }) {
  if (els.resLine1) {
    els.resLine1.textContent = isCorrect
      ? "✨せいかい！✨"
      : `おしい！それは ${picked.kanji} だよ！`;
  }

  if (els.resName) els.resName.textContent = correct.kanji;
  if (els.resKana) els.resKana.textContent = `（${correct.kana}）`;
  if (els.resLine2) {
    els.resLine2.textContent = "つぎへ をおすと日本地図で場所がわかるよ！";
  }
}

function onPick(pickedId, pickedBtnEl) {
  if (!current || current.locked) return;
  current.locked = true;

  const correct = current.correct;
  const picked = current.choices.find((p) => p.id === pickedId) || null;
  if (!picked) {
    current.locked = false;
    return;
  }

  const isCorrect = picked.id === correct.id;
  current.picked = picked;
  current.isCorrect = isCorrect;
  current.phase = "result";

  resetChoiceClasses();

  const correctEl = els.grid?.querySelector(`[data-pref-id="${correct.id}"]`);

  if (isCorrect) {
    addCorrectBlink(pickedBtnEl);
  } else {
    pickedBtnEl?.classList.add("picked");
    addCorrectBlink(correctEl);
  }

  setResultTexts({ correct, picked, isCorrect });
  showResult();
}

/* ========= SVG MAP ========= */

function initJapanSvg() {
  if (!els.japanMap) return;

  const bindSvg = () => {
    try {
      svgDoc = els.japanMap.contentDocument || null;
      svgRoot = svgDoc?.documentElement || null;
      mapReady = !!svgDoc && !!svgRoot;
      if (mapReady) {
        defaultViewBox = svgRoot.getAttribute("viewBox") || "";
        ensureSvgBlinkStyle();
        setBadge("map ready");
      }
    } catch (err) {
      svgDoc = null;
      svgRoot = null;
      mapReady = false;
      console.warn("failed to access SVG map:", err);
    }
  };

  els.japanMap.addEventListener("load", bindSvg);

  if (els.japanMap.contentDocument) {
    bindSvg();
  }
}

async function waitForSvgReady(timeoutMs = 4000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      if (els.japanMap?.contentDocument) {
        svgDoc = els.japanMap.contentDocument;
        svgRoot = svgDoc?.documentElement || null;
        mapReady = !!svgDoc && !!svgRoot;
        if (mapReady && !defaultViewBox) {
          defaultViewBox = svgRoot.getAttribute("viewBox") || "";
        }
        if (mapReady) {
          ensureSvgBlinkStyle();
        }
        return mapReady;
      }
    } catch (err) {
      console.warn("waitForSvgReady error:", err);
    }
    await sleep(80);
  }

  return !!mapReady;
}

function ensureSvgBlinkStyle() {
  if (!svgDoc) return;
  if (svgDoc.getElementById("quiz-map-style")) return;

  const style = svgDoc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("id", "quiz-map-style");
  style.textContent = `
    .quiz-outline-blink {
      animation: quizOutlineBlink 0.6s ease infinite;
    }

    @keyframes quizOutlineBlink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.55;
      }
    }
  `;
  svgDoc.documentElement.appendChild(style);
}

function clearMapHighlight() {
  if (currentMapTarget) {
    currentMapTarget.classList.remove("quiz-outline-blink");
  }

  for (const node of currentOutlinedNodes) {
    node.style.stroke = "";
    node.style.strokeWidth = "";
    node.style.strokeLinejoin = "";
    node.style.paintOrder = "";
    node.style.filter = "";
    node.style.vectorEffect = "";
  }

  currentOutlinedNodes = [];
  currentMapTarget = null;
}

function resetMapView() {
  if (!svgRoot || !defaultViewBox) return;
  svgRoot.setAttribute("viewBox", defaultViewBox);
}

function getFilledNodes(target) {
  if (!target) return [];

  const nodes = [...target.querySelectorAll("path, polygon, polyline")].filter((node) => {
    const fillAttr = (node.getAttribute("fill") || "").trim().toLowerCase();
    const styleFill = (node.style?.fill || "").trim().toLowerCase();

    if (fillAttr && fillAttr !== "none") return true;
    if (styleFill && styleFill !== "none") return true;
    return false;
  });

  if (nodes.length) return nodes;

  const targetFill = (target.getAttribute("fill") || "").trim().toLowerCase();
  if (targetFill && targetFill !== "none") return [target];

  return [];
}

function applyOutlineToTarget(target) {
  const nodes = getFilledNodes(target);
  if (!nodes.length) return [];

  nodes.forEach((node) => {
    node.style.stroke = "#ff4fd8";
    node.style.strokeWidth = "10";
    node.style.strokeLinejoin = "round";
    node.style.paintOrder = "stroke fill";
    node.style.filter =
      "drop-shadow(0 0 12px rgba(255, 79, 216, 1)) drop-shadow(0 0 24px rgba(255, 79, 216, 0.8))";
    node.style.vectorEffect = "non-scaling-stroke";
  });

  return nodes;
}

function zoomToTarget(target) {
  if (!svgRoot || !target || typeof target.getBBox !== "function") return;

  try {
    const bbox = target.getBBox();
    if (!bbox || !bbox.width || !bbox.height) return;

    const pad = Math.max(bbox.width, bbox.height) * 0.9;
    const x = bbox.x - pad;
    const y = bbox.y - pad;
    const w = bbox.width + pad * 2;
    const h = bbox.height + pad * 2;

    svgRoot.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  } catch (err) {
    console.warn("zoomToTarget failed:", err);
  }
}

function findMapTarget(pref) {
  if (!svgDoc || !pref) return null;

  if (pref.svgId) {
    const bySvgId = svgDoc.getElementById(pref.svgId);
    if (bySvgId) return bySvgId;
  }

  const byCodeGroup = svgDoc.querySelector(`g[id="${pref.code}"]`);
  if (byCodeGroup) return byCodeGroup;

  const byCodeAny = svgDoc.getElementById(pref.code);
  if (byCodeAny) return byCodeAny;

  return null;
}

async function startMapSequence(pref) {
  if (!pref) return;

  const seq = ++currentMapSeq;

  showMapStage();
  resetMapStageTexts();

  const ready = await waitForSvgReady();
  if (!ready || !svgDoc || !svgRoot) {
    setBadge("map ng");
    return;
  }

  if (!current || current.phase !== "map" || seq !== currentMapSeq) return;

  clearMapHighlight();
  resetMapView();

  const target = findMapTarget(pref);
  if (!target) {
    console.warn("map target not found:", {
      code: pref.code,
      svgId: pref.svgId,
      kanji: pref.kanji,
    });
    setBadge(`map id ng: ${pref.svgId || pref.code}`);
    return;
  }

  currentMapTarget = target;

  await sleep(250);
  if (!current || current.phase !== "map" || seq !== currentMapSeq) return;

  currentOutlinedNodes = applyOutlineToTarget(target);
  target.classList.add("quiz-outline-blink");

  await sleep(500);
  if (!current || current.phase !== "map" || seq !== currentMapSeq) return;

  if (els.mapPrefName) {
    els.mapPrefName.textContent = pref.kanji;
    els.mapPrefName.hidden = false;
    void els.mapPrefName.offsetWidth;
    els.mapPrefName.classList.add("show");
  }

  if (els.mapPrefKana) {
    els.mapPrefKana.textContent = `（${pref.kana}）`;
    els.mapPrefKana.hidden = false;
    void els.mapPrefKana.offsetWidth;
    els.mapPrefKana.classList.add("show");
  }

  await sleep(500);
  if (!current || current.phase !== "map" || seq !== currentMapSeq) return;

  zoomToTarget(target);
}

async function moveResultToMapStage() {
  if (!current || current.phase !== "result") return;

  hideResult();
  current.phase = "map";

  await startMapSequence(current.correct);
}

function moveMapToNextQuestion() {
  if (!current || current.phase !== "map") return;
  renderQuestionWithIntro();
}

/* ========= Events ========= */

els.btnNext?.addEventListener("click", () => {
  moveResultToMapStage();
});

els.btnMapNext?.addEventListener("click", () => {
  moveMapToNextQuestion();
});

els.btnStart?.addEventListener("click", () => {
  showScreen("game");
  renderQuestionWithIntro();
});

els.btnOpenDrawer?.addEventListener("click", () => {
  // 未使用
});

/* ========= Boot ========= */

(async function main() {
  try {
    showScreen("title");
    initJapanSvg();
    hideResult();
    hideMapStage();
    setBadge("loading...");
    await loadPrefs();
    setBadge("ready");
  } catch (err) {
    console.error(err);
    setBadge("load error");
    alert("データの読み込みに失敗しました。ファイル配置を確認してください。");
  }
})();
