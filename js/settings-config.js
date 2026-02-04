// Config management: edit config.yaml via CPA management API (local/remote)

const configEditorEl = document.getElementById('config-editor');
const configReloadBtn = document.getElementById('config-reload-btn');
const configSaveBtn = document.getElementById('config-save-btn');
const configCopyBtn = document.getElementById('config-copy-btn');

const configSearchInput = document.getElementById('config-search-input');
const configSearchBtn = document.getElementById('config-search-btn');
const configSearchPrevBtn = document.getElementById('config-search-prev-btn');
const configSearchNextBtn = document.getElementById('config-search-next-btn');
const configSearchMetaEl = document.getElementById('config-search-meta');
const configStatusEl = document.getElementById('config-status');

let configOriginalText = '';
let searchMatches = [];
let searchActiveIndex = -1;

function setConfigStatus(text) {
    if (!configStatusEl) return;
    configStatusEl.textContent = String(text || '');
}

function updateSearchMeta() {
    if (!configSearchMetaEl) return;
    if (!searchMatches || searchMatches.length === 0) {
        configSearchMetaEl.textContent = '无结果';
        return;
    }
    configSearchMetaEl.textContent = `${searchActiveIndex + 1} / ${searchMatches.length}`;
}

function findAllMatches(text, needle) {
    const hay = String(text ?? '');
    const n = String(needle ?? '');
    if (!n) return [];
    const out = [];
    let idx = 0;
    while (true) {
        const at = hay.indexOf(n, idx);
        if (at === -1) break;
        out.push(at);
        idx = at + Math.max(1, n.length);
    }
    return out;
}

function scrollTextareaToIndex(textarea, index) {
    try {
        const before = textarea.value.slice(0, Math.max(0, index));
        const line = before.split('\n').length - 1;
        const styles = window.getComputedStyle(textarea);
        const lh = Number.parseFloat(styles.lineHeight) || 16;
        textarea.scrollTop = Math.max(0, (line - 3) * lh);
    } catch (_) { }
}

function jumpToMatch(i) {
    if (!configEditorEl) return;
    if (!searchMatches || searchMatches.length === 0) return;
    const needle = String(configSearchInput?.value ?? '');
    if (!needle) return;

    const idx = searchMatches[i];
    if (typeof idx !== 'number' || idx < 0) return;

    searchActiveIndex = i;
    updateSearchMeta();

    configEditorEl.focus();
    configEditorEl.setSelectionRange(idx, idx + needle.length);
    scrollTextareaToIndex(configEditorEl, idx);
}

function runSearch() {
    if (!configEditorEl) return;
    const needle = String(configSearchInput?.value ?? '');
    searchMatches = findAllMatches(configEditorEl.value, needle);
    searchActiveIndex = searchMatches.length ? 0 : -1;
    updateSearchMeta();
    if (searchMatches.length) jumpToMatch(0);
}

async function copyConfigToClipboard() {
    if (!configEditorEl) return;
    const text = configEditorEl.value || '';
    try {
        const ok = typeof copyTextToClipboard === 'function' ? await copyTextToClipboard(text) : false;
        if (ok) {
            typeof showSuccessMessage === 'function' && showSuccessMessage('已复制');
        } else {
            throw new Error('复制失败');
        }
    } catch (e) {
        typeof showError === 'function' && showError(`复制失败：${e?.message || String(e)}`);
    }
}

async function reloadConfigYaml() {
    if (!configEditorEl) return;
    setConfigStatus('加载中...');
    configEditorEl.disabled = true;
    try {
        const text = await configManager.getConfigYaml();
        configOriginalText = String(text ?? '');
        configEditorEl.value = configOriginalText;
        setConfigStatus(`已加载：${new Date().toLocaleString()}`);
        searchMatches = [];
        searchActiveIndex = -1;
        updateSearchMeta();
    } catch (e) {
        console.error('reloadConfigYaml failed:', e);
        setConfigStatus('加载失败');
        typeof showError === 'function' && showError(`加载失败：${e?.message || String(e)}`);
    } finally {
        configEditorEl.disabled = false;
    }
}

async function saveConfigYaml() {
    if (!configEditorEl) return;
    const text = configEditorEl.value || '';
    if (text === configOriginalText) {
        typeof showSuccessMessage === 'function' && showSuccessMessage('没有变更');
        return;
    }

    configSaveBtn && (configSaveBtn.disabled = true);
    const old = configSaveBtn?.textContent;
    configSaveBtn && (configSaveBtn.textContent = '保存中...');
    setConfigStatus('保存中...');
    try {
        const res = await configManager.saveConfigYaml(text);
        configOriginalText = text;
        setConfigStatus(`已保存：${new Date().toLocaleString()}`);
        if (res?.ok) {
            typeof showSuccessMessage === 'function' && showSuccessMessage('保存成功');
        } else {
            typeof showSuccessMessage === 'function' && showSuccessMessage('已提交保存');
        }
    } catch (e) {
        console.error('saveConfigYaml failed:', e);
        setConfigStatus('保存失败');
        typeof showError === 'function' && showError(`保存失败：${e?.message || String(e)}`);
    } finally {
        configSaveBtn && (configSaveBtn.disabled = false);
        configSaveBtn && (configSaveBtn.textContent = old || '保存');
    }
}

// Called by settings-tabs.js
async function loadConfigManagement() {
    if (!configEditorEl) return;
    if (!configOriginalText) {
        await reloadConfigYaml();
    } else {
        setConfigStatus(`已加载：${new Date().toLocaleString()}`);
    }
}

// Wire events
configReloadBtn && configReloadBtn.addEventListener('click', reloadConfigYaml);
configSaveBtn && configSaveBtn.addEventListener('click', saveConfigYaml);
configCopyBtn && configCopyBtn.addEventListener('click', copyConfigToClipboard);

configSearchBtn && configSearchBtn.addEventListener('click', runSearch);
configSearchInput && configSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
    }
});
configSearchPrevBtn && configSearchPrevBtn.addEventListener('click', () => {
    if (!searchMatches || searchMatches.length === 0) return;
    const next = (searchActiveIndex - 1 + searchMatches.length) % searchMatches.length;
    jumpToMatch(next);
});
configSearchNextBtn && configSearchNextBtn.addEventListener('click', () => {
    if (!searchMatches || searchMatches.length === 0) return;
    const next = (searchActiveIndex + 1) % searchMatches.length;
    jumpToMatch(next);
});

