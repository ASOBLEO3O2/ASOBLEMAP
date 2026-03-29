// 追加：スリープ
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 追加：演出付き出題
async function renderQuestionWithIntro() {
  hideResult();
  clearMapHighlight();

  const correct = pickCorrectPref();
  if (!correct) {
    setBadge("データがありません");
    return;
  }

  const choices = buildChoices(correct);
  current = { correct, choices, locked: false };

  const text = `このシルエットから\n${correct.kana} をえらんでね！`;

  // ===== 中央バーン用 =====
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

  // ===== 上に表示 =====
  els.qText.textContent = text;

  await sleep(200);

  // ===== 選択肢 =====
  els.grid.innerHTML = "";

  for (const p of choices) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.dataset.prefId = String(p.id);

    const img = document.createElement("img");
    img.src = p.silhouette;
    btn.appendChild(img);

    btn.addEventListener("click", () => onPick(p.id, btn));
    els.grid.appendChild(btn);
  }

  // 1個ずつ出す
  const items = els.grid.querySelectorAll(".choice");
  for (let i = 0; i < items.length; i++) {
    await sleep(80);
    items[i].classList.add("show");
  }
}
