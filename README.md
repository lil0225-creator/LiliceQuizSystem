# LiliceQuizSystem

早押しクイズの進行と得点を管理するブラウザアプリです。プレイヤーの登録、解答キー、採点ルール、対決、戦歴、テーマ、効果音を設定できます。

公開サイト: https://lil0225-creator.github.io/LiliceQuizSystem/

## ローカルで動かす

Node.js 20 以上と Python 3 を使用します。

```sh
npm ci
npm run check
npm run dev
```

http://localhost:8000/ を開いてください。JavaScript は ES Modules のため、HTML を直接開かず HTTP サーバー経由で使います。

## ファイル構成

- `index.html`: 各画面のマークアップ
- `css/style.css`: テーマ・画面・入力部品のスタイル
- `css/tailwind.css` / `css/utilities.css`: Tailwind の入力 / 公開用の生成済み CSS
- `js/app.js`: クイズ進行、プレイヤー、画面イベント、設定の保存
- `js/audio/sounds.js`: 効果音の生成・再生・アップロード・IndexedDB 保存
- `js/rules/`: プリセット、解答方式、採点ルール
- `js/beta/`: ベータモードと追加機能（詳細は同フォルダの README）
- `tests/`: 実際の画面とアプリを読み込む回帰テスト

## 変更と公開

HTML または JavaScript 内の Tailwind クラスを変更したら `npm run build` で `css/utilities.css` を再生成し、一緒にコミットします。公開サイトでは Tailwind の CDN スクリプトを実行しません。GitHub Pages はビルド済み CSS と ES Modules をそのまま配信できます。

コードの書式は `npm run format` で統一できます。

公開前に `npm run check` を実行し、ブラウザでテーマ、設定、早押し、採点、音声を確認してください。自動テストの音声 API はスタブなので、実際の音質や端末ごとの音声対応はブラウザで確認します。

## 保存データとベータ機能

設定・プレイヤー・戦歴・ベータ設定はブラウザの LocalStorage、アップロードした効果音は IndexedDB に保存します。端末やブラウザを変えると引き継がれません。サイトデータを削除するとこれらも消えます。

ベータモードのパスワードは実験機能を表示するための切り替えです。クライアント側で判定するため、アクセス制限や認証としては使いません。読み上げにはブラウザの Web Speech API を使います。
