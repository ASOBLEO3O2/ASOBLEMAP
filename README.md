# ASOBLE 都道府県シルエットクイズ（GitHub Pages）

小2〜小4向け：ポップでかわいい「都道府県シルエット」4択クイズです。  
**県名（かな）→ シルエット4枚から選ぶ**方式で、毎回ランダム・無限出題。

---

## 1. フォルダ構成

```
/
  index.html
  css/
    style.css
  js/
    app.js
  data/
    prefs.json
  images/
    background.jpg           ← ASOBLE背景（差し替え）
    silhouettes/             ← 問題用シルエット（PNG）
      ...47枚...
  map/
    base_japan.png           ← 日本地図ベース（うっすら表示）※用意する
    highlight/               ← 正解ハイライト（透過PNG 47枚）※用意する
      01_hokkaidou.png
      ...
```

---

## 2. 最初にやること（素材を置く）

### (A) ASOBLE背景
`images/background.jpg` を、ASOBLE背景画像に差し替えてください。

### (B) 日本地図ベース（必須）
`map/base_japan.png` を置いてください。  
- 推奨：1536×1536 px
- 薄いグレーの日本地図（うっすら表示用）

### (C) 正解ハイライト（任意・後でOK）
`map/highlight/` に **日本地図基準の透過PNG** を47枚置くと、正解時に点滅します。

命名（推奨）：
- `map/highlight/01_hokkaidou.png` ～ `47_okinawa.png`

---

## 3. いまの状態（重要）

このリポジトリは、アップロードされたZIPから **シルエット画像を取り込み済み**です。  
ただし、あなたが渡してくれたZIPでは **広島県（hiroshima）が不足**しています。

- 不足：広島県（id=34）
- `data/prefs.json` に不足リストが出ます
- アプリ側は「素材がある県だけ」出題します（広島は出ません）

広島PNGを追加したら、同じ命名ルールで `images/silhouettes/` に入れてください。

---

## 4. GitHub Pages 公開

1. GitHub にこのフォルダを push
2. **Settings → Pages**
3. Source: `Deploy from a branch`
4. Branch: `main` / Folder: `/ (root)`
5. Save

しばらくして公開URLが出ます。

---

## 5. 仕様メモ（確定仕様）

- 出題：無限ランダム
- 地方バランス：偏り防止（直近の地方を避ける）
- 問題文：`このシルエットから 〇〇けん をえらんでね！`（かな）
- 選択肢：シルエット4枚、毎回ランダム配置
- 正解時：
  - 正解シルエットにピンク寄り赤枠
  - `正解は〇〇県！（漢字＋かな）`
  - `〇〇県はココだよ！` → 地図ハイライト点滅（素材があれば）

---

## 6. 次の拡張（後で）

- 効果音（なきごえはんと風）
- 正解/不正解のキラキラ演出強化
- 間違えた県の復習モード
