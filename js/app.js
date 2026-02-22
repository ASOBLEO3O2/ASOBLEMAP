// ASOBLE 都道府県シルエットクイズ (v0)
// - 県名は「問題文＝かな」
// - 選択肢は「4枚のシルエット」
// - 地方バランス（偏り防止）あり
// - 正解後：正解枠(赤) → 「ココだよ！」 → 地図ハイライト点滅（素材があれば）

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

  result: $("#result"),
  resLine1: $("#resLine1"),
  resName: $("#resName"),
  resKana: $("#resKana"),
  resLine2: $("#resLine2"),
  btnNext: $("#btnNext"),

  mapHi: $("#mapHi"),
};

let PREFS = [];
let PREFS_BY_REGION = new Map(); // regionId -> prefs[]
let lastRegions = []; // recent regions
let lastPrefId = null;

let current = null; // { correctPref, choices[] }

function setBadge(text){ els.badge.textContent = text; }

function openDrawer(){
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.drawerBackdrop.hidden = false;
}
function closeDrawer(){
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.drawerBackdrop.hidden = true;
}

els.btnOpenDrawer.addEventListener("click", openDrawer);
els.btnCloseDrawer.addEventListener("click", closeDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);

function showScreen(name){
  if (name === "title"){
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

async function loadPrefs(){
  const res = await fetch("data/prefs.json", { cache: "no-store" });
  const json = await res.json();
  PREFS = (json.prefs || []).filter(p => p.silhouette); // assetがあるものだけ出題
  const missing = (json.missing || []);
  if (missing.length){
    console.warn("missing assets:", missing);
    setBadge(`素材不足: ${missing.map(m => m[2]).join("、")}`);
  } else {
    setBadge("素材OK");
  }

  PREFS_BY_REGION = new Map();
  for (const p of PREFS){
    const k = String(p.regionId);
    if (!PREFS_BY_REGION.has(k)) PREFS_BY_REGION.set(k, []);
    PREFS_BY_REGION.get(k).push(p);
  }
}

function pickRegionBalanced(){
  const regions = [...PREFS_BY_REGION.keys()];
  // Avoid last 2 regions if possible
  const avoid = new Set(lastRegions.slice(-2));
  let candidates = regions.filter(r => !avoid.has(r));
  if (candidates.length === 0) candidates = regions;

  // Weight: prefer regions with fewer recent appearances
  const recentCount = (rid) => lastRegions.filter(x => x === rid).length;
  candidates.sort((a,b) => recentCount(a) - recentCount(b));
  const bestScore = recentCount(candidates[0]);
  const best = candidates.filter(r => recentCount(r) === bestScore);
  return best[Math.floor(Math.random() * best.length)];
}

function pickCorrectPref(){
  const rid = pickRegionBalanced();
  const list = PREFS_BY_REGION.get(rid) || [];
  if (!list.length) return null;

  // avoid exact same pref as last time if possible
  let pool = list;
  if (lastPrefId != null && list.length > 1){
    pool = list.filter(p => p.id !== lastPrefId);
    if (!pool.length) pool = list;
  }

  const p = pool[Math.floor(Math.random() * pool.length)];
  lastRegions.push(String(rid));
  if (lastRegions.length > 18) lastRegions = lastRegions.slice(-18); // keep history
  lastPrefId = p.id;
  return p;
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function buildChoices(correct){
  // choose 3 wrongs
  const wrongs = [];
  const used = new Set([correct.id]);

  // try to diversify regions a bit
  const regionIds = [...PREFS_BY_REGION.keys()].filter(r => r !== String(correct.regionId));
  const regionOrder = shuffle(regionIds);

  for (const rid of regionOrder){
    const list = PREFS_BY_REGION.get(rid) || [];
    const cands = shuffle(list).filter(p => !used.has(p.id));
    if (cands[0]){
      wrongs.push(cands[0]);
      used.add(cands[0].id);
    }
    if (wrongs.length >= 3) break;
  }

  // fallback if still not enough
  if (wrongs.length < 3){
    for (const p of shuffle(PREFS)){
      if (wrongs.length >= 3) break;
      if (!used.has(p.id)){
        wrongs.push(p);
        used.add(p.id);
      }
    }
  }

  const choices = shuffle([correct, ...wrongs]);
  return choices;
}

function renderQuestion(){
  current = null;
  els.result.hidden = true;

  const correct = pickCorrectPref();
  if (!correct){
    setBadge("データがありません");
    return;
  }
  const choices = buildChoices(correct);

  current = { correct, choices, locked:false };

  // Question text (kana)
  els.qText.textContent = `このシルエットから\n${correct.kana} をえらんでね！`;

  // Hint button
  const hintOn = !!els.optHint.checked;
  els.btnHint.hidden = !hintOn;
  els.btnHint.onclick = () => {
    alert(`ヒント：${correct.regionLabel} だよ！`);
  };

  // Clear map highlight
  els.mapHi.classList.remove("blink");
  els.mapHi.style.opacity = "0";
  els.mapHi.removeAttribute("src");

  // Render grid
  els.grid.innerHTML = "";
  for (const p of choices){
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

function onPick(picked) {
  const correct = currentAnswer;
  const isCorrect = picked.code === correct.code;

  // まず全カードのクラスをリセット
  document.querySelectorAll(".choice").forEach(c => {
    c.classList.remove("picked", "correct");
  });

  // 押したカードに picked
  const pickedEl = document.querySelector(`[data-code="${picked.code}"]`);
  pickedEl.classList.add("picked");

  if (isCorrect) {
    pickedEl.classList.add("correct");
  } else {
    // 正解カードに correct クラスを付与
    const correctEl = document.querySelector(`[data-code="${correct.code}"]`);
    correctEl.classList.add("correct");
  }

  showResult({ correct, picked, isCorrect });
}

function startMapBlink(pref){
  // If highlight PNG exists, show it and blink.
  // (GitHub Pagesでは存在しない画像は 404 になるので、onerror で無視)
  const url = pref.mapHighlight;
  els.mapHi.onload = () => {
    els.mapHi.style.opacity = "1";
    els.mapHi.classList.remove("blink");
    // restart animation
    void els.mapHi.offsetWidth;
    els.mapHi.classList.add("blink");
  };
  els.mapHi.onerror = () => {
    // Highlight asset not ready yet – just skip
    console.warn("map highlight not found:", url);
  };
  els.mapHi.src = url;
}

els.btnNext.addEventListener("click", () => {
  renderQuestion();
});

els.btnStart.addEventListener("click", async () => {
  showScreen("game");
  renderQuestion();
});

(async function main(){
  showScreen("title");
  closeDrawer();
  setBadge("loading...");
  await loadPrefs();
  setBadge("ready");
})();
