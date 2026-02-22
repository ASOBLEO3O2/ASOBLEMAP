// ASOBLE 都道府県シルエットクイズ (v0.2)
// - 問題文：かな
// - 選択肢：4枚シルエット（毎回ランダム配置）
// - 地方バランス（偏り防止）あり
// - 不正解：おしい！それは〇〇県だよ！＋正解カードを赤枠点滅
// - 正解：正解カードを赤枠点滅 → 「〇〇県はココだよ！」→ 地図ハイライト点滅（素材があれば）

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

  // map highlight img (optional)
  mapHi: $("#mapHi"),
};

let PREFS = [];
let PREFS_BY_REGION = new Map(); // regionId -> prefs[]
let lastRegions = []; // recent regions
let lastPrefId = null;

let current = null; // { correct, choices, locked }

/* ========= UI helpers ========= */

function setBadge(text) {
  els.badge.textContent = text;
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.drawerBackdrop.hidden = false;
}
function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.drawerBackdrop.hidden = true;
}

els.btnOpenDrawer?.addEventListener("click", openDrawer);
els.btnCloseDrawer?.addEventListener("click", closeDrawer);
els.drawerBackdrop?.addEventListener("click", closeDrawer);

function showScreen(name) {
  if (name === "title") {
    els.screenTitle.hidden = false;
    els.screenTitle.classList.add("screenActive");
    els.screenGame.hidden = true;
    els.screenGame.classList.remove("screenActive");
  } else {
    els.screenTitle.hidden = true;
    els.screenTitle.classList.remove("screenActive");
    els.screenGame.hidden = false;
    els.screenGame.classList.add("screenActive");
  }
}

/* ========= Data ========= */

async function loadPrefs() {
  const res = await fetch("data/prefs.json", { cache: "no-store" });
  const json = await res.json();

  // assetがあるものだけ出題
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

  // Avoid last 2 regions if possible
  const avoid = new Set(lastRegions.slice(-2));
  let candidates = regions.filter((r) => !avoid.has(r));
  if (candidates.length === 0) candidates = regions;

  // Weight: prefer regions with fewer recent appearances
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

  // avoid exact same pref as last time if possible
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

  // try to diversify regions a bit
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

  // fallback
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

/* ========= Map highlight (optional assets) ========= */

function clearMapHighlight() {
  els.mapHi.classList.remove("blink");
  els.mapHi.style.opacity = "0";
  els.mapHi.removeAttribute("src");
}

function startMapBlink(pref) {
  const url = pref?.mapHighlight;
  if (!url) return;

  els.mapHi.onload = () => {
    els.mapHi.style.opacity = "1";
    els.mapHi.classList.remove("blink");
    // restart animation
    void els.mapHi.offsetWidth;
    els.mapHi.classList.add("blink");
  };
  els.mapHi.onerror = () => {
    console.warn("map highlight not found:", url);
  };
  els.mapHi.src = url;
}

/* ========= Result UI ========= */

function hideResult() {
  els.result.hidden = true;
}

function showResult({ correct, picked, isCorrect }) {
  // まず出す（ただし「ココだよ！」演出は少し遅らせる）
  els.result.hidden = false;

  if (isCorrect) {
    els.resLine1.textContent = "✨せいかい！✨";
  } else {
    // ここが要望：「おしい！それは〇〇県だよ！」
    els.resLine1.textContent = `おしい！それは ${picked.kanji} だよ！`;
  }

  // 正解名（漢字＋ふりがな）
  els.resName.textContent = correct.kanji;
  els.resKana.textContent = `（${correct.kana}）`;

  // いったん空 → 少し遅れて「ココだよ！」＋地図点滅
  els.resLine2.textContent = "";

  window.setTimeout(() => {
    els.resLine2.textContent = `${correct.kanji} はココだよ！`;
    startMapBlink(correct);
  }, 600);
}

/* ========= Question ========= */

function renderQuestion() {
  hideResult();
  clearMapHighlight();

  const correct = pickCorrectPref();
  if (!correct) {
    setBadge("データがありません");
    return;
  }

  const choices = buildChoices(correct);
  current = { correct, choices, locked: false };

  // Question text (kana)
  els.qText.textContent = `このシルエットから\n${correct.kana} をえらんでね！`;

  // Hint button
  const hintOn = !!els.optHint.checked;
  els.btnHint.hidden = !hintOn;
  els.btnHint.onclick = () => {
    alert(`ヒント：${correct.regionLabel} だよ！`);
  };

  // Render grid
  els.grid.innerHTML = "";

  for (const p of choices) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";

    // ★ここが重要：idで追えるように data-pref-id を付ける
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

function resetChoiceClasses() {
  els.grid.querySelectorAll(".choice").forEach((c) => {
    c.classList.remove("picked", "correct", "correctHold");
  });
}

function addCorrectBlink(el) {
  // CSS側で .choice.correct に blink が付く想定。
  // 「3回点滅→固定」したいので、点滅後に correctHold を付けて残す
  el.classList.add("correct");
  window.setTimeout(() => {
    el.classList.add("correctHold");
  }, 0.6 * 3 * 1000 + 50); // 0.6秒×3回＋少し
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

  // 見た目：押したのは青枠、正解は赤枠点滅
  resetChoiceClasses();

  // 押したカード
  pickedBtnEl.classList.add("picked");

  // 正解カード
  const correctEl = els.grid.querySelector(`[data-pref-id="${correct.id}"]`);
  if (correctEl) addCorrectBlink(correctEl);

  // 結果表示（要求通り）
  showResult({ correct, picked, isCorrect });
}

/* ========= Events ========= */

els.btnNext.addEventListener("click", () => {
  renderQuestion();
});

els.btnStart.addEventListener("click", async () => {
  showScreen("game");
  renderQuestion();
});

/* ========= Boot ========= */

(async function main() {
  showScreen("title");
  closeDrawer();
  setBadge("loading...");
  await loadPrefs();
  setBadge("ready");
  hideResult();
  clearMapHighlight();
})();
