const STORAGE_KEY = 'LiliceQuizBetaNameSpeech';

export const buzzerNameSpeech = {
    mount({ root, host, storage }) {
        const doc = root.ownerDocument;
        const view = doc.defaultView;
        const synth = view.speechSynthesis;
        const supported = Boolean(synth && view.SpeechSynthesisUtterance);
        let enabled = true;
        let volume = 0.5;
        let active = true;
        const pending = new Set();
        try {
            const saved = JSON.parse(storage.getItem(STORAGE_KEY));
            if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
            if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) {
                volume = Math.min(1, Math.max(0, saved.volume));
            }
        } catch {
            /* 保存データがない場合は既定値。 */
        }

        const section = doc.createElement('section');
        section.id = 'beta-name-speech-settings';
        section.className = 'beta-settings-surface rounded-lg border border-slate-600 p-3';
        section.innerHTML = `
            <label for="beta-name-speech" class="flex items-center justify-between gap-4">
                <span class="text-sm font-bold text-white">早押しした人の名前を読み上げる</span>
                <input id="beta-name-speech" type="checkbox" role="switch" class="beta-switch" aria-describedby="beta-name-speech-message">
            </label>
            <div class="mt-3 flex items-center gap-3">
                <label for="beta-name-speech-volume" class="text-sm text-slate-300">音量</label>
                <input id="beta-name-speech-volume" type="range" min="0" max="1" step="0.05" class="flex-1 min-w-0">
                <output id="beta-name-speech-volume-value" for="beta-name-speech-volume" class="text-sm text-white w-12 text-right"></output>
                <button id="btn-test-name-speech" type="button" class="Lilice-btn rounded px-3 py-1.5 text-sm text-white">テスト</button>
            </div>
            <p id="beta-name-speech-message" class="mt-2 text-xs text-slate-400" role="status" aria-live="polite"></p>
        `;
        host.append(section);
        const toggle = section.querySelector('#beta-name-speech');
        const volumeInput = section.querySelector('#beta-name-speech-volume');
        const output = section.querySelector('#beta-name-speech-volume-value');
        const testButton = section.querySelector('#btn-test-name-speech');
        const message = section.querySelector('#beta-name-speech-message');
        toggle.checked = enabled;
        toggle.setAttribute('aria-checked', String(enabled));
        volumeInput.value = volume;
        output.textContent = `${Math.round(volume * 100)}%`;
        toggle.disabled = volumeInput.disabled = testButton.disabled = !supported;
        const hint = '受け付けた早押しの順に読み上げます。読み方や声は端末によって変わります。';
        message.textContent = supported ? hint : 'このブラウザは名前の読み上げに対応していません。';

        function save() {
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify({ enabled, volume }));
            } catch {
                message.textContent = '設定を保存できませんでした。再読み込みすると元に戻ります。';
            }
        }

        function stop() {
            const hasSpeech = pending.size > 0;
            pending.clear();
            if (hasSpeech && supported) synth.cancel();
        }

        function speak(name, test = false) {
            if (!active || !supported || (!enabled && !test) || volume === 0) return;
            const text = typeof name === 'string' ? name.trim() : '';
            if (!text) return;
            const utterance = new view.SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            utterance.volume = volume;
            const japaneseVoices = synth
                .getVoices()
                .filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang));
            const voice = japaneseVoices.find((voice) => voice.localService) || japaneseVoices[0];
            if (voice) utterance.voice = voice;
            utterance.onend = () => pending.delete(utterance);
            utterance.onerror = (event) => {
                if (!pending.delete(utterance) || !active) return;
                if (!['canceled', 'interrupted'].includes(event.error)) {
                    message.textContent =
                        '読み上げできませんでした。「テスト」で音声を確認してください。';
                }
            };
            pending.add(utterance);
            try {
                synth.speak(utterance);
            } catch {
                pending.delete(utterance);
                message.textContent =
                    '読み上げできませんでした。「テスト」で音声を確認してください。';
            }
        }

        const onBuzz = (event) => speak(event.detail?.name);
        root.addEventListener('lilice:buzz', onBuzz);
        root.addEventListener('lilice:buzzer-reset', stop);
        view.addEventListener('pagehide', stop);
        toggle.addEventListener('change', () => {
            enabled = toggle.checked;
            toggle.setAttribute('aria-checked', String(enabled));
            if (!enabled) stop();
            message.textContent = hint;
            save();
        });
        volumeInput.addEventListener('input', () => {
            volume = Number(volumeInput.value);
            output.textContent = `${Math.round(volume * 100)}%`;
            if (volume === 0) stop();
            save();
        });
        testButton.addEventListener('click', () => {
            stop();
            speak('読み上げのテストです', true);
        });

        return () => {
            active = false;
            stop();
            root.removeEventListener('lilice:buzz', onBuzz);
            root.removeEventListener('lilice:buzzer-reset', stop);
            view.removeEventListener('pagehide', stop);
            section.remove();
        };
    },
};
