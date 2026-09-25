// --- 状態管理 (State) ---
        let players = [
            { id: 'p1', key: '1', name: 'プレイヤー1', buttonColor: 'red', correct: 0, incorrect: 0, status: 'active' }, // status: active, win, lose
            { id: 'p2', key: '2', name: 'プレイヤー2', buttonColor: 'blue', correct: 0, incorrect: 0, status: 'active' },
            { id: 'p3', key: '3', name: 'プレイヤー3', buttonColor: 'green', correct: 0, incorrect: 0, status: 'active' },
            { id: 'p4', key: '4', name: 'プレイヤー4', buttonColor: 'yellow', correct: 0, incorrect: 0, status: 'active' }
        ];
        let readerId = 'p1';
        let waitingForPlayerKeyId = '';
        let matchHistory = [];

        const buttonColors = [
            { id: 'red', label: '赤', key: '1', hex: '#f43f5e' },
            { id: 'blue', label: '青', key: '2', hex: '#3b82f6' },
            { id: 'green', label: '緑', key: '3', hex: '#10b981' },
            { id: 'yellow', label: '黄', key: '4', hex: '#f59e0b' }
        ];

        function getButtonColorInfo(colorId, index = 0) {
            return buttonColors.find(color => color.id === colorId) || buttonColors[index % buttonColors.length];
        }

        function ensureButtonColors() {
            players.forEach((player, index) => {
                const colorInfo = getButtonColorInfo(player.buttonColor, index);
                player.buttonColor = colorInfo.id;
                if (!player.key) player.key = colorInfo.key;
            });
        }

        let systemKeys = {
            correct: 'o',
            incorrect: 'x',
            reset: ' ' // space
        };

        let mode = 'single'; // 'single' or 'endless'
        let winCondition = 3;
        let loseCondition = 2;

        let queue = []; // 早押ししたプレイヤーのid配列
        let isAcceptingInputs = true; // 誰も押していない状態か
        let currentAnsweringIndex = -1; // queueの中で現在解答権を持っている人のインデックス

        let stateHistory = []; // Undo用履歴
        let isScoreEditMode = false; // 得点編集モード

        let soundVolumes = {
            buzzer: 1.0,
            correct: 1.0,
            incorrect: 1.0,
            win: 1.0,
            lose: 1.0,
            reach: 1.0
        };

        const sounds = {
            buzzer: null,
            correct: null,
            incorrect: null,
            win: null,
            lose: null,
            reach: null
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
                badge.className = 'ml-2 text-xs font-bold px-2 py-1 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-500 whitespace-nowrap shrink-0';
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
                            sounds[type].volume = soundVolumes[type];
                            updateSoundStatus(type, true); // 読み込みできたらバッジを表示
                        }
                    }
                };
            };
        }

        function saveAppState() {
            const state = {
                players, readerId, systemKeys, mode, winCondition, loseCondition, soundVolumes, matchHistory
            };
            localStorage.setItem('LiliceQuizState', JSON.stringify(state));
        }

        function loadAppState() {
            const saved = localStorage.getItem('LiliceQuizState');
            if (saved) {
                try {
                    const state = JSON.parse(saved);
                    if (state.players) players = state.players;
                    if (state.readerId) readerId = state.readerId;
                    if (state.systemKeys) systemKeys = state.systemKeys;
                    if (state.mode) mode = state.mode;
                    if (state.winCondition) winCondition = state.winCondition;
                    if (state.loseCondition) loseCondition = state.loseCondition;
                    if (state.soundVolumes) soundVolumes = { ...soundVolumes, ...state.soundVolumes };
                    if (state.matchHistory) matchHistory = state.matchHistory;
                } catch (e) {
                    console.error('Failed to load state', e);
                }
            }
            ensureButtonColors();
        }

        function renderHistory() {
            const container = document.getElementById('history-list');
            if (matchHistory.length === 0) {
                container.innerHTML = '<p class="text-slate-400 text-center py-8">まだ戦歴がありません。</p>';
                return;
            }

            const totals = {};
            matchHistory.forEach(match => match.players.forEach(record => {
                if (!totals[record.id]) totals[record.id] = { name: record.name, correct: 0, incorrect: 0 };
                totals[record.id].name = record.name;
                totals[record.id].correct += record.correct;
                totals[record.id].incorrect += record.incorrect;
            }));
            const totalRows = Object.values(totals).map(record => `
                <div class="flex justify-between items-center bg-slate-700/60 rounded p-3">
                    <span class="font-bold text-white truncate mr-4">${record.name}</span>
                    <span class="font-Lilice text-lg whitespace-nowrap"><span class="text-emerald-400">〇${record.correct}</span><span class="text-rose-400 ml-4">✖${record.incorrect}</span></span>
                </div>
            `).join('');

            const detailSections = [...matchHistory].reverse().map((match, index) => {
                const rows = match.players.map(record => `
                    <div class="flex justify-between items-center bg-slate-700/60 rounded p-3">
                        <span class="font-bold text-white truncate mr-4">${record.name}</span>
                        <span class="font-Lilice text-lg whitespace-nowrap"><span class="text-emerald-400">〇${record.correct}</span><span class="text-rose-400 ml-4">✖${record.incorrect}</span></span>
                    </div>
                `).join('');
                return `<section><h3 class="text-cyan-300 font-bold mb-2">セット ${matchHistory.length - index} / ${match.date}</h3><div class="space-y-2">${rows}</div></section>`;
            }).join('');
            container.innerHTML = `<section><h3 class="text-amber-300 font-bold mb-2">累計</h3><div class="space-y-2">${totalRows}</div></section><section><h3 class="text-cyan-300 font-bold mb-2">セット別戦歴</h3><div class="space-y-4">${detailSections}</div></section>`;
        }

        function applyStateToUI() {
            ui.winScoreInput.value = winCondition;
            ui.loseScoreInput.value = loseCondition;
            if (mode === 'single') {
                ui.modeSingle.className = 'flex-1 py-1 text-xs font-bold rounded bg-cyan-600 text-white';
                ui.modeEndless.className = 'flex-1 py-1 text-xs font-bold rounded text-slate-400 hover:text-white';
            } else {
                ui.modeEndless.className = 'flex-1 py-1 text-xs font-bold rounded bg-cyan-600 text-white';
                ui.modeSingle.className = 'flex-1 py-1 text-xs font-bold rounded text-slate-400 hover:text-white';
            }
            soundTypes.forEach(type => {
                const volSlider = document.getElementById(`vol-${type}`);
                if (volSlider && soundVolumes[type] !== undefined) {
                    volSlider.value = soundVolumes[type];
                }
            });
        }

        // --- Web Audio API (フォールバック・デフォルト音用) ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function playDefaultSound(type) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            const vol = soundVolumes[type];

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
                sounds[type].volume = soundVolumes[type];
                sounds[type].play().catch(e => {
                    console.warn('カスタム音声の再生に失敗しました', e);
                    playDefaultSound(type); // エラー時はデフォルト音
                });
            } else {
                playDefaultSound(type); // 設定されていない場合はデフォルト音
            }
        }

        // --- カスタムメッセージボックス機能 ---
        const customMsg = {
            overlay: document.getElementById('custom-msg-box'),
            text: document.getElementById('custom-msg-text'),
            btnOk: document.getElementById('custom-msg-ok'),
            btnCancel: document.getElementById('custom-msg-cancel')
        };
        let msgConfirmCallback = null;

        function showMessage(text, callback = null, isConfirm = false) {
            customMsg.text.textContent = text;
            msgConfirmCallback = callback;
            
            if (isConfirm) {
                customMsg.btnCancel.classList.remove('hidden');
            } else {
                customMsg.btnCancel.classList.add('hidden');
            }
            
            customMsg.overlay.classList.remove('hidden');
        }

        customMsg.btnOk.addEventListener('click', () => {
            customMsg.overlay.classList.add('hidden');
            if (msgConfirmCallback) msgConfirmCallback();
        });

        customMsg.btnCancel.addEventListener('click', () => {
            customMsg.overlay.classList.add('hidden');
            msgConfirmCallback = null;
        });

        // サウンドファイル選択イベント
        const soundTypes = ['buzzer', 'correct', 'incorrect', 'win', 'lose', 'reach'];
        soundTypes.forEach(type => {
            document.getElementById(`sound-${type}`).addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    sounds[type] = new Audio(url);
                    sounds[type].volume = soundVolumes[type];
                    // テスト再生
                    playSound(type);
                    // データベースへ保存
                    saveSoundToDB(type, file);
                }
            });
            // 音量スライダーイベント
            document.getElementById(`vol-${type}`).addEventListener('input', (e) => {
                soundVolumes[type] = parseFloat(e.target.value);
                if (sounds[type]) {
                    sounds[type].volume = soundVolumes[type];
                }
            });
            // スライダーを離したときにテスト再生して保存
            document.getElementById(`vol-${type}`).addEventListener('change', (e) => {
                playSound(type);
                saveAppState();
            });
        });

        // 状態保存 (Undo用)
        function saveState() {
            stateHistory.push({
                players: JSON.parse(JSON.stringify(players)),
                queue: [...queue],
                isAcceptingInputs: isAcceptingInputs,
                currentAnsweringIndex: currentAnsweringIndex,
                matchHistory: JSON.parse(JSON.stringify(matchHistory)),
                readerId: readerId,
                mode: mode,
                winCondition: winCondition,
                loseCondition: loseCondition
            });
            if (stateHistory.length > 30) stateHistory.shift(); // 最大30件保存
            updateUndoButton();
            saveAppState(); // 全体状態も保存
        }

        function undo() {
            if (stateHistory.length === 0) return;
            const prevState = stateHistory.pop();
            players = prevState.players;
            queue = prevState.queue;
            isAcceptingInputs = prevState.isAcceptingInputs;
            currentAnsweringIndex = prevState.currentAnsweringIndex;
            matchHistory = prevState.matchHistory || [];
            readerId = prevState.readerId || '';
            mode = prevState.mode;
            winCondition = prevState.winCondition;
            loseCondition = prevState.loseCondition;
            
            updateDisplay();
            updateUndoButton();
            applyStateToUI();
            saveAppState();
            // 勝ち抜け/失格UIなどが表示されていたら消す
            ui.resultOverlay.classList.add('hidden');
        }

        function updateUndoButton() {
            if (stateHistory.length > 0) {
                ui.btnUndo.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                ui.btnUndo.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }

        // キー表示用ヘルパー
        function getDisplayKey(key) {
            if (key === ' ') return 'SPACE';
            if (key === 'enter') return 'ENTER';
            if (key === 'escape') return 'ESC';
            return key;
        }

        // フォーカスを完全に外すヘルパー関数
        function clearFocus() {
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
        }

        document.addEventListener('click', event => {
            if (event.target.closest('button')) {
                setTimeout(clearFocus, 0);
            }
        });

        // --- DOM Elements ---
        const ui = {
            statusDisplay: document.getElementById('status-display'),
            currentAnswerer: document.getElementById('current-answerer'),
            btnCorrect: document.getElementById('btn-correct'),
            btnIncorrect: document.getElementById('btn-incorrect'),
            btnReset: document.getElementById('btn-reset'),
            playerList: document.getElementById('player-list'),
            modeSingle: document.getElementById('mode-single'),
            modeEndless: document.getElementById('mode-endless'),
            winScoreInput: document.getElementById('win-condition'),
            loseScoreInput: document.getElementById('lose-condition'),
            settingsModal: document.getElementById('settings-modal'),
            playerInputsContainer: document.getElementById('player-inputs-container'),
            resultOverlay: document.getElementById('result-overlay'),
            resultTitle: document.getElementById('result-title'),
            resultName: document.getElementById('result-name'),
            btnCloseResult: document.getElementById('btn-close-result'),
            btnUndo: document.getElementById('btn-undo'),
            btnToggleEditScore: document.getElementById('btn-toggle-edit-score'),
            btnResetScore: document.getElementById('btn-reset-score')
        };

        // --- コアロジック ---

        // キーボード入力監視
        window.addEventListener('keydown', (e) => {
            // 長押し(キーリピート)による連打反応を防止
            if (e.repeat) return;
            
            // --- 設定モーダルが開いていて、キー入力待ちの時 ---
            if (!ui.settingsModal.classList.contains('hidden')) {
                // システムキーの設定
                if (waitingForSystemKey) {
                    e.preventDefault(); e.stopPropagation();
                    const key = e.key.toLowerCase();
                    if (key === 'escape') {
                        showMessage('Escキーは使用できません。');
                        return;
                    }
                    editingSystemKeys[waitingForSystemKey] = key;
                    waitingForSystemKey = null; // 待機解除
                    renderSettingsModal();
                    return;
                }
                return; // 設定中は早押し処理を行わない
            }

            if (waitingForPlayerKeyId) {
                e.preventDefault();
                e.stopPropagation();
                const key = e.key.toLowerCase();
                if (key === 'escape') {
                    waitingForPlayerKeyId = '';
                    updateDisplay();
                    return;
                }
                assignPlayerKey(waitingForPlayerKeyId, key);
                waitingForPlayerKeyId = '';
                updateDisplay();
                saveAppState();
                return;
            }

            // 結果画面を閉じる
            if (!ui.resultOverlay.classList.contains('hidden')) {
                if (e.key.toLowerCase() === 'escape') {
                    ui.btnCloseResult.click();
                }
                return;
            }

            // メッセージボックス表示中は無効
            if (!customMsg.overlay.classList.contains('hidden')) {
                return;
            }

            // 判定ボタンのショートカット (待機中でも音出しのために反応させる)
            if (e.key.toLowerCase() === systemKeys.correct) { 
                e.preventDefault(); ui.btnCorrect.click(); return; 
            }
            if (e.key.toLowerCase() === systemKeys.incorrect) { 
                e.preventDefault(); ui.btnIncorrect.click(); return; 
            }
            
            // リセットショートカット
            if (e.key.toLowerCase() === systemKeys.reset) { 
                e.preventDefault();
                ui.btnReset.click(); 
                return; 
            }
            
            // --- 早押し処理 ---
            if (isAcceptingInputs) {
                const pressedKey = e.key.toLowerCase();
                const player = players.find(p => p.key === pressedKey && p.id !== readerId);
                
                if (player && player.status === 'active' && !queue.includes(player.id)) {
                    e.preventDefault();
                    pushBuzzer(player.id);
                }
            } else if (currentAnsweringIndex >= 0) {
                // 解答中も押せばキューに入る (2着以降)
                const pressedKey = e.key.toLowerCase();
                const player = players.find(p => p.key === pressedKey && p.id !== readerId);
                if (player && player.status === 'active' && !queue.includes(player.id)) {
                    e.preventDefault();
                    queue.push(player.id);
                    updateDisplay();
                }
            }
        });

        // ボタンクリック処理
        ui.btnUndo.addEventListener('click', () => {
            ui.btnUndo.blur();
            undo();
        });

        ui.btnCorrect.addEventListener('click', () => {
            // 解答者がいない時は音を鳴らすだけ (Undo履歴には残さない)
            if (currentAnsweringIndex < 0 || currentAnsweringIndex >= queue.length) {
                playSound('correct');
                return;
            }

            saveState(); // 状態保存

            const pid = queue[currentAnsweringIndex];
            const p = players.find(x => x.id === pid);
            if (!p) return;

            p.correct++;
            playSound('correct');
            
            if (p.correct >= winCondition) {
                p.status = 'win';
                setTimeout(() => {
                    playSound('win');
                    showResultOverlay(p.name, 'WINNER!', 'text-amber-400');
                }, 500);
            } else if (p.correct === winCondition - 1 && winCondition > 1) {
                // リーチに到達した瞬間
                playSound('reach');
                showCutin(`${p.name} REACH!`, 'reach');
            }
            
            // シングル・エンドレスに関わらず、正解が出たらその問題は終了し、リセットする
            resetBuzzer(false);
            updateDisplay();
            saveAppState();
        });

        ui.btnIncorrect.addEventListener('click', () => {
            // 解答者がいない時は音を鳴らすだけ
            if (currentAnsweringIndex < 0 || currentAnsweringIndex >= queue.length) {
                playSound('incorrect');
                return;
            }

            saveState(); // 状態保存

            const pid = queue[currentAnsweringIndex];
            const p = players.find(x => x.id === pid);
            if (!p) return;

            p.incorrect++;
            playSound('incorrect');

            if (p.incorrect >= loseCondition) {
                p.status = 'lose';
                setTimeout(() => {
                    playSound('lose');
                    showResultOverlay(p.name, 'DISQUALIFIED', 'text-rose-500');
                }, 500);
            } else if (p.incorrect === loseCondition - 1 && loseCondition > 1) {
                // 飛びリーチ(失格まであと1)に到達した瞬間
                showCutin('DANGER!', 'danger');
            }

            if (mode === 'single') {
                // シングルチャンス: 間違えたらその問題は終了
                resetBuzzer(false);
            } else {
                // エンドレスチャンス: 次の人へ
                currentAnsweringIndex++;
                if (currentAnsweringIndex < queue.length) {
                    setTimeout(() => playSound('buzzer'), 300); // 次の人が鳴る
                } else {
                    // 解答者がもういない場合、待機状態にする
                    isAcceptingInputs = false;
                    currentAnsweringIndex = -1;
                }
            }
            
            updateDisplay();
            saveAppState();
        });

        ui.btnReset.addEventListener('click', () => {
            // 早押しがされていた場合のみ履歴に残す
            if (queue.length > 0) saveState();
            resetBuzzer(false);
        });

        ui.btnCloseResult.addEventListener('click', () => {
            ui.resultOverlay.classList.add('hidden');
        });

        document.getElementById('btn-history').addEventListener('click', () => {
            renderHistory();
            document.getElementById('history-modal').classList.remove('hidden');
        });

        document.getElementById('btn-close-history').addEventListener('click', () => {
            document.getElementById('history-modal').classList.add('hidden');
        });

        document.getElementById('btn-clear-history').addEventListener('click', () => {
            showMessage('保存されている戦歴をすべて削除しますか？', () => {
                matchHistory = [];
                saveAppState();
                renderHistory();
            }, true);
        });

        // 試合(スコア)リセット
        ui.btnResetScore.addEventListener('click', () => {
            // フォーカスを外す(Enterキー連打等による誤動作防止)
            ui.btnResetScore.blur();
            
            showMessage('すべてのスコアをゼロに戻して、新しい試合を始めますか？', () => {
                saveState(); // 状態保存
                const hasScore = players.some(player => player.correct > 0 || player.incorrect > 0);
                if (hasScore) {
                    matchHistory.push({
                        date: new Date().toLocaleString('ja-JP'),
                        players: players.map(player => ({
                            id: player.id,
                            name: player.name,
                            correct: player.correct,
                            incorrect: player.incorrect
                        }))
                    });
                }
                players.forEach(p => {
                    p.correct = 0;
                    p.incorrect = 0;
                    p.status = 'active';
                });
                resetBuzzer(false); // 早押し状態もリセットし、画面を更新
                saveAppState();
            }, true); // 第3引数trueで「キャンセル」ボタンを表示
        });

        // 早押し実行
        function pushBuzzer(playerId) {
            saveState(); // 誰かが押した瞬間の状態を保存(直前に戻せるように)
            queue.push(playerId);
            isAcceptingInputs = false;
            currentAnsweringIndex = 0;
            playSound('buzzer');
            updateDisplay();
        }

        function resetBuzzer(shouldSaveState = true) {
            if (shouldSaveState && queue.length > 0) saveState();
            queue = [];
            currentAnsweringIndex = -1;
            isAcceptingInputs = true;
            updateDisplay();
        }

        function assignPlayerKey(playerId, key) {
            const player = players.find(item => item.id === playerId);
            if (!player) return;

            const otherPlayer = players.find(item => item.id !== playerId && item.key === key);
            saveState();
            if (otherPlayer) otherPlayer.key = player.key;
            player.key = key;
        }

        function selectReader(nextReaderId) {
            if (!players.some(player => player.id === nextReaderId) || nextReaderId === readerId) return;

            saveState();
            readerId = nextReaderId;
            resetBuzzer(false);
            saveAppState();
            renderReaderPicker();
        }

        function renderReaderPicker() {
            const container = document.getElementById('reader-picker');
            if (!container) return;

            container.innerHTML = '';
            players.forEach(player => {
                const button = document.createElement('button');
                button.className = 'px-4 py-2 rounded border-2 text-sm font-bold transition';
                const isReader = player.id === readerId;
                button.classList.add(isReader ? 'border-amber-300' : 'border-transparent');
                button.classList.add('bg-slate-800');
                button.textContent = `${player.name} (${getDisplayKey(player.key).toUpperCase()})`;
                button.title = '読み手に設定';
                button.addEventListener('click', () => selectReader(player.id));
                container.appendChild(button);
            });
        }

        // カットイン表示関数
        function showCutin(text, type) {
            const container = document.getElementById('cutin-container');
            const box = document.getElementById('cutin-box');
            const textEl = document.getElementById('cutin-text');
            
            textEl.textContent = text;
            
            // typeによって色とテキストスタイルを変える
            box.className = 'w-full backdrop-blur-sm border-y-8 py-4 md:py-8 flex items-center justify-center transform translate-x-full shadow-[0_0_50px_currentColor]';
            if (type === 'reach') {
                box.classList.add('bg-emerald-600/90', 'border-emerald-300', 'text-emerald-400');
            } else if (type === 'danger') {
                box.classList.add('bg-rose-700/90', 'border-rose-300', 'text-rose-500');
            }
            
            container.classList.remove('hidden');
            box.classList.remove('animate-cutin');
            
            // リフローを強制してアニメーションを最初から再スタートさせるハック
            void box.offsetWidth; 
            
            box.classList.add('animate-cutin');
            
            // アニメーション終了後に隠す
            setTimeout(() => {
                container.classList.add('hidden');
            }, 2000);
        }

        // 画面更新
        function updateDisplay() {
            // メインエリア
            if (isAcceptingInputs) {
                ui.statusDisplay.textContent = 'WAITING...';
                ui.statusDisplay.classList.remove('hidden');
                ui.currentAnswerer.classList.add('hidden');
                ui.currentAnswerer.classList.remove('animate-flash');
                
                // 待機中もボタンはアクティブ(音出し用)
                ui.btnCorrect.classList.remove('opacity-50', 'cursor-not-allowed');
                ui.btnIncorrect.classList.remove('opacity-50', 'cursor-not-allowed');
            } else if (currentAnsweringIndex >= 0 && currentAnsweringIndex < queue.length) {
                const pid = queue[currentAnsweringIndex];
                const p = players.find(x => x.id === pid);
                if (p) {
                    ui.statusDisplay.classList.add('hidden');
                    ui.currentAnswerer.textContent = p.name;
                    ui.currentAnswerer.classList.remove('hidden');
                    ui.currentAnswerer.classList.add('animate-flash');
                    
                    ui.btnCorrect.classList.remove('opacity-50', 'cursor-not-allowed');
                    ui.btnIncorrect.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            } else {
                // 解答者がいない待機状態 (エンドレスで全員不正解など)
                ui.statusDisplay.textContent = 'NO ONE LEFT... (PRESS RESET)';
                ui.statusDisplay.classList.remove('hidden');
                ui.currentAnswerer.classList.add('hidden');
                ui.currentAnswerer.classList.remove('animate-flash');
                
                // 待機中もボタンはアクティブ(音出し用)
                ui.btnCorrect.classList.remove('opacity-50', 'cursor-not-allowed');
                ui.btnIncorrect.classList.remove('opacity-50', 'cursor-not-allowed');
            }

            // 人数に応じて文字サイズを動的に決定 (プロポーショナル化)
            // ▼▼全体的にサイズを一段階小さくしました▼▼
            const scoringPlayers = players.filter(player => player.id !== readerId);
            let nameSize = 'text-2xl';
            let scoreSize = 'text-4xl';
            
            if (scoringPlayers.length <= 2) {
                nameSize = 'text-4xl'; scoreSize = 'text-6xl'; 
            } else if (scoringPlayers.length <= 4) {
                nameSize = 'text-3xl'; scoreSize = 'text-5xl'; 
            } else if (scoringPlayers.length <= 6) {
                nameSize = 'text-2xl'; scoreSize = 'text-4xl'; 
            } else {
                nameSize = 'text-xl'; scoreSize = 'text-3xl'; 
            }
            // ▲▲ここまで▲▲

            // プレイヤーリスト
            ui.playerList.innerHTML = '';
            scoringPlayers.forEach(p => {
                const div = document.createElement('div');
                let statusClass = 'bg-slate-800 text-slate-300 border-2 border-transparent';
                let statusIcon = '';
                
                // リーチ状態判定
                const isReach = (p.correct === winCondition - 1) && (winCondition > 1) && (p.status === 'active');
                const isDanger = (p.incorrect === loseCondition - 1) && (loseCondition > 1) && (p.status === 'active');

                if (p.status === 'win') {
                    statusClass = 'bg-amber-900/50 border-2 border-amber-500 text-amber-200';
                    statusIcon = '🏆 ';
                } else if (p.status === 'lose') {
                    statusClass = 'bg-rose-900/50 border-2 border-rose-500 text-rose-200 opacity-50';
                    statusIcon = '💀 ';
                } else if (isReach) {
                    statusClass = 'bg-emerald-950/80 text-white effect-reach'; // リーチ点滅
                } else if (isDanger) {
                    statusClass = 'bg-rose-950/80 text-white effect-danger'; // 飛びリーチ点滅
                }

                // 着順バッジ生成 (キューに入っている場合表示)
                let orderBadge = '';
                const qIndex = queue.indexOf(p.id);
                if (qIndex !== -1 && qIndex >= currentAnsweringIndex) {
                    const isFirst = qIndex === currentAnsweringIndex;
                    const orderStr = isFirst ? '1st' : `${qIndex - currentAnsweringIndex + 1}nd`;
                    const badgeClass = isFirst ? 'bg-cyan-500 text-slate-900 shadow-[0_0_10px_#06b6d4]' : 'bg-slate-600 text-white border border-slate-500';
                    orderBadge = `<span class="ml-3 px-3 py-1 rounded-full text-lg font-Lilice font-bold align-middle ${badgeClass}">${orderStr}</span>`;
                }

                // flex-1 で縦幅を均等に伸ばす。min-h-0 で潰れを許可
                div.className = `relative p-2 rounded-lg flex justify-between items-center shadow-lg transition-all flex-1 min-h-[60px] ${statusClass}`;
                const keyButton = `<button class="btn-player-key absolute right-1 top-1 px-2 py-1 bg-slate-700/80 hover:bg-slate-600 border border-slate-500 rounded text-xs leading-tight text-cyan-300 font-bold whitespace-nowrap ${waitingForPlayerKeyId === p.id ? 'ring-2 ring-cyan-300 animate-pulse' : ''}" data-id="${p.id}" title="キーを変更">${waitingForPlayerKeyId === p.id ? '入力中' : getDisplayKey(p.key).toUpperCase()}</button>`;
                
                if (isScoreEditMode) {
                    // 編集モードUI
                    div.innerHTML = `
                        ${keyButton}
                        <span class="text-xl font-bold truncate flex-1 mr-2 flex items-center">${statusIcon}${p.name}${orderBadge}</span>
                        <div class="flex gap-1 font-Lilice text-lg shrink-0 items-center">
                            <button class="btn-score-edit px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white active:scale-90 transition" data-id="${p.id}" data-type="correct" data-val="-1">-</button>
                            <span class="text-emerald-400 w-10 text-center font-bold">〇${p.correct}</span>
                            <button class="btn-score-edit px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white mr-1 active:scale-90 transition" data-id="${p.id}" data-type="correct" data-val="1">+</button>
                            
                            <button class="btn-score-edit px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white active:scale-90 transition" data-id="${p.id}" data-type="incorrect" data-val="-1">-</button>
                            <span class="text-rose-400 w-10 text-center font-bold">✖${p.incorrect}</span>
                            <button class="btn-score-edit px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white active:scale-90 transition" data-id="${p.id}" data-type="incorrect" data-val="1">+</button>
                        </div>
                    `;
                } else {
                    // 通常表示UI (可変サイズ適用)
                    div.innerHTML = `
                        ${keyButton}
                        <span class="${nameSize} font-bold truncate flex-1 mr-4 drop-shadow-md flex items-center">${statusIcon}${p.name}${orderBadge}</span>
                        <div class="flex gap-6 font-Lilice ${scoreSize} font-bold tracking-wider shrink-0">
                            <span class="text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">〇${p.correct}</span>
                            <span class="text-rose-400 drop-shadow-[0_0_12px_rgba(251,113,133,0.8)]">✖${p.incorrect}</span>
                        </div>
                    `;
                }
                ui.playerList.appendChild(div);
            });

            document.querySelectorAll('.btn-player-key').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    waitingForPlayerKeyId = event.currentTarget.dataset.id;
                    updateDisplay();
                });
            });

            // 編集モード用のイベントリスナー設定
            if (isScoreEditMode) {
                document.querySelectorAll('.btn-score-edit').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        saveState(); // 編集前に状態保存
                        const id = e.target.dataset.id;
                        const type = e.target.dataset.type; // 'correct' or 'incorrect'
                        const val = parseInt(e.target.dataset.val);
                        
                        const player = players.find(x => x.id === id);
                        if (player) {
                            if (type === 'correct') {
                                player.correct = Math.max(0, player.correct + val);
                                if(player.correct >= winCondition) player.status = 'win';
                                else if(player.incorrect < loseCondition) player.status = 'active';
                            } else if (type === 'incorrect') {
                                player.incorrect = Math.max(0, player.incorrect + val);
                                if(player.incorrect >= loseCondition) player.status = 'lose';
                                else if(player.correct < winCondition) player.status = 'active';
                            }
                            updateDisplay();
                            saveAppState(); // 更新後にも保存
                        }
                    });
                });
            }
        }

        function showResultOverlay(name, title, colorClass) {
            ui.resultTitle.textContent = title;
            ui.resultTitle.className = `text-8xl font-Lilice font-bold mb-4 tracking-widest ${colorClass} drop-shadow-[0_0_20px_currentColor]`;
            ui.resultName.textContent = name;
            ui.resultOverlay.classList.remove('hidden');
        }

        // --- モード・編集・設定イベント ---
        ui.btnToggleEditScore.addEventListener('click', () => {
            ui.btnToggleEditScore.blur();
            isScoreEditMode = !isScoreEditMode;
            if (isScoreEditMode) {
                ui.btnToggleEditScore.classList.replace('bg-slate-700', 'bg-cyan-600');
                ui.btnToggleEditScore.classList.add('ring-2', 'ring-cyan-300');
                ui.btnToggleEditScore.textContent = '✅ 完了';
            } else {
                ui.btnToggleEditScore.classList.replace('bg-cyan-600', 'bg-slate-700');
                ui.btnToggleEditScore.classList.remove('ring-2', 'ring-cyan-300');
                ui.btnToggleEditScore.textContent = '✏️ 編集';
            }
            updateDisplay();
        });

        function setMode(m) {
            mode = m;
            applyStateToUI();
            resetBuzzer();
            saveAppState(); // 変更を保存
        }
        ui.modeSingle.addEventListener('click', () => setMode('single'));
        ui.modeEndless.addEventListener('click', () => setMode('endless'));

        ui.winScoreInput.addEventListener('change', (e) => {
            winCondition = parseInt(e.target.value) || 3;
            e.target.value = winCondition;
            updateDisplay();
            saveAppState();
        });
        ui.loseScoreInput.addEventListener('change', (e) => {
            loseCondition = parseInt(e.target.value) || 2;
            e.target.value = loseCondition;
            updateDisplay();
            saveAppState();
        });

        // --- 設定モーダル ---
        let editingPlayers = [];
        let editingSystemKeys = {};
        let waitingForSystemKey = null; // 'correct', 'incorrect', 'reset'

        document.getElementById('btn-settings').addEventListener('click', () => {
            editingPlayers = JSON.parse(JSON.stringify(players));
            editingSystemKeys = { ...systemKeys };
            renderSettingsModal();
            ui.settingsModal.classList.remove('hidden');
        });

        document.getElementById('btn-close-settings').addEventListener('click', () => {
            ui.settingsModal.classList.add('hidden');
            waitingForSystemKey = null;
        });

        document.getElementById('btn-save-settings').addEventListener('click', () => {
            let hasError = false;
            const newPlayers = [];
            
            document.querySelectorAll('.player-row').forEach(row => {
                const id = row.dataset.id;
                const nameInput = row.querySelector('.player-name-input');
                const idx = parseInt(nameInput.dataset.index);
                const p = editingPlayers[idx];
                if (!p.key) p.key = getButtonColorInfo(p.buttonColor, idx).key;
                
                if (!p.name || p.name.trim() === '') {
                    hasError = true;
                }
                newPlayers.push({ ...p, name: p.name.trim() });
            });

            if (hasError) {
                showMessage('名前をすべて設定してください。');
                return;
            }

            players = newPlayers;
            systemKeys = { ...editingSystemKeys };
            readerId = newPlayers[0]?.id || '';
            ui.settingsModal.classList.add('hidden');
            updateDisplay();
            updateButtonLabels();
            renderReaderPicker();
            saveAppState(); // 保存して閉じたときに状態を記録
        });

        document.getElementById('btn-add-player').addEventListener('click', () => {
            const newId = `new_${Date.now()}`;
            editingPlayers.push({ id: newId, name: `プレイヤー${editingPlayers.length + 1}`, key: '', buttonColor: '', correct:0, incorrect:0, status:'active' });
            renderSettingsModal();
        });

        const systemKeyLabels = {
            correct: '正解 (〇)',
            incorrect: '不正解 (✖)',
            reset: 'リセット'
        };

        function updateButtonLabels() {
            document.getElementById('label-correct-key').textContent = `正解 (${getDisplayKey(systemKeys.correct).toUpperCase()})`;
            document.getElementById('label-incorrect-key').textContent = `不正解 (${getDisplayKey(systemKeys.incorrect).toUpperCase()})`;
            document.getElementById('label-reset-key').textContent = `リセット (${getDisplayKey(systemKeys.reset).toUpperCase()})`;
        }

        function renderSettingsModal() {
            // システムキーの描画
            const sysContainer = document.getElementById('system-keys-container');
            sysContainer.innerHTML = '';
            for (const [keyType, label] of Object.entries(systemKeyLabels)) {
                const div = document.createElement('div');
                div.className = 'flex-1 text-center';
                const currentKey = editingSystemKeys[keyType];
                const displayKey = getDisplayKey(currentKey);
                
                div.innerHTML = `
                    <label class="text-xs text-amber-400 block mb-1">${label}</label>
                    <button class="btn-assign-syskey w-full bg-slate-800 border ${waitingForSystemKey === keyType ? 'border-amber-400 text-amber-300 animate-pulse' : 'border-slate-500 text-white'} hover:border-amber-300 rounded px-2 py-2 text-center outline-none font-Lilice font-bold uppercase transition shadow-inner" data-keytype="${keyType}">
                        ${waitingForSystemKey === keyType ? '入力待ち...' : (displayKey || '未設定')}
                    </button>
                `;
                sysContainer.appendChild(div);
            }

            // プレイヤー設定の描画
            ui.playerInputsContainer.innerHTML = '';
            editingPlayers.forEach((player, index) => {
                const div = document.createElement('div');
                div.className = 'player-row flex gap-4 items-center mb-3 bg-slate-700/50 p-2 rounded transition';
                div.dataset.id = player.id;
                
                div.innerHTML = `
                    <div class="flex-1">
                        <label class="text-xs text-slate-400 block mb-1">名前</label>
                        <input type="text" class="player-name-input w-full bg-slate-800 border border-slate-500 rounded px-2 py-1 text-white outline-none focus:border-cyan-400" value="${player.name}" data-index="${index}">
                    </div>
                    <div class="w-16 flex items-end justify-center pb-1">
                        <button class="btn-remove-player text-rose-400 hover:text-rose-300 p-1 bg-slate-800 rounded border border-rose-900/50 hover:bg-rose-900/30 transition" data-index="${index}">
                            削除
                        </button>
                    </div>
                `;
                ui.playerInputsContainer.appendChild(div);
            });

            // システムキー割り当てボタン
            document.querySelectorAll('.btn-assign-syskey').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    clearFocus(); // フォーカスを確実に外す
                    const keyType = e.currentTarget.dataset.keytype;
                    waitingForSystemKey = keyType;
                    renderSettingsModal();
                });
            });
            
            // プレイヤー名変更イベント
            document.querySelectorAll('.player-name-input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.index);
                    editingPlayers[idx].name = e.target.value;
                });
            });

            // 削除ボタンのイベントリスナー
            document.querySelectorAll('.btn-remove-player').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const idx = parseInt(e.currentTarget.dataset.index);
                    if (editingPlayers.length <= 1) {
                        showMessage('プレイヤーは少なくとも1人必要です。');
                        return;
                    }
                    editingPlayers.splice(idx, 1);
                    renderSettingsModal();
                });
            });
        }

        // アプリ起動時の初期化
        async function initializeApp() {
            loadAppState();    // 設定データをロード
            if (!players.some(player => player.id === readerId)) {
                readerId = players[0]?.id || '';
            }
            applyStateToUI();  // UIに反映
            
            try {
                await initDB();       // データベース起動
                loadSoundsFromDB();   // 音声データをロード
            } catch(e) {
                console.warn('IndexedDB initialized failed:', e);
            }
            
            updateDisplay();
            updateButtonLabels();
            renderReaderPicker();
        }

        // 初期化実行
        initializeApp();
