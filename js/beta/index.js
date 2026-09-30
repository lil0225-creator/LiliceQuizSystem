import { betaFeatures } from './features/index.js';

const STORAGE_KEY = 'LiliceQuizBeta';
const PASSWORD_HASH = 'f8db290fb696545069d127d9c97fff38e7266eb28d5769e888a6fef74d3e929b';

export function createBetaMode({ root, storage = localStorage, features = betaFeatures }) {
    const find = id => root.querySelector(`#${id}`);
    const input = find('beta-password');
    const unlockButton = find('btn-unlock-beta');
    const toggle = find('beta-mode');
    const message = find('beta-message');
    const host = find('beta-features');
    let unlocked = false;
    let enabled = false;
    let busy = false;
    let cleanups = [];

    try {
        const saved = JSON.parse(storage.getItem(STORAGE_KEY));
        unlocked = saved?.unlocked === true;
        enabled = unlocked && saved?.enabled === true;
    } catch { /* 壊れた保存データは未解放として扱う。 */ }

    function save() {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify({ unlocked, enabled }));
            return true;
        } catch {
            message.textContent = '切り替えましたが、保存できませんでした。再読み込みすると元に戻ります。';
            return false;
        }
    }

    function stopFeatures() {
        for (const cleanup of cleanups.reverse()) {
            try { cleanup(); } catch (error) { console.error('Beta cleanup failed:', error); }
        }
        cleanups = [];
        host.replaceChildren();
    }

    function apply() {
        stopFeatures();
        if (enabled) {
            try {
                for (const feature of features) {
                    const cleanup = feature.mount({ root, host });
                    if (typeof cleanup !== 'function') throw new Error('Beta feature must return a cleanup function');
                    cleanups.push(cleanup);
                }
            } catch (error) {
                console.error('Beta feature failed:', error);
                stopFeatures();
                enabled = false;
                message.textContent = 'ベータ機能を起動できなかったため、OFFに戻しました。';
                save();
            }
        }
        root.dataset.betaMode = enabled ? 'on' : 'off';
        host.classList.toggle('hidden', !enabled);
        toggle.checked = enabled;
        toggle.disabled = !unlocked;
        toggle.setAttribute('aria-checked', String(enabled));
        find('beta-mode-state').textContent = enabled ? 'ON' : 'OFF';
        find('beta-unlock-controls').classList.toggle('hidden', unlocked);
        find('beta-toggle-controls').classList.toggle('hidden', !unlocked);
    }

    function refresh() {
        input.value = '';
        input.removeAttribute('aria-invalid');
        message.textContent = unlocked ? '解放済み。スイッチでON・OFFを切り替えられます。' : 'パスワードを入力するとベータモードを解放できます。';
    }

    async function unlock() {
        if (busy || unlocked) return;
        busy = true;
        unlockButton.disabled = true;
        try {
            const bytes = new TextEncoder().encode(input.value);
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            if (hash !== PASSWORD_HASH) {
                input.setAttribute('aria-invalid', 'true');
                message.textContent = 'パスワードが違います。';
                input.focus();
                return;
            }
            unlocked = true;
            enabled = true;
            refresh();
            apply();
            save();
            toggle.focus();
        } catch {
            message.textContent = '解放できませんでした。HTTPSで開いてからもう一度お試しください。';
        } finally {
            busy = false;
            unlockButton.disabled = false;
        }
    }

    unlockButton.addEventListener('click', unlock);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            unlock();
        }
    });
    toggle.addEventListener('change', () => {
        enabled = unlocked && toggle.checked;
        message.textContent = enabled ? 'ベータモードをONにしました。' : 'ベータモードをOFFにしました。';
        apply();
        save();
    });
    refresh();
    apply();
    return { refresh, isEnabled: () => enabled };
}
