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
  mapLead: $("#mapLead"),
  japanMap: $("#japanMap"),
  mapPrefName: $("#mapPrefName"),
  btnMapNext: $("#btnMapNext"),
};

const PREFS_JSON_PATH = "data/prefs.json";

let PREFS = [];
let PREFS_BY_REGION = new Map();

let current = null;
let questionToken = 0;

let svgDoc = null;
let mapReady = false;
let currentMapTarget = null;

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
  if (els.mapPrefName) {
    els.mapPrefName.hidden = true;
    els.mapPrefName.classList.remove("show");
    els.mapPrefName.textContent = "";
  }
  clearMapHighlight();
}

function showMapStage() {
  if (els.mapStage) els.mapStage.hidden = false;
}

function clearQuestionHero() {
  if (!els.qHero) return;
  els.qHero.textContent = "";
  els.qHero.classList.remove("show", "hide");
}

function resetQuestionArea() {
  if (els.qText) els.qText.textContent = "";
}

function normalizePrefs(raw) {
  const prefs = Array.isArray(raw?.prefs) ? raw.prefs : Array.isArray(raw) ? raw : [];
  return prefs
    .map((p) => ({
      id: Number(p.id),
      code: String(p.code || "").padStart(2, "0"),
      kanji: String(p.kanji || ""),
      kana: String(p.kana || ""),
      romaji: String(p.romaji || ""),
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
    throw new Error(`都道府県データの読込に失敗しました: ${res.status}`);
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCorrectPref() {
  if (!PREFS.length) return null;
  return PREFS[Math.floor(Math.random() * PREFS.length)] || null;
}

function buildChoices(correct) {
  const wrongs = [];
  const used = new Set([correct.id]);

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
  el.classList.add("correct");
  window.setTimeout(() => {
    el.classList.add("correctHold");
  }, 1850);
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
    correct,
    choices,
    picked: null,
    isCorrect: false,
    locked: true,
    phase: "question",
    token,
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
    els.resLine2.textContent = isCorrect
      ? "つぎへ をおすと日本地図で場所がわかるよ！"
      : "つぎへ をおすと日本地図で場所がわかるよ！";
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

  const isCorrect = pickedId === correct.id;
  current.picked = picked;
  current.isCorrect = isCorrect;
  current.phase = "result";

  resetChoiceClasses();

  pickedBtnEl.classList.add("picked");

  const correctEl = els.grid?.querySelector(`[data-pref-id="${correct.id}"]`);
  if (correctEl) addCorrectBlink(correctEl);

  setResultTexts({ correct, picked, isCorrect });
  showResult();
}

function initJapanSvg() {
  if (!els.japanMap) return;

  const bindSvg = () => {
    try {
      svgDoc = els.japanMap.contentDocument || null;
      mapReady = !!svgDoc;
      if (mapReady) {
        setBadge("map ready");
      }
    } catch (err) {
      svgDoc = null;
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
        mapReady = true;
        return true;
      }
    } catch (err) {
      console.warn("waitForSvgReady error:", err);
    }
    await sleep(80);
  }

  return !!mapReady;
}

function clearMapHighlight() {
  if (currentMapTarget) {
    currentMapTarget.classList.remove("pref-outline-blink");

    currentMapTarget.style.stroke = "";
    currentMapTarget.style.strokeWidth = "";
    currentMapTarget.style.strokeLinejoin = "";
    currentMapTarget.style.filter = "";
    currentMapTarget.style.paintOrder = "";

    const paths = currentMapTarget.querySelectorAll("path, polygon, polyline");
    paths.forEach((node) => {
      node.style.stroke = "";
      node.style.strokeWidth = "";
      node.style.strokeLinejoin = "";
      node.style.filter = "";
      node.style.paintOrder = "";
    });

    currentMapTarget = null;
  }

  if (svgDoc) {
    const styleEl = svgDoc.getElementById("quiz-map-style");
    if (styleEl) styleEl.remove();
  }
}

function ensureSvgBlinkStyle() {
  if (!svgDoc) return;
  if (svgDoc.getElementById("quiz-map-style")) return;

  const style = svgDoc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("id", "quiz-map-style");
  style.textContent = `
    .pref-outline-blink {
      animation: prefOutlineBlink 0.62s ease 4;
    }

    @keyframes prefOutlineBlink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.38;
      }
    }
  `;

  svgDoc.documentElement.appendChild(style);
}

function applyOutlineToTarget(target) {
  const nodes = target.querySelectorAll("path, polygon, polyline");

  if (nodes.length) {
    nodes.forEach((node) => {
      node.style.stroke = "#ff4f4f";
      node.style.strokeWidth = "5";
      node.style.strokeLinejoin = "round";
      node.style.paintOrder = "stroke fill";
      node.style.filter = "drop-shadow(0 0 8px rgba(255,79,79,0.75))";
    });
  } else {
    target.style.stroke = "#ff4f4f";
    target.style.strokeWidth = "5";
    target.style.strokeLinejoin = "round";
    target.style.paintOrder = "stroke fill";
    target.style.filter = "drop-shadow(0 0 8px rgba(255,79,79,0.75))";
  }
}

async function startMapSequence(pref) {
  if (!pref) return;

  showMapStage();

  if (els.mapLead) {
    els.mapLead.textContent = "ココだよ！";
  }

  if (els.mapPrefName) {
    els.mapPrefName.hidden = true;
    els.mapPrefName.classList.remove("show");
    els.mapPrefName.textContent = "";
  }

  const ready = await waitForSvgReady();
  if (!ready || !svgDoc) {
    setBadge("map wait");
    if (els.mapLead) {
      els.mapLead.textContent = "地図をよみこみ中…";
    }
    return;
  }

  clearMapHighlight();
  ensureSvgBlinkStyle();

  const target = svgDoc.querySelector(`g[id="${pref.code}"]`);
  if (!target) {
    console.warn("見つからない:", pref.code);
    setBadge(`map id ng: ${pref.code}`);
    return;
  }

  currentMapTarget = target;
  applyOutlineToTarget(target);
  target.classList.add("pref-outline-blink");

  await sleep(700);

  if (!current || current.correct.id !== pref.id || current.phase !== "map") {
    return;
  }

  if (els.mapPrefName) {
    els.mapPrefName.textContent = pref.kanji;
    els.mapPrefName.hidden = false;
    void els.mapPrefName.offsetWidth;
    els.mapPrefName.classList.add("show");
  }
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
  // 今回は設定パネル未使用のため何もしない
});

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
    alert("データの読み込みに失敗しました。JSONの場所を確認してください。");
  }
})();
