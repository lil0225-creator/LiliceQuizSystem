# ベータ機能の追加場所

新機能は `features/` に置き、`features/index.js` の `betaFeatures` に登録します。
各機能は同期的な `mount({ root, host })` を持ち、OFF時に呼び出す解除関数を返します。
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

これは静的サイトの簡易ロックで、サーバー認証や機密情報の保護は行いません。
ベータ用コード自体は公開ファイルとして配信されます。パスワードそのものは保存せず、SHA-256で照合します。
