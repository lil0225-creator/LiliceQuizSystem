const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const test = require('node:test');
const { buildSync } = require('esbuild');
const { webcrypto } = require('node:crypto');
const appScript = buildSync({
    entryPoints: ['js/app.js'],
    bundle: true,
    write: false,
    format: 'iife',
}).outputFiles[0].text;
const source = fs
    .readFileSync('index.html', 'utf8')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
function boot({ beta = true, supported = true, speechState = null } = {}) {
    const calls = [],
        errors = [];
    let cancelled = 0;
    const data = {};
    if (beta) data.LiliceQuizBeta = JSON.stringify({ unlocked: true, enabled: true });
    if (speechState) data.LiliceQuizBetaNameSpeech = JSON.stringify(speechState);
    const html = source.replace('</body>', `<script>${appScript}</script></body>`);
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(e.message));
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'https://review.invalid',
        virtualConsole: vc,
        beforeParse(w) {
            Object.entries(data).forEach(([key, value]) => w.localStorage.setItem(key, value));
            w.TextEncoder = TextEncoder;
            Object.defineProperty(w.crypto, 'subtle', {
                value: { digest: (...args) => webcrypto.subtle.digest(...args) },
            });
            const param = {
                setValueAtTime() {},
                exponentialRampToValueAtTime() {},
                linearRampToValueAtTime() {},
            };
            w.AudioContext = function () {
                this.state = 'running';
                this.currentTime = 0;
                this.destination = {};
                this.createOscillator = () => ({
                    frequency: param,
                    connect() {},
                    start() {},
                    stop() {},
                });
                this.createGain = () => ({ gain: param, connect() {} });
            };
            w.indexedDB = {
                open() {
                    throw Error('No preview sound DB');
                },
            };
            if (supported) {
                w.SpeechSynthesisUtterance = function (text) {
                    this.text = text;
                };
                w.speechSynthesis = {
                    speak: (u) => calls.push(u),
                    cancel: () => cancelled++,
                    getVoices: () => [
                        { lang: 'en-US', name: 'English' },
                        { lang: 'ja-JP', name: 'Japanese', localService: true },
                    ],
                };
            }
        },
    });
    const doc = dom.window.document;
    const press = (key, repeat = false) =>
        dom.window.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles: true }),
        );
    const change = (id, value) => {
        const el = doc.getElementById(id);
        el.value = value;
        el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    };
    return { dom, doc, calls, errors, press, change, cancelled: () => cancelled };
}
test('早押し・読み上げ・ベータ切り替えの連携', () => {
    let app = boot();
    app.press('1');
    assert.equal(app.calls.length, 0); // reader cannot buzz
    app.press('2');
    assert.equal(app.calls[0].text, 'プレイヤー2');
    assert.equal(app.calls[0].lang, 'ja-JP');
    assert.equal(app.calls[0].voice.name, 'Japanese');
    assert.equal(app.calls[0].volume, 0.5);
    app.press('2');
    app.press('2', true);
    app.press('3');
    assert.equal(app.calls.length, 1); // duplicate, hold and single-mode lockout
    app.doc.getElementById('btn-reset').click();
    assert.equal(app.cancelled(), 1);
    app.doc.getElementById('rule-summary').click();
    app.change('rule-preset', '5-2');
    app.doc.getElementById('btn-close-rule-settings').click();
    app.press('2');
    app.press('3');
    app.press('4');
    assert.deepEqual(
        app.calls.slice(1).map((u) => u.text),
        ['プレイヤー2', 'プレイヤー3', 'プレイヤー4'],
    );
    app.doc.getElementById('btn-reset').click();
    assert.equal(app.cancelled(), 2);
    app.doc.getElementById('btn-settings').click();
    app.doc.getElementById('beta-name-speech').click();
    app.doc.getElementById('btn-close-settings').click();
    app.press('2');
    assert.equal(app.calls.length, 4);
    app.doc.getElementById('btn-reset').click();
    app.doc.getElementById('btn-settings').click();
    app.doc.getElementById('beta-name-speech').click();
    const volume = app.doc.getElementById('beta-name-speech-volume');
    volume.value = '.8';
    volume.dispatchEvent(new app.dom.window.Event('input'));
    app.doc.getElementById('btn-test-name-speech').click();
    assert.equal(app.calls.at(-1).volume, 0.8);
    app.doc.getElementById('beta-mode').click();
    assert.equal(app.cancelled(), 3);
    assert.equal(app.doc.getElementById('beta-name-speech'), null);
    app.doc.getElementById('btn-close-settings').click();
    app.press('2');
    assert.equal(app.calls.length, 5);
    app.doc.getElementById('btn-reset').click();
    app.doc.getElementById('btn-settings').click();
    app.doc.getElementById('beta-mode').click();
    assert.equal(app.doc.getElementById('beta-name-speech-volume').value, '0.8');
    app.doc.getElementById('btn-close-settings').click();
    app.press('3');
    assert.equal(app.calls.length, 6);
    assert.equal(app.calls.at(-1).text, 'プレイヤー3'); // no duplicate listener after remount
    assert.deepEqual(app.errors, []);
    app.dom.window.close();

    app = boot({ beta: false });
    app.press('2');
    assert.equal(app.calls.length, 0);
    assert.equal(app.doc.getElementById('beta-name-speech'), null);
    app.dom.window.close();
    app = boot({ supported: false });
    assert(app.doc.getElementById('beta-name-speech').disabled);
    app.press('2');
    assert.deepEqual(app.errors, []);
    app.dom.window.close();
    app = boot({ speechState: { enabled: false, volume: 0.7 } });
    assert(!app.doc.getElementById('beta-name-speech').checked);
    app.press('2');
    assert.equal(app.calls.length, 0);
    app.dom.window.close();
    app = boot({ speechState: { enabled: true, volume: 0 } });
    app.press('2');
    assert.equal(app.calls.length, 0);
    app.dom.window.close();
    app = boot();
    app.press('2');
    app.calls[0].onerror({ error: 'not-allowed' });
    assert.match(app.doc.getElementById('beta-name-speech-message').textContent, /テスト/);
    app.dom.window.close();
});

test('設定のテーマ変更をキャンセルでき、採点を取り消せる', () => {
    const app = boot({ beta: false });
    app.doc.getElementById('btn-settings').click();
    app.change('screen-theme', 'paper');
    assert.equal(app.doc.body.dataset.theme, 'paper');
    app.doc.getElementById('btn-close-settings').click();
    assert.equal(app.doc.body.dataset.theme, 'classic');
    app.press('2');
    app.doc.getElementById('btn-correct').click();
    const state = JSON.parse(app.dom.window.localStorage.getItem('LiliceQuizState'));
    assert.equal(state.players[1].correct, 1);
    app.doc.getElementById('btn-undo').click();
    const restored = JSON.parse(app.dom.window.localStorage.getItem('LiliceQuizState'));
    assert.equal(restored.players[1].correct, 0);
    assert.deepEqual(app.errors, []);
    app.dom.window.close();
});

test('ベータのパスワード判定・解放・OFFの保存', async () => {
    const app = boot({ beta: false });
    app.doc.getElementById('btn-settings').click();
    const input = app.doc.getElementById('beta-password');
    const button = app.doc.getElementById('btn-unlock-beta');
    async function unlock(password) {
        input.value = password;
        button.click();
        for (let attempt = 0; attempt < 100 && button.disabled; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        assert.equal(button.disabled, false);
    }
    await unlock('wrong');
    assert.equal(app.doc.body.dataset.betaMode, 'off');
    // 実パスワードを公開せず、検証済みハッシュを返すテスト専用の暗号 API を使う。
    const expectedHash = fs
        .readFileSync('js/beta/index.js', 'utf8')
        .match(/PASSWORD_HASH = '([a-f0-9]+)'/)[1];
    app.dom.window.crypto.subtle.digest = async () =>
        Uint8Array.from(Buffer.from(expectedHash, 'hex')).buffer;
    await unlock('test-only-unlock-fixture');
    assert.equal(app.doc.body.dataset.betaMode, 'on');
    assert.equal(input.value, '');
    app.doc.getElementById('beta-mode').click();
    assert.deepEqual(JSON.parse(app.dom.window.localStorage.getItem('LiliceQuizBeta')), {
        unlocked: true,
        enabled: false,
    });
    assert.deepEqual(app.errors, []);
    app.dom.window.close();
});
