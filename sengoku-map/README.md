# 戦国日本 版図の変遷

1467年（応仁元年）から1615年（元和元年）まで、旧国ごとの支配大名家を
西暦スライダーで切り替えて見る地図。

## 構成

    src/data-geo.js      海岸線（簡略化）と旧国の代表点
    src/data-history.js  大名家・支配の年表・石高・できごと
    src/style.css        配色と組版
    src/app.js           地図の描画と操作
    src/page.html        ひな型（ビルド時に上記を埋め込む）
    build.js             → sengoku-map.html（配布する一枚もの）

    node build.js

## 地図のつくり

海岸線を偶奇規則で塗ってから、旧国の代表点による最近傍分割（陸地に限定した
ボロノイ図）で国を切っている。実際の国境線ではなく、位置関係を保った概略図。
陸奥・出羽は広大で大名も分立したため後世の細分で、信濃は南北に分けて表示する。

## 開発用ツール

    node tools/preview.js         国の割り当てを PNG に描き出す
    node tools/audit.js           各国の面積と重心を点検する
    node tools/adjacency.js       全期間で隣り合った大名家の組を洗い出す
    node tools/palette-solve.js   その隣接関係のもとで配色を最適化する
    node tools/palette-report.js  いまの配色を採点する
    node tools/shoot.js 1560      実ブラウザで開いて描画を確認する（要 playwright）

色は「地図上で実際に隣り合った組」を全期間から機械的に洗い出し、そのすべてで
見分けがつくよう選んである。通常視の色差 ΔE15 を基準、P型・D型・T型色覚では
ΔE8 を目標・6 を下限とし、色だけに頼らないようすべての領地に家名を重ねている。
