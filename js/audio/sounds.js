export const soundTypes = Object.freeze(['buzzer', 'correct', 'incorrect', 'win', 'lose', 'reach']);

// 効果音の生成・アップロード・保存と設定画面の音量操作を管理する。
export function createSoundController({ getVolumes, saveSettings }) {
    const sounds = {
        buzzer: null,
        correct: null,
        incorrect: null,
        win: null,
        lose: null,
        reach: null,
    };

    // --- データ保存・復元 (LocalStorage & IndexedDB) ---
    const DB_NAME = 'LiliceQuizDB';
    const STORE_NAME = 'soundsStore';
    let idb;

    function initDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                idb = e.target.result;
                if (!idb.objectStoreNames.contains(STORE_NAME)) {
                    idb.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = (e) => {
                idb = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e);
        });
    }

    // 音声ファイルがセットされているかUIに表示する関数
    function updateSoundStatus(type, isLoaded) {
        const input = document.getElementById(`sound-${type}`);
        if (!input) return;
        let badge = document.getElementById(`badge-${type}`);
        if (!badge) {
            badge = document.createElement('span');
            badge.id = `badge-${type}`;
            badge.className =
                'ml-2 text-xs font-bold px-2 py-1 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-500 whitespace-nowrap shrink-0';
            badge.textContent = '✅ 保存済';
            input.parentNode.appendChild(badge);
        }
        badge.style.display = isLoaded ? 'inline-block' : 'none';
    }

    function saveSoundToDB(type, file) {
        if (!idb) return;
        // Fileオブジェクトをそのまま保存すると一部ブラウザで消えるため、Base64(DataURL)に変換して確実に保存する
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const tx = idb.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(dataUrl, type);
            updateSoundStatus(type, true); // 保存できたらバッジを表示
        };
        reader.readAsDataURL(file);
    }

    function loadSoundsFromDB() {
        if (!idb) return;
        const tx = idb.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        const keysReq = store.getAllKeys();

        req.onsuccess = () => {
            keysReq.onsuccess = () => {
                const dataUrls = req.result; // 保存されているDataURL配列
                const keys = keysReq.result;
                for (let i = 0; i < keys.length; i++) {
                    const type = keys[i];
                    const dataUrl = dataUrls[i];
                    if (dataUrl) {
                        sounds[type] = new Audio(dataUrl);
                        sounds[type].volume = getVolumes()[type];
                        updateSoundStatus(type, true); // 読み込みできたらバッジを表示
                    }
                }
            };
        };
    }

    // --- Web Audio API (フォールバック・デフォルト音用) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playDefaultSound(type) {
        const vol = getVolumes()[type] ?? 0;
        if (vol <= 0) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'buzzer') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
            gain.gain.setValueAtTime(1 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        } else if (type === 'correct') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, t); // E5
            gain.gain.setValueAtTime(0.5 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.frequency.setValueAtTime(523.25, t + 0.3); // C5
            gain2.gain.setValueAtTime(0.5 * vol, t + 0.3);
            gain2.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.8);
            osc2.start(t + 0.3);
            osc2.stop(t + 0.8);
        } else if (type === 'incorrect') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            gain.gain.setValueAtTime(0.5 * vol, t);
            gain.gain.setValueAtTime(0.5 * vol, t + 0.2);
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sawtooth';
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.frequency.setValueAtTime(150, t + 0.4);
            gain2.gain.setValueAtTime(0.5 * vol, t + 0.4);
            gain2.gain.setValueAtTime(0.5 * vol, t + 0.6);
            gain2.gain.linearRampToValueAtTime(0, t + 0.7);
            osc2.start(t + 0.4);
            osc2.stop(t + 0.7);
        } else if (type === 'win') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554.37, t + 0.1);
            osc.frequency.setValueAtTime(659.25, t + 0.2);
            osc.frequency.setValueAtTime(880, t + 0.3);
            gain.gain.setValueAtTime(0.3 * vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'lose') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.linearRampToValueAtTime(50, t + 1);
            gain.gain.setValueAtTime(0.5 * vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 1);
            osc.start(t);
            osc.stop(t + 1);
        } else if (type === 'reach') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, t);
            osc.frequency.setValueAtTime(880, t + 0.12);
            gain.gain.setValueAtTime(0.35 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.45);
        }
    }

    // 音を鳴らす共通関数
    function playSound(type) {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (sounds[type]) {
            sounds[type].currentTime = 0; // 連続で鳴らせるように頭出し
            sounds[type].volume = getVolumes()[type];
            sounds[type].play().catch((e) => {
                console.warn('カスタム音声の再生に失敗しました', e);
                playDefaultSound(type); // エラー時はデフォルト音
            });
        } else {
            playDefaultSound(type); // 設定されていない場合はデフォルト音
        }
    }

    // サウンドファイル選択イベント
    soundTypes.forEach((type) => {
        document.getElementById(`sound-${type}`).addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                sounds[type] = new Audio(url);
                sounds[type].volume = getVolumes()[type];
                // テスト再生
                playSound(type);
                // データベースへ保存
                saveSoundToDB(type, file);
            }
        });
        // 音量スライダーイベント
        document.getElementById(`vol-${type}`).addEventListener('input', (e) => {
            getVolumes()[type] = parseFloat(e.target.value);
            if (sounds[type]) {
                sounds[type].volume = getVolumes()[type];
            }
        });
        // スライダーを離したときにテスト再生して保存
        document.getElementById(`vol-${type}`).addEventListener('change', (e) => {
            playSound(type);
            saveSettings();
        });
    });

    return { playSound, initDB, loadSoundsFromDB };
}
