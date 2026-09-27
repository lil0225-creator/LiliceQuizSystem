// --- 状態管理 (State) ---
        let players = [
            { id: 'p1', key: '1', name: 'プレイヤー1', correct: 0, incorrect: 0, status: 'active' }, // status: active, win, lose
            { id: 'p2', key: '2', name: 'プレイヤー2', correct: 0, incorrect: 0, status: 'active' },
            { id: 'p3', key: '3', name: 'プレイヤー3', correct: 0, incorrect: 0, status: 'active' },
            { id: 'p4', key: '4', name: 'プレイヤー4', correct: 0, incorrect: 0, status: 'active' }
        ];
        let readerId = 'p1';
        let waitingForPlayerKeyId = '';
        let matchHistory = [];

        function ensurePlayerKeys() {
            const reservedPlayerKeys = new Set(players
                .map(player => typeof player.key === 'string' ? player.key.toLowerCase() : '')
                .filter(Boolean));
            const usedKeys = new Set(Object.values(systemKeys)
                .filter(key => typeof key === 'string' && key.length > 0)
                .map(key => key.toLowerCase()));
            let fallbackKeyNumber = 1;

            players.forEach(player => {
                delete player.buttonColor;
                let key = typeof player.key === 'string' ? player.key.toLowerCase() : '';
                if (!key || usedKeys.has(key)) {
                    while (usedKeys.has(String(fallbackKeyNumber)) || reservedPlayerKeys.has(String(fallbackKeyNumber))) {
                        fallbackKeyNumber++;
                    }
                    key = String(fallbackKeyNumber++);
                }
                player.key = key;
                usedKeys.add(key);

                player.restingForQuestion = Boolean(player.restingForQuestion);
                player.restNextQuestion = Boolean(player.restNextQuestion);
                player.restQuestionsRemaining = Number.isFinite(player.restQuestionsRemaining)
                    ? Math.max(0, player.restQuestionsRemaining)
                    : (player.restingForQuestion ? 1 : 0);
                player.restQuestionsPending = Number.isFinite(player.restQuestionsPending)
                    ? Math.max(0, player.restQuestionsPending)
                    : (player.restNextQuestion ? 1 : 0);
                delete player.restingForQuestion;
                delete player.restNextQuestion;
            });
        }

        let systemKeys = {
            correct: 'o',
            incorrect: 'x',
            reset: ' ', // space
            skip: 's'
        };

        let mode = LiliceQuizRules.answerModes[0].id;
        let scoreRule = LiliceQuizRules.scoreRules[1].id;
        const missLimitRule = LiliceQuizRules.getMissLimitRule(LiliceQuizRules.defaultMissLimitRule);
        let lightweightMode = false;
        let winCondition = 3;
        let loseCondition = 2;
        let restQuestions = 1;
        let nyDisqualification = 0;

        function clampInteger(value, minimum, maximum, fallback) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.min(maximum, Math.max(minimum, parsed));
        }

        let queue = []; // 早押ししたプレイヤーのid配列
        let isAcceptingInputs = true; // 誰も押していない状態か
        let currentAnsweringIndex = -1; // queueの中で現在解答権を持っている人のインデックス

        let stateHistory = []; // Undo用履歴
        let isScoreEditMode = false; // 得点編集モード

        let soundVolumes = {
            buzzer: 0.5,
            correct: 0.5,
            incorrect: 0.5,
            win: 0.5,
            lose: 0.5,
            reach: 0.5
        };
        const SOUND_VOLUME_DEFAULTS_VERSION = 1;

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
                players, readerId, systemKeys, mode, scoreRule, lightweightMode, winCondition, loseCondition, restQuestions, nyDisqualification, soundVolumes,
                soundVolumeDefaultsVersion: SOUND_VOLUME_DEFAULTS_VERSION,
                matchHistory
            };
            localStorage.setItem('LiliceQuizState', JSON.stringify(state));
        }

        function loadAppState() {
            const saved = localStorage.getItem('LiliceQuizState');
            let soundVolumesMigrated = false;
            if (saved) {
                try {
                    const state = JSON.parse(saved);
                    if (state.players) players = state.players;
                    if (Object.prototype.hasOwnProperty.call(state, 'readerId')) readerId = state.readerId;
                    if (state.systemKeys) systemKeys = { ...systemKeys, ...state.systemKeys };
                    if (LiliceQuizRules.answerModes.some(rule => rule.id === state.mode)) mode = state.mode;
                    scoreRule = LiliceQuizRules.normalizeScoreRule(state.scoreRule);
                    if (typeof state.lightweightMode === 'boolean') lightweightMode = state.lightweightMode;
                    winCondition = clampInteger(state.winCondition, 1, 99, winCondition);
                    loseCondition = clampInteger(state.loseCondition, 0, 99, loseCondition);
                    restQuestions = clampInteger(state.restQuestions, 0, 99, restQuestions);
                    nyDisqualification = clampInteger(state.nyDisqualification, 0, 99, nyDisqualification);
                    if (state.soundVolumes) {
                        soundVolumes = { ...soundVolumes, ...state.soundVolumes };
                        if (state.soundVolumeDefaultsVersion !== SOUND_VOLUME_DEFAULTS_VERSION) {
                            Object.keys(soundVolumes).forEach(type => {
                                if (soundVolumes[type] === 1) soundVolumes[type] = 0.5;
                            });
                            soundVolumesMigrated = true;
                        }
                    }
                    if (state.matchHistory) matchHistory = state.matchHistory;
                } catch (e) {
                    console.error('Failed to load state', e);
                }
            }
            ensurePlayerKeys();
            if (soundVolumesMigrated) saveAppState();
        }

        function renderHistory() {
            const container = document.getElementById('history-list');
            container.replaceChildren();
            if (matchHistory.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'text-slate-400 text-center py-8';
                emptyMessage.textContent = 'まだ戦歴がありません。';
                container.appendChild(emptyMessage);
                return;
            }

            const totals = new Map();
            matchHistory.forEach(match => match.players.forEach(record => {
                const total = totals.get(record.id) || { name: record.name, correct: 0, incorrect: 0, wins: 0 };
                total.name = record.name;
                total.correct += record.correct;
                total.incorrect += record.incorrect;
                total.wins += Number.isFinite(record.wins) ? record.wins : 0;
                totals.set(record.id, total);
            }));

            const createSection = (title, titleClass) => {
                const section = document.createElement('section');
                const heading = document.createElement('h3');
                heading.className = `${titleClass} font-bold mb-2`;
                heading.textContent = title;
                const rows = document.createElement('div');
                rows.className = 'space-y-2';
                section.append(heading, rows);
                return { section, rows };
            };

            const appendRecord = (containerElement, record) => {
                const row = document.createElement('div');
                row.className = 'flex justify-between items-center bg-slate-700/60 rounded p-3';
                const name = document.createElement('span');
                name.className = 'font-bold text-white truncate mr-4';
                name.textContent = record.name;
                const scores = document.createElement('span');
                scores.className = 'flex flex-wrap items-center justify-end gap-x-3 font-Lilice text-lg whitespace-nowrap';
                const correct = document.createElement('span');
                correct.className = 'text-emerald-400';
                correct.textContent = `〇${record.correct}`;
                const incorrect = document.createElement('span');
                incorrect.className = 'text-rose-400 ml-4';
                incorrect.textContent = `✖${record.incorrect}`;
                const wins = document.createElement('span');
                wins.className = 'font-sans text-xs text-amber-300';
                wins.textContent = Number.isFinite(record.wins) ? `WIN ${record.wins}` : 'WIN —';
                scores.append(correct, incorrect, wins);
                row.append(name, scores);
                containerElement.appendChild(row);
            };

            const totalsSection = createSection('累計（WIN数は今回以降）', 'text-amber-300');
            totals.forEach(record => appendRecord(totalsSection.rows, record));
            container.appendChild(totalsSection.section);

            const detailsSection = createSection('セット別戦歴', 'text-cyan-300');
            detailsSection.rows.className = 'space-y-4';
            [...matchHistory].reverse().forEach((match, index) => {
                const matchSection = document.createElement('section');
                const heading = document.createElement('h4');
                heading.className = 'text-cyan-300 font-bold mb-2';
                heading.textContent = `セット ${matchHistory.length - index} / ${match.date}`;
                const rows = document.createElement('div');
                rows.className = 'space-y-2';
                match.players.forEach(record => appendRecord(rows, record));
                matchSection.append(heading, rows);
                detailsSection.rows.appendChild(matchSection);
            });
            container.appendChild(detailsSection.section);
        }

        function applyStateToUI() {
            ui.winScoreInput.value = winCondition;
            ui.loseScoreInput.value = loseCondition;
            ui.restQuestionsInput.value = restQuestions;
            ui.nyDisqualificationInput.value = nyDisqualification;
            document.getElementById('rule-summary-mode').textContent = LiliceQuizRules.getAnswerMode(mode).label;
            document.getElementById('rule-summary-win').textContent = winCondition;
            const isNYRule = scoreRule === 'ny';
            const isRestRule = scoreRule === 'marks-rest';
            const scoreRuleLabel = LiliceQuizRules.scoreRules.find(rule => rule.id === scoreRule)?.label || 'N〇N✕';
            document.getElementById('rule-summary-scoring-rule').textContent = scoreRuleLabel;
            document.getElementById('win-condition-unit').textContent = isNYRule ? '点' : 'マル';
            document.getElementById('rule-summary-win-unit').textContent = isNYRule ? '点' : 'マル';
            document.getElementById('rule-summary-lose-label').textContent = isNYRule ? '失格' : (isRestRule ? '休み' : '失格');
            document.getElementById('rule-summary-lose').textContent = isNYRule
                ? (nyDisqualification > 0 ? `-${nyDisqualification}` : 'なし')
                : (isRestRule ? (restQuestions > 0 ? restQuestions : 'なし') : (loseCondition > 0 ? loseCondition : 'なし'));
            document.getElementById('rule-summary-lose-unit').textContent = isNYRule
                ? (nyDisqualification > 0 ? '点' : '')
                : (isRestRule ? (restQuestions > 0 ? '休' : '') : (loseCondition > 0 ? 'バツ' : ''));
            document.getElementById('lose-condition-field').classList.toggle('hidden', isNYRule || isRestRule);
            document.getElementById('rest-questions-field').classList.toggle('hidden', !isRestRule);
            document.getElementById('ny-disqualification-field').classList.toggle('hidden', !isNYRule);
            document.getElementById('lose-condition-title').textContent = '失格（誤答数）';
            document.getElementById('lose-condition-unit').textContent = 'バツ（0で無効）';
            ui.lightweightModeInput.checked = lightweightMode;
            document.body.classList.toggle('lightweight-mode', lightweightMode);
            const modeActiveClass = 'flex-1 py-2.5 text-sm font-bold rounded-md bg-cyan-600 text-white border border-cyan-300/60 shadow-[0_0_12px_rgba(6,182,212,0.18)]';
            const modeInactiveClass = 'flex-1 py-2.5 text-sm font-bold rounded-md bg-slate-800 text-slate-400 border border-slate-600 hover:text-white';
            ui.answerModeOptions.querySelectorAll('[data-answer-mode]').forEach(button => {
                button.className = button.dataset.answerMode === mode ? modeActiveClass : modeInactiveClass;
            });
            ui.scoreRuleOptions.querySelectorAll('[data-score-rule]').forEach(button => {
                button.className = button.dataset.scoreRule === scoreRule ? modeActiveClass : modeInactiveClass;
            });
            soundTypes.forEach(type => {
                const volSlider = document.getElementById(`vol-${type}`);
                if (volSlider && soundVolumes[type] !== undefined) {
                    volSlider.value = soundVolumes[type];
                }
            });
        }

        function renderAnswerModeOptions() {
            const inactiveClass = 'flex-1 py-2.5 text-sm font-bold rounded-md bg-slate-800 text-slate-400 border border-slate-600 hover:text-white';
            const buttons = LiliceQuizRules.answerModes.map(rule => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.answerMode = rule.id;
                button.className = inactiveClass;
                button.textContent = rule.label;
                return button;
            });
            ui.answerModeOptions.replaceChildren(...buttons);
        }

        function renderScoreRuleOptions() {
            const buttons = LiliceQuizRules.scoreRules.map(rule => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.scoreRule = rule.id;
                button.className = 'flex-1 py-2.5 text-sm font-bold rounded-md bg-slate-800 text-slate-400 border border-slate-600 hover:text-white';
                button.textContent = rule.label;
                return button;
            });
            ui.scoreRuleOptions.replaceChildren(...buttons);
        }

        // --- Web Audio API (フォールバック・デフォルト音用) ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function playDefaultSound(type) {
            const vol = soundVolumes[type] ?? 0;
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
                scoreRule: scoreRule,
                winCondition: winCondition,
                loseCondition: loseCondition,
                restQuestions: restQuestions,
                nyDisqualification: nyDisqualification
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
            scoreRule = prevState.scoreRule || LiliceQuizRules.scoreRules[0].id;
            winCondition = prevState.winCondition;
            loseCondition = prevState.loseCondition;
            restQuestions = prevState.restQuestions ?? 1;
            nyDisqualification = prevState.nyDisqualification ?? 0;
            
            updateDisplay();
            updateUndoButton();
            applyStateToUI();
            saveAppState();
            renderReaderPicker();
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

        function getPlayerScore(player) {
            return LiliceQuizRules.getPlayerScore(player, scoreRule);
        }

        function updatePlayerStatus(player) {
            if (getPlayerScore(player) >= winCondition) {
                player.status = 'win';
            } else if (scoreRule === 'ny' && nyDisqualification > 0 && getPlayerScore(player) <= -nyDisqualification) {
                player.status = 'lose';
            } else if (scoreRule === 'marks-eliminate' && loseCondition > 0 && missLimitRule === LiliceQuizRules.missLimitRules.eliminate && player.incorrect >= loseCondition) {
                player.status = 'lose';
            } else {
                player.status = 'active';
            }
        }

        function findEligiblePlayerByKey(key) {
            return players.find(player => player.key === key && player.id !== readerId && player.status === 'active' && player.restQuestionsRemaining === 0);
        }

        const playerNameSegmenter = typeof Intl.Segmenter === 'function'
            ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
            : null;
        const emojiSegmentPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;

        function renderPlayerName(container, name) {
            container.replaceChildren();
            container.classList.add('player-name-content');

            const appendPlainText = text => {
                if (!text) return;
                const plain = document.createElement('span');
                plain.className = 'player-name-plain';
                plain.textContent = text;
                container.appendChild(plain);
            };

            if (!playerNameSegmenter) {
                appendPlainText(name);
                return;
            }

            let plainText = '';
            for (const { segment } of playerNameSegmenter.segment(name)) {
                if (emojiSegmentPattern.test(segment)) {
                    appendPlainText(plainText);
                    plainText = '';
                    const emoji = document.createElement('span');
                    emoji.className = 'player-emoji';
                    emoji.textContent = segment;
                    container.appendChild(emoji);
                } else {
                    plainText += segment;
                }
            }
            appendPlainText(plainText);
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
            btnSkip: document.getElementById('btn-skip'),
            btnReset: document.getElementById('btn-reset'),
            playerList: document.getElementById('player-list'),
            answerModeOptions: document.getElementById('answer-mode-options'),
            scoreRuleOptions: document.getElementById('score-rule-options'),
            winScoreInput: document.getElementById('win-condition'),
            loseScoreInput: document.getElementById('lose-condition'),
            restQuestionsInput: document.getElementById('rest-questions'),
            nyDisqualificationInput: document.getElementById('ny-disqualification'),
            settingsModal: document.getElementById('settings-modal'),
            playerInputsContainer: document.getElementById('player-inputs-container'),
            resultOverlay: document.getElementById('result-overlay'),
            resultTitle: document.getElementById('result-title'),
            resultName: document.getElementById('result-name'),
            btnCloseResult: document.getElementById('btn-close-result'),
            btnUndo: document.getElementById('btn-undo'),
            btnToggleEditScore: document.getElementById('btn-toggle-edit-score'),
            btnResetScore: document.getElementById('btn-reset-score'),
            ruleSummary: document.getElementById('rule-summary'),
            ruleSettingsModal: document.getElementById('rule-settings-modal'),
            manualModal: document.getElementById('manual-modal'),
            btnCloseManual: document.getElementById('btn-close-manual'),
            lightweightModeInput: document.getElementById('lightweight-mode')
        };

        ui.playerList.addEventListener('click', event => {
            const playerNameButton = event.target.closest('.player-name-key-target');
            if (playerNameButton) {
                event.stopPropagation();
                waitingForPlayerKeyId = playerNameButton.dataset.id;
                updateDisplay();
                return;
            }

            const scoreButton = event.target.closest('.btn-score-edit');
            if (!scoreButton || !isScoreEditMode) return;

            saveState();
            const player = players.find(item => item.id === scoreButton.dataset.id);
            if (!player) return;

            const value = parseInt(scoreButton.dataset.val);
            if (scoreButton.dataset.type === 'points') {
                const currentScore = getPlayerScore(player);
                if (value > 0) {
                    if (currentScore < 0) player.incorrect--;
                    else player.correct++;
                } else if (currentScore > 0) {
                    player.correct--;
                } else {
                    player.incorrect++;
                }
            } else if (scoreButton.dataset.type === 'correct') {
                player.correct = Math.max(0, player.correct + value);
            } else if (scoreButton.dataset.type === 'incorrect') {
                player.incorrect = Math.max(0, player.incorrect + value);
            }
            updatePlayerStatus(player);

            updateDisplay();
            saveAppState();
        });

        // --- コアロジック ---

        // キーボード入力監視
        window.addEventListener('keydown', (e) => {
            // 長押し(キーリピート)による連打反応を防止
            if (e.repeat) return;

            if (!ui.manualModal.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    ui.manualModal.classList.add('hidden');
                    e.preventDefault();
                }
                return;
            }
            
            // --- 設定モーダルが開いていて、キー入力待ちの時 ---
            if (!ui.settingsModal.classList.contains('hidden')) {
                // システムキーの設定
                if (waitingForSystemKey) {
                    e.preventDefault(); e.stopPropagation();
                    const key = e.key.toLowerCase();
                    if (key === 'escape') {
                        waitingForSystemKey = null;
                        renderSettingsModal();
                        showMessage('Escキーは使用できません。');
                        return;
                    }
                    const conflictsWithPlayer = players.some(player => player.key === key);
                    const conflictsWithSystemKey = Object.entries(editingSystemKeys).some(([type, assignedKey]) => type !== waitingForSystemKey && assignedKey === key);
                    if (conflictsWithPlayer || conflictsWithSystemKey) {
                        waitingForSystemKey = null;
                        renderSettingsModal();
                        showMessage('このキーはすでに別の操作に割り当てられています。');
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
                if (Object.values(systemKeys).includes(key)) {
                    waitingForPlayerKeyId = '';
                    updateDisplay();
                    showMessage('このキーはシステム操作に割り当てられています。');
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

            if (e.key.toLowerCase() === systemKeys.skip) {
                e.preventDefault();
                ui.btnSkip.click();
                return;
            }
            
            // リセットショートカット
            if (e.key.toLowerCase() === systemKeys.reset) { 
                e.preventDefault();
                ui.btnReset.click(); 
                return; 
            }
            
            // --- 早押し処理 ---
            if (isAcceptingInputs) {
                const player = findEligiblePlayerByKey(e.key.toLowerCase());

                if (player && !queue.includes(player.id)) {
                    e.preventDefault();
                    pushBuzzer(player.id);
                }
            } else if (currentAnsweringIndex >= 0) {
                // 解答中も押せばキューに入る (2着以降)
                const player = findEligiblePlayerByKey(e.key.toLowerCase());
                const modeRule = LiliceQuizRules.getAnswerMode(mode);
                const queueHasRoom = modeRule.queueLimit === null || queue.length < modeRule.queueLimit;
                if (player && !queue.includes(player.id) && queueHasRoom) {
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
            updatePlayerStatus(p);
            
            if (p.status === 'win') {
                setTimeout(() => {
                    const currentPlayer = players.find(player => player.id === pid);
                    if (currentPlayer?.status !== 'win') return;
                    playSound('win');
                    showResultOverlay(currentPlayer.name, 'WINNER!', 'text-amber-400');
                }, 500);
            } else if (getPlayerScore(p) === winCondition - 1 && winCondition > 1) {
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

            updatePlayerStatus(p);
            if (p.status === 'lose') {
                setTimeout(() => {
                    const currentPlayer = players.find(player => player.id === pid);
                    if (currentPlayer?.status !== 'lose') return;
                    playSound('lose');
                    showResultOverlay(currentPlayer.name, 'DISQUALIFIED', 'text-rose-500');
                }, 500);
            } else if (scoreRule === 'marks-rest' && restQuestions > 0) {
                p.restQuestionsPending = restQuestions;
            } else if (scoreRule === 'marks-eliminate' && loseCondition > 0 && p.incorrect === loseCondition - 1 && loseCondition > 1) {
                showCutin('DANGER!', 'danger');
            }

            const hasNextAnswerer = currentAnsweringIndex + 1 < queue.length;
            const transition = LiliceQuizRules.getIncorrectTransition(mode, hasNextAnswerer);
            if (transition === 'end') {
                resetBuzzer(false);
            } else {
                currentAnsweringIndex++;
                if (currentAnsweringIndex < queue.length) {
                    setTimeout(() => playSound('buzzer'), 300); // 次の人が鳴る
                } else if (transition === 'advance-or-wait') {
                    isAcceptingInputs = false;
                    currentAnsweringIndex = -1;
                } else {
                    resetBuzzer(false);
                }
            }
            
            updateDisplay();
            saveAppState();
        });

        ui.btnReset.addEventListener('click', () => {
            // 早押しがされていた場合のみ履歴に残す
            const hasQuestionInProgress = queue.length > 0;
            if (hasQuestionInProgress) saveState();
            resetBuzzer(false, hasQuestionInProgress);
        });

        ui.btnSkip.addEventListener('click', () => {
            saveState();
            resetBuzzer(false);
            saveAppState();
        });

        ui.btnCloseResult.addEventListener('click', () => {
            ui.resultOverlay.classList.add('hidden');
        });

        document.getElementById('btn-manual').addEventListener('click', () => {
            ui.manualModal.classList.remove('hidden');
        });

        ui.btnCloseManual.addEventListener('click', () => {
            ui.manualModal.classList.add('hidden');
        });

        ui.manualModal.addEventListener('click', event => {
            if (event.target === ui.manualModal) ui.manualModal.classList.add('hidden');
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
                            incorrect: player.incorrect,
                            wins: player.status === 'win' ? 1 : 0
                        }))
                    });
                }
                players.forEach(p => {
                    p.correct = 0;
                    p.incorrect = 0;
                    p.status = 'active';
                    p.restQuestionsRemaining = 0;
                    p.restQuestionsPending = 0;
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

        function resetBuzzer(shouldSaveState = true, completesQuestion = true) {
            if (shouldSaveState && queue.length > 0) saveState();
            if (completesQuestion) completeQuestion();
            queue = [];
            currentAnsweringIndex = -1;
            isAcceptingInputs = true;
            updateDisplay();
        }

        function completeQuestion() {
            players.forEach(player => {
                if (player.restQuestionsRemaining > 0) player.restQuestionsRemaining--;
                if (player.restQuestionsPending > 0) {
                    player.restQuestionsRemaining = Math.max(player.restQuestionsRemaining, player.restQuestionsPending);
                    player.restQuestionsPending = 0;
                }
            });
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
            if ((nextReaderId && !players.some(player => player.id === nextReaderId)) || nextReaderId === readerId) return;

            saveState();
            readerId = nextReaderId;
            resetBuzzer(false, false);
            saveAppState();
            renderReaderPicker();
        }

        function renderReaderPicker() {
            const container = document.getElementById('reader-picker');
            if (!container) return;

            container.innerHTML = '';
            const noReaderButton = document.createElement('button');
            const hasNoReader = readerId === '';
            noReaderButton.className = `px-3 py-2 rounded border border-dashed text-sm font-bold transition ${hasNoReader ? 'border-amber-300 bg-amber-950/50 text-amber-200' : 'border-slate-600 bg-slate-900/60 text-slate-400 hover:border-slate-400 hover:text-slate-200'}`;
            noReaderButton.textContent = 'なし';
            noReaderButton.title = '問読みなしに設定';
            noReaderButton.setAttribute('aria-pressed', String(hasNoReader));
            noReaderButton.addEventListener('click', () => selectReader(''));
            container.appendChild(noReaderButton);

            const divider = document.createElement('span');
            divider.className = 'mx-1 self-stretch border-l border-slate-700';
            divider.setAttribute('aria-hidden', 'true');
            container.appendChild(divider);

            players.forEach(player => {
                const button = document.createElement('button');
                button.className = 'player-name-content reader-name-button inline-flex items-center justify-center px-4 py-2 rounded border-2 text-sm font-bold transition';
                const isReader = player.id === readerId;
                button.classList.add(isReader ? 'border-amber-300' : 'border-transparent');
                button.classList.add('bg-slate-800');
                renderPlayerName(button, player.name);
                button.title = '問読み担当に設定';
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
                    renderPlayerName(ui.currentAnswerer, p.name);
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
            const compactPlayerList = scoringPlayers.length >= 5;
            const compactEditList = compactPlayerList && isScoreEditMode;
            const densePlayerList = scoringPlayers.length >= 11;
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
            if (compactEditList) {
                ui.playerList.className = 'flex-1 flex flex-col gap-2 overflow-y-auto pr-1';
            } else if (compactPlayerList) {
                nameSize = densePlayerList ? 'text-base' : 'text-sm';
                scoreSize = densePlayerList ? 'text-2xl' : 'text-3xl';
                ui.playerList.className = 'flex-1 grid grid-cols-2 gap-2 overflow-y-auto pr-1';
            } else {
                ui.playerList.className = 'flex-1 flex flex-col gap-3 overflow-y-auto pr-1';
            }
            // ▲▲ここまで▲▲

            // プレイヤーリスト
            ui.playerList.innerHTML = '';
            scoringPlayers.forEach(p => {
                const div = document.createElement('div');
                let statusClass = 'bg-slate-800 text-slate-300 border-2 border-transparent';
                let statusIcon = '';
                
                // リーチ状態判定
                const isReach = (getPlayerScore(p) === winCondition - 1) && (winCondition > 1) && (p.status === 'active');
                const isDanger = scoreRule === 'marks-eliminate' && loseCondition > 1 && p.incorrect === loseCondition - 1 && p.status === 'active';

                if (p.status === 'win') {
                    statusClass = 'bg-amber-900/50 border-2 border-amber-500 text-amber-200';
                    statusIcon = '🏆 ';
                } else if (p.status === 'lose') {
                    statusClass = 'bg-rose-900/50 border-2 border-rose-500 text-rose-200 opacity-50';
                    statusIcon = '💀 ';
                } else if (p.restQuestionsRemaining > 0) {
                    statusClass = 'bg-slate-700/80 text-slate-400';
                    statusIcon = '休 ';
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
                    const badgeSize = compactPlayerList ? 'ml-1 px-1.5 py-0.5 text-xs' : 'ml-3 px-3 py-1 text-lg';
                    orderBadge = `<span class="${badgeSize} rounded-full font-Lilice font-bold align-middle ${badgeClass}">${orderStr}</span>`;
                }

                const playerRowSize = compactEditList
                    ? 'p-1.5 rounded-md min-h-[54px]'
                    : (compactPlayerList
                        ? (densePlayerList ? 'p-1.5 rounded-md min-h-[60px]' : 'p-2 rounded-md min-h-[80px]')
                        : 'p-2 rounded-lg min-h-[60px]');
                div.className = `relative ${playerRowSize} flex justify-between items-center shadow-lg transition-all flex-1 ${statusClass}`;
                const isWaitingForPlayerKey = waitingForPlayerKeyId === p.id;
                const assignedKeyLabel = getDisplayKey(p.key).toUpperCase();
                const playerNameButton = (fontSize) => `
                    <button type="button" class="player-name-key-target h-full w-full min-w-0 flex flex-col items-center justify-center rounded-md px-2 py-1 text-center transition-colors ${isWaitingForPlayerKey ? 'bg-cyan-950/40 ring-2 ring-cyan-300' : 'hover:bg-cyan-900/20'}" data-id="${p.id}" title="名前をクリックしてキーを割り当て">
                        <span class="${fontSize} font-bold flex min-w-0 w-full items-center justify-start gap-1.5 text-left leading-tight">
                            <span class="player-status-icon">${statusIcon.trim()}</span>
                            <span class="player-name-text player-name-left min-w-0"></span>
                            <span class="player-assigned-key" data-assigned-key></span>
                            ${orderBadge}
                        </span>
                        ${isWaitingForPlayerKey ? '<span class="mt-1 text-[10px] font-bold text-cyan-200">キー入力中</span>' : ''}
                    </button>
                `;
                
                if (isScoreEditMode) {
                    // 編集モードUI
                    const editNameSize = compactPlayerList ? 'text-base' : 'text-xl';
                    const editControlSize = compactPlayerList ? 'px-1' : 'px-2';
                    const scoreEditControls = scoreRule === 'ny'
                        ? `<div class="flex gap-1 font-Lilice text-lg shrink-0 items-center">
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" data-id="${p.id}" data-type="points" data-val="-1">-</button>
                            <span class="text-cyan-200 min-w-12 text-center font-bold">${getPlayerScore(p)}点</span>
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" data-id="${p.id}" data-type="points" data-val="1">+</button>
                        </div>`
                        : `<div class="flex gap-1 font-Lilice text-lg shrink-0 items-center">
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white active:scale-90 transition" data-id="${p.id}" data-type="correct" data-val="-1">-</button>
                            <span class="text-emerald-400 w-10 text-center font-bold">〇${p.correct}</span>
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white mr-1 active:scale-90 transition" data-id="${p.id}" data-type="correct" data-val="1">+</button>
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white active:scale-90 transition" data-id="${p.id}" data-type="incorrect" data-val="-1">-</button>
                            <span class="text-rose-400 w-10 text-center font-bold">✖${p.incorrect}</span>
                            <button class="btn-score-edit ${editControlSize} py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" data-id="${p.id}" data-type="incorrect" data-val="1">+</button>
                        </div>`;
                    div.innerHTML = `
                        <div class="self-stretch flex min-w-0 flex-1 mr-2">
                            ${playerNameButton(editNameSize)}
                        </div>
                        ${scoreEditControls}
                    `;
                } else {
                    // 通常表示UI (可変サイズ適用)
                    const scoreGap = compactPlayerList ? (densePlayerList ? 'gap-1' : 'gap-1.5') : 'gap-6';
                    const scoreDisplay = scoreRule === 'ny'
                        ? `<div class="flex font-Lilice ${scoreSize} font-bold tracking-wider shrink-0 text-cyan-200"><span>${getPlayerScore(p)}点</span></div>`
                        : `<div class="flex ${scoreGap} font-Lilice ${scoreSize} font-bold tracking-wider shrink-0">
                            <span class="text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">〇${p.correct}</span>
                            <span class="text-rose-400 drop-shadow-[0_0_12px_rgba(251,113,133,0.8)]">✖${p.incorrect}</span>
                        </div>`;
                    div.innerHTML = `
                        <div class="self-stretch flex min-w-0 flex-1 mr-2">
                            ${playerNameButton(nameSize)}
                        </div>
                        ${scoreDisplay}
                    `;
                }
                const playerNameElement = div.querySelector('.player-name-text');
                if (playerNameElement) renderPlayerName(playerNameElement, p.name);
                const assignedKeyElement = div.querySelector('[data-assigned-key]');
                if (assignedKeyElement) {
                    assignedKeyElement.textContent = assignedKeyLabel;
                    assignedKeyElement.title = `割り当てキー: ${assignedKeyLabel}`;
                }
                ui.playerList.appendChild(div);
            });

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
            if (!LiliceQuizRules.answerModes.some(rule => rule.id === m) || mode === m) return;
            saveState();
            mode = m;
            applyStateToUI();
            resetBuzzer(false, false);
            saveAppState(); // 変更を保存
        }

        function setScoreRule(ruleId) {
            if (!LiliceQuizRules.scoreRules.some(rule => rule.id === ruleId) || scoreRule === ruleId) return;
            saveState();
            scoreRule = ruleId;
            players.forEach(player => {
                player.restQuestionsRemaining = 0;
                player.restQuestionsPending = 0;
                updatePlayerStatus(player);
            });
            applyStateToUI();
            updateDisplay();
            saveAppState();
        }

        ui.answerModeOptions.addEventListener('click', event => {
            const button = event.target.closest('[data-answer-mode]');
            if (button) setMode(button.dataset.answerMode);
        });

        ui.scoreRuleOptions.addEventListener('click', event => {
            const button = event.target.closest('[data-score-rule]');
            if (button) setScoreRule(button.dataset.scoreRule);
        });

        ui.lightweightModeInput.addEventListener('change', event => {
            lightweightMode = event.currentTarget.checked;
            applyStateToUI();
            saveAppState();
        });

        ui.winScoreInput.addEventListener('change', (e) => {
            const nextWinCondition = clampInteger(e.target.value, 1, 99, 3);
            if (nextWinCondition === winCondition) {
                e.target.value = winCondition;
                return;
            }
            saveState();
            winCondition = nextWinCondition;
            e.target.value = winCondition;
            players.forEach(updatePlayerStatus);
            applyStateToUI();
            updateDisplay();
            saveAppState();
        });
        ui.loseScoreInput.addEventListener('change', (e) => {
            const nextLoseCondition = clampInteger(e.target.value, 0, 99, 2);
            if (nextLoseCondition === loseCondition) {
                e.target.value = loseCondition;
                return;
            }
            saveState();
            loseCondition = nextLoseCondition;
            e.target.value = loseCondition;
            players.forEach(updatePlayerStatus);
            applyStateToUI();
            updateDisplay();
            saveAppState();
        });
        ui.restQuestionsInput.addEventListener('change', event => {
            const nextRestQuestions = clampInteger(event.currentTarget.value, 0, 99, 1);
            if (nextRestQuestions === restQuestions) {
                event.currentTarget.value = restQuestions;
                return;
            }
            saveState();
            restQuestions = nextRestQuestions;
            event.currentTarget.value = restQuestions;
            applyStateToUI();
            updateDisplay();
            saveAppState();
        });
        ui.nyDisqualificationInput.addEventListener('change', event => {
            const nextNyDisqualification = clampInteger(event.currentTarget.value, 0, 99, 0);
            if (nextNyDisqualification === nyDisqualification) {
                event.currentTarget.value = nyDisqualification;
                return;
            }
            saveState();
            nyDisqualification = nextNyDisqualification;
            event.currentTarget.value = nyDisqualification;
            players.forEach(updatePlayerStatus);
            applyStateToUI();
            updateDisplay();
            saveAppState();
        });

        function openRuleSettings() {
            applyStateToUI();
            ui.ruleSettingsModal.classList.remove('hidden');
        }

        ui.ruleSummary.addEventListener('click', openRuleSettings);
        ui.ruleSummary.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openRuleSettings();
            }
        });

        document.getElementById('btn-close-rule-settings').addEventListener('click', () => {
            ui.ruleSettingsModal.classList.add('hidden');
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
                if (!p.key) p.key = String(idx % 4 + 1);
                
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
            if (readerId && !newPlayers.some(player => player.id === readerId)) {
                readerId = newPlayers[0]?.id || '';
            }
            ui.settingsModal.classList.add('hidden');
            updateDisplay();
            updateButtonLabels();
            renderReaderPicker();
            saveAppState(); // 保存して閉じたときに状態を記録
        });

        document.getElementById('btn-add-player').addEventListener('click', () => {
            const newId = `new_${Date.now()}`;
            editingPlayers.push({ id: newId, name: `プレイヤー${editingPlayers.length + 1}`, key: '', correct:0, incorrect:0, status:'active' });
            renderSettingsModal();
        });

        const systemKeyLabels = {
            correct: '正解 (〇)',
            incorrect: '不正解 (✖)',
            reset: 'リセット',
            skip: 'スルー'
        };

        function updateButtonLabels() {
            document.getElementById('label-correct-key').textContent = `正解 (${getDisplayKey(systemKeys.correct).toUpperCase()})`;
            document.getElementById('label-incorrect-key').textContent = `不正解 (${getDisplayKey(systemKeys.incorrect).toUpperCase()})`;
            document.getElementById('label-reset-key').textContent = `リセット (${getDisplayKey(systemKeys.reset).toUpperCase()})`;
            document.getElementById('label-skip-key').textContent = `スルー (${getDisplayKey(systemKeys.skip).toUpperCase()})`;
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
                        <input type="text" class="player-name-input w-full bg-slate-800 border border-slate-500 rounded px-2 py-1 text-white outline-none focus:border-cyan-400" data-index="${index}">
                    </div>
                    <div class="w-16 flex items-end justify-center pb-1">
                        <button class="btn-remove-player text-rose-400 hover:text-rose-300 p-1 bg-slate-800 rounded border border-rose-900/50 hover:bg-rose-900/30 transition" data-index="${index}">
                            削除
                        </button>
                    </div>
                `;
                div.querySelector('.player-name-input').value = player.name;
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
            if (readerId && !players.some(player => player.id === readerId)) {
                readerId = players[0]?.id || '';
            }
            renderAnswerModeOptions();
            renderScoreRuleOptions();
            applyStateToUI();  // UIに反映
            updateDisplay();
            updateButtonLabels();
            renderReaderPicker();
            
            try {
                await initDB();       // データベース起動
                loadSoundsFromDB();   // 音声データをロード
            } catch(e) {
                console.warn('IndexedDB initialized failed:', e);
            }
            
        }

        // 初期化実行
        initializeApp();
