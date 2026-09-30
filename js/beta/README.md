# ベータ機能の追加場所

新機能は `features/` に置き、`features/index.js` の `betaFeatures` に登録します。
各機能は同期的な `mount({ root, host, storage })` を持ち、OFF時に呼び出す解除関数を返します。
`root` はアプリ全体、`host` は設定内のベータ機能表示領域です。
イベント登録や追加表示は mount 内で行い、解除関数でイベント・DOM・タイマーを戻してください。
モジュールのトップレベルで機能を実行しないでください。

```js
export const exampleFeature = {
    mount({ host }) {
        const label = document.createElement('p');
        label.textContent = '新機能';
        host.append(label);
        return () => label.remove();
    }
};
```

設定のパスワード解放とON/OFFは `LiliceQuizBeta` に保存されます。
初期状態は未解放・OFF、解放成功時はONになり、以後は再入力不要です。
スイッチは即時反映され、通常設定のキャンセルでは元に戻りません。
ブラウザの保存データを消すと未解放に戻ります。

## 早押し名前読み上げ

`features/buzzer-name-speech.js` が、受け付けた早押しの `lilice:buzz` イベント
（detail: `{ playerId, name }`）を受けて名前を日本語で読み上げます。
受付外・長押し・同一問題での重複は読み上げません。順番待ちの受付も押した順に読みます。
`lilice:buzzer-reset`、読み上げOFF、ベータOFFで残りの発声を取り消します。
名前読み上げのON/OFFと音量は `LiliceQuizBetaNameSpeech` に保存します。
ブラウザのWeb Speech APIを使い、利用できる日本語音声を優先します。
日本語音声一覧が後から読み込まれた場合も、発声時に最新の一覧を使います。

これは静的サイトの簡易ロックで、サーバー認証や機密情報の保護は行いません。
ベータ用コード自体は公開ファイルとして配信されます。パスワードそのものは保存せず、SHA-256で照合します。
