// ASOBLE 都道府県シルエットクイズ (v0.3)
// 演出追加：問題バーン → 上固定 → 選択肢表示

const $ = (sel) => document.querySelector(sel);

const els = {
  badge: $("#badge"),

  drawer: $("#drawer"),
  drawerBackdrop: $("#drawerBackdrop"),
  btnOpenDrawer: $("#btnOpenDrawer"),
  btnCloseDrawer: $("#btnCloseDrawer"),
  optHint: $("#optHint"),
  optSound: $("#optSound"),

  screenTitle: $("#screenTitle"),
  screenGame: $("#screenGame"),
  btnStart: $("#btnStart"),

  qText: $("#qText"),
  btnHint: $("#btnHint"),
  grid: $("#grid"),

  result: $("#result"),
  resLine1: $("#resLine1"),
  resName: $("#resName"),
  resKana: $("#resKana"),
  resLine2: $("#resLine2"),
  btnNext: $("#btnNext"),

  mapHi: $("#mapHi"),
};

let PREFS = [];
let PREFS_BY_REGION = new Map();
let lastRegions = [];
let lastPrefId = null;

let current = null;

/* ========= util ========= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ========= UI ========= */

function setBadge(text) {
  els.badge.textContent = text;
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawerBackdrop.hidden = false;
}
function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawerBackdrop.hidden = true;
}

els.btnOpenDrawer?.addEventListener("click", openDrawer);
els.btnCloseDrawer?.addEventListener("click", closeDrawer);
els.drawerBackdrop?.addEventListener("click", closeDrawer);

function showScreen(name) {
  if (name === "title") {
    els.screenTitle.hidden = false;
    els.screenGame.hidden = true;
  } else {
    els.screenTitle.hidden = true;
    els.screenGame.hidden = false;
  }
}

/* ========= Data ========= */

async function loadPrefs() {
  const res = await fetch("data/prefs.json", { cache: "no-store" });
  const json = await res.json();

  PREFS = (json.prefs || []).filter((p) => p.silhouette);

  PREFS_BY_REGION = new Map();
  for (const p of PREFS) {
    const k = String(p.regionId);
    if (!PREFS_BY_REGION.has(k)) PREFS_BY_REGION.set(k, []);
    PREFS_BY_REGION.get(k).push(p);
  }
}

function pickRegionBalanced() {
  const regions = [...PREFS_BY_REGION.keys()];
  const avoid = new Set(lastRegions.slice(-2));
  let candidates = regions.filter((r) => !avoid.has(r));
  if (candidates.length === 0) candidates = regions;

  const r = candidates[Math.floor(Math.random() * candidates.length)];
  return r;
}

function pickCorrectPref() {
  const rid = pickRegionBalanced();
  const list = PREFS_BY_REGION.get(rid) || [];
  if (!list.length) return null;

  const p = list[Math.floor(Math.random() * list.length)];
  lastRegions.push(String(rid));
  return p;
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function buildChoices(correct) {
  const wrongs = shuffle(PREFS).filter(p => p.id !== correct.id).slice(0,3);
  return shuffle([correct, ...wrongs]);
}

/* ========= 演出付き出題 ========= */

async function renderQuestionWithIntro() {
  hideResult();
  clearMapHighlight();

  const correct = pickCorrectPref();
  if (!correct) return;

  const choices = buildChoices(correct);
  current = { correct, choices, locked: false };

  const text = `このシルエットから\n${correct.kana} をえらんでね！`;

  // 中央演出
  let hero = document.querySelector(".qHero");
  if (!hero) {
    hero = document.createElement("div");
    hero.className = "qHero";
    document.getElementById("screenGame").appendChild(hero);
  }

  hero.textContent = text;
  hero.classList.remove("hide");
  hero.classList.add("show");

  await sleep(1000);

  hero.classList.remove("show");
  hero.classList.add("hide");

  // 上に表示
  els.qText.textContent = text;

  await sleep(200);

  // 選択肢表示
  els.grid.innerHTML = "";

  for (const p of choices) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.dataset.prefId = p.id;

    const img = document.createElement("img");
    img.src = p.silhouette;
    btn.appendChild(img);

    btn.addEventListener("click", () => onPick(p.id, btn));
    els.grid.appendChild(btn);
  }

  const items = els.grid.querySelectorAll(".choice");
  for (let i = 0; i < items.length; i++) {
    await sleep(80);
    items[i].classList.add("show");
  }
}

/* ========= 既存 ========= */

function hideResult() {
  els.result.hidden = true;
}

function clearMapHighlight() {
  els.mapHi.style.opacity = "0";
}

function onPick(id, el) {
  if (current.locked) return;
  current.locked = true;

  const correct = current.correct;
  const isCorrect = id === correct.id;

  if (isCorrect) {
    els.resLine1.textContent = "✨せいかい！✨";
  } else {
    els.resLine1.textContent = "おしい！";
  }

  els.resName.textContent = correct.kanji;
  els.result.hidden = false;
}

/* ========= Events ========= */

els.btnNext.addEventListener("click", () => {
  renderQuestionWithIntro();
});

els.btnStart.addEventListener("click", () => {
  showScreen("game");
  renderQuestionWithIntro();
});

/* ========= Boot ========= */

(async function () {
  showScreen("title");
  await loadPrefs();
})();
