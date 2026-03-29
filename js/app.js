// ASOBLE 都道府県シルエットクイズ (v0.5)
// - 問題文：かな
// - 選択肢：4枚シルエット（毎回ランダム配置）
// - 地方バランス（偏り防止）あり
// - 不正解：おしい！それは〇〇県だよ！＋正解カードを赤枠点滅
// - 正解：正解カードを赤枠点滅 → 「〇〇県はココだよ！」→ SVG地図ハイライト点滅
// - 追加演出：問題バーン → 上に残る → 4択を順に表示

const $ = (sel) => document.querySelector(sel);

const els = {
  badge: $("#badge"),

  // drawer
  drawer: $("#drawer"),
  drawerBackdrop: $("#drawerBackdrop"),
  btnOpenDrawer: $("#btnOpenDrawer"),
  btnCloseDrawer: $("#btnCloseDrawer"),
  optHint: $("#optHint"),
  optSound: $("#optSound"),

  // screens
  screenTitle: $("#screenTitle"),
  screenGame: $("#screenGame"),
  btnStart: $("#btnStart"),

  // game UI
  qText: $("#qText"),
  btnHint: $("#btnHint"),
  grid: $("#grid"),

  // result overlay
  result: $("#result"),
  resLine1: $("#resLine1"),
  resName: $("#resName"),
  resKana: $("#resKana"),
  resLine2: $("#resLine2"),
  btnNext: $("#btnNext"),

  // SVG map
  japanMap: $("#japanMap"),
  mapWrap: $(".mapWrap"),
};

let PREFS = [];
let PREFS_BY_REGION = new Map();
let lastRegions = [];
let lastPrefId = null;

let current = null; // { correct, choices, locked, token }
let questionToken = 0;

let svgDoc = null;
let svgRoot = null;
let currentMapTarget = null;
let mapReady = false;

/* ========= UI helpers ========= */

function setBadge(text) {
  if (els.badge) els.badge.textContent = text;
}

function openDrawer() {
  if (!els.drawer) return;
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  if (els.drawerBackdrop) els.drawerBackdrop.hidden = false;
}

function closeDrawer() {
  if (!els.drawer) return;
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  if (els.drawerBackdrop) els.drawerBackdrop.hidden = true;
}

els.btnOpenDrawer?.addEventListener("click", openDrawer);
els.btnCloseDrawer?.addEventListener("click", closeDrawer);
els.drawerBackdrop?.addEventListener("click", closeDrawer);

function showScreen(name) {
  if (name === "title") {
    if (els.screenTitle) {
      els.screenTitle.hidden = false;
      els.screenTitle.classList.add("screenActive");
    }
    if (els.screenGame) {
      els.screenGame.hidden = true;
      els.screenGame.classList.remove("screenActive");
    }
  } else {
    if (els.screenTitle) {
      els.screenTitle.hidden = true;
      els.screenTitle.classList.remove("screenActive");
    }
    if (els.screenGame) {
      els.screenGame.hidden = false;
      els.screenGame.classList.add("screenActive");
    }
  }
}

/* ========= util ========= */

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ensureQuestionHero() {
  let hero = $("#qHero");
  if (!hero) {
    hero = document.createElement("div");
    hero.id = "qHero";
    hero.className = "qHero";
    els.screenGame.appendChild(hero);
  }
  return hero;
}

function clearQuestionHero() {
  const hero = $("#qHero");
  if (!hero) return;
  hero.classList.remove("show", "hide");
  hero.textContent = "";
}

function resetQuestionArea() {
  if (els.qText) els.qText.textContent = "";
}

/* ========= Data ========= */

async function loadPrefs() {
  const res = await fetch("data/prefs.json", { cache: "no-store" });
  const json = await res.json();

  PREFS = (json.prefs || []).filter((p) => p.silhouette);

  const missing = json.missing || [];
  if (missing.length) {
    console.warn("missing assets:", missing);
    setBadge(`素材不足: ${missing.map((m) => m[2]).join("、")}`);
  } else {
    setBadge("素材OK");
  }

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
  const wrongs = [];
  const used = new Set([correct.id]);

  const regionIds = [...PREFS_BY_REGION.keys()].filter(
    (r) => r !== String(correct.regionId)
  );
  const regionOrder = shuffle(regionIds);

  for (const rid of regionOrder) {
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

  return shuffle([correct, ...wrongs]);
}

/* ========= SVG Map ========= */

function initJapanSvg() {
  if (!els.japanMap) return;

  const bindSvg = () => {
    try {
      svgDoc = els.japanMap.contentDocument || null;
      svgRoot = svgDoc?.documentElement || null;
      mapReady = !!svgRoot;
      if (mapReady) {
        setBadge("map ready");
      } else {
        console.warn("SVG map not ready");
      }
    } catch (err) {
      console.warn("failed to access SVG map:", err);
      svgDoc = null;
      svgRoot = null;
      mapReady = false;
    }
  };

  els.japanMap.addEventListener("load", bindSvg);

  if (els.japanMap.contentDocument) {
    bindSvg();
  }
}

function clearMapHighlight() {
  if (currentMapTarget) {
    currentMapTarget.classList.remove("pref-blink");
    currentMapTarget.style.fill = "";
    currentMapTarget.style.stroke = "";
    currentMapTarget.style.strokeWidth = "";
    currentMapTarget.style.filter = "";
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
    .pref-blink {
      animation: prefBlink 0.6s ease 4;
      transform-box: fill-box;
      transform-origin: center;
    }
    @keyframes prefBlink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.25;
      }
    }
  `;
  svgDoc.documentElement.appendChild(style);
}

function showMap() {
  if (els.mapWrap) {
    els.mapWrap.style.display = "flex";
    els.mapWrap.style.opacity = "1";
  }
}

function hideMap() {
  if (els.mapWrap) {
    els.mapWrap.style.opacity = "0";
  }
  clearMapHighlight();
}

function startMapBlink(pref) {
  if (!mapReady || !svgDoc) {
    console.warn("SVG map is not ready yet");
    return;
  }

  clearMapHighlight();
  ensureSvgBlinkStyle();

  const target = svgDoc.getElementById(pref.code);

  if (!target) {
    console.warn("見つからない:", pref.code);
    return;
  }

  currentMapTarget = target;
  showMap();

  target.style.fill = "#ff4f4f";
  target.style.stroke = "#ffffff";
  target.style.strokeWidth = "1.5";
  target.style.filter = "drop-shadow(0 0 6px rgba(255,79,79,0.7))";

  void target.getBBox();
  target.classList.add("pref-blink");
}

/* ========= Result UI ========= */

function hideResult() {
  if (els.result) els.result.hidden = true;
}

function showResult({ correct, picked, isCorrect }) {
  if (els.result) els.result.hidden = false;

  if (els.resLine1) {
    els.resLine1.textContent = isCorrect
      ? "✨せいかい！✨"
      : `おしい！それは ${picked.kanji} だよ！`;
  }

  if (els.resName) els.resName.textContent = correct.kanji;
  if (els.resKana) els.resKana.textContent = `（${correct.kana}）`;
  if (els.resLine2) els.resLine2.textContent = "";

  window.setTimeout(() => {
    if (els.resLine2) els.resLine2.textContent = `${correct.kanji} はココだよ！`;
    startMapBlink(correct);
  }, 600);
}

/* ========= Question render ========= */

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
  }, 0.6 * 3 * 1000 + 50);
}

function renderChoicesOnly(choices) {
  if (!els.grid) return;

  els.grid.innerHTML = "";

  for (const p of choices) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.dataset.prefId = String(p.id);
    btn.setAttribute("aria-label", "えらぶ");

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
  hideMap();
  clearQuestionHero();
  resetQuestionArea();
  if (els.grid) els.grid.innerHTML = "";

  const correct = pickCorrectPref();
  if (!correct) {
    setBadge("データがありません");
    return;
  }

  const choices = buildChoices(correct);
  current = { correct, choices, locked: true, token };

  const questionText = buildQuestionText(correct);

  const hintOn = !!els.optHint?.checked;
  if (els.btnHint) {
    els.btnHint.hidden = !hintOn;
    els.btnHint.onclick = () => {
      alert(`ヒント：${correct.regionLabel} だよ！`);
    };
  }

  const hero = ensureQuestionHero();
  hero.textContent = questionText;
  hero.classList.remove("hide");
  void hero.offsetWidth;
  hero.classList.add("show");

  await sleep(1050);
  if (!current || current.token !== token) return;

  hero.classList.remove("show");
  hero.classList.add("hide");

  if (els.qText) els.qText.textContent = questionText;

  await sleep(220);
  if (!current || current.token !== token) return;

  renderChoicesOnly(choices);

  current.locked = false;

  await animateChoicesIn(token);

  if (!current || current.token !== token) return;
  hero.classList.remove("show", "hide");
  hero.textContent = "";
}

/* ========= Pick ========= */

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

  resetChoiceClasses();

  pickedBtnEl.classList.add("picked");

  const correctEl = els.grid?.querySelector(`[data-pref-id="${correct.id}"]`);
  if (correctEl) addCorrectBlink(correctEl);

  showResult({ correct, picked, isCorrect });
}

/* ========= Events ========= */

els.btnNext?.addEventListener("click", () => {
  renderQuestionWithIntro();
});

els.btnStart?.addEventListener("click", async () => {
  showScreen("game");
  renderQuestionWithIntro();
});

els.optHint?.addEventListener("change", () => {
  if (!current || !els.btnHint) return;
  els.btnHint.hidden = !els.optHint.checked;
});

/* ========= Boot ========= */

(async function main() {
  showScreen("title");
  closeDrawer();
  initJapanSvg();
  setBadge("loading...");
  await loadPrefs();
  setBadge("ready");
  hideResult();
  hideMap();
})();
