// Logs tab: CPA stdout/stderr tail + error log files

const logsRefreshBtn = document.getElementById('logs-refresh-btn');
const logsCopyBtn = document.getElementById('logs-copy-btn');

const cpaOutputViewer = document.getElementById('cpa-output-viewer');
const cpaOutputMeta = document.getElementById('cpa-output-meta');
const cpaOutputAuto = document.getElementById('cpa-output-auto');
const cpaOutputClearBtn = document.getElementById('cpa-output-clear-btn');

const errorLogSelect = document.getElementById('error-log-select');
const errorLogReloadBtn = document.getElementById('error-log-reload-btn');
const errorLogCopyBtn = document.getElementById('error-log-copy-btn');
const errorLogClearAllBtn = document.getElementById('error-log-clear-all-btn');
const errorLogDeleteBtn = document.getElementById('error-log-delete-btn');
const errorLogViewer = document.getElementById('error-log-viewer');
const errorLogMeta = document.getElementById('error-log-meta');

let logsTimer = null;
let currentErrorLogName = '';

function setText(el, text) {
    if (!el) return;
    el.textContent = String(text ?? '');
}

function nowText() {
    return new Date().toLocaleString();
}

async function refreshCpaOutput() {
    if (!cpaOutputViewer) return;
    if (!window.__TAURI__?.core?.invoke) {
        setText(cpaOutputViewer, '需要在 Tauri 环境中运行');
        return;
    }
    try {
        const res = await window.__TAURI__.core.invoke('get_cpa_output_tail', { limit: 600 });
        const lines = Array.isArray(res?.lines) ? res.lines : [];
        setText(cpaOutputViewer, lines.join('\n'));
        setText(cpaOutputMeta, `更新：${nowText()}（${lines.length} 行）`);
        cpaOutputViewer.scrollTop = cpaOutputViewer.scrollHeight;
    } catch (e) {
        console.error('refreshCpaOutput failed:', e);
        setText(cpaOutputMeta, '更新失败');
    }
}

async function loadErrorLogList(selectNewest = true) {
    if (!errorLogSelect) return;
    if (!window.__TAURI__?.core?.invoke) {
        errorLogSelect.innerHTML = '<option value="">需要在 Tauri 环境中运行</option>';
        return;
    }
    try {
        const res = await window.__TAURI__.core.invoke('list_error_log_files');
        const files = Array.isArray(res?.files) ? res.files : [];
        errorLogSelect.innerHTML = '';
        if (files.length === 0) {
            errorLogSelect.innerHTML = '<option value="">无错误日志文件</option>';
            currentErrorLogName = '';
            setText(errorLogViewer, '');
            setText(errorLogMeta, '无日志');
            return;
        }
        for (const f of files) {
            const name = f?.name || '';
            const size = typeof f?.size === 'number' ? f.size : 0;
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = `${name} (${Math.round(size / 1024)} KB)`;
            errorLogSelect.appendChild(opt);
        }
        if (selectNewest || !currentErrorLogName) {
            currentErrorLogName = files[0].name;
        }
        errorLogSelect.value = currentErrorLogName;
    } catch (e) {
        console.error('loadErrorLogList failed:', e);
        errorLogSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

async function refreshErrorLogContent() {
    if (!errorLogViewer || !window.__TAURI__?.core?.invoke) return;
    const name = (errorLogSelect?.value || '').trim();
    if (!name) {
        setText(errorLogViewer, '');
        setText(errorLogMeta, '未选择');
        return;
    }
    currentErrorLogName = name;
    try {
        const res = await window.__TAURI__.core.invoke('read_error_log_file', { name, tailBytes: 400000 });
        const content = String(res?.content ?? '');
        setText(errorLogViewer, content);
        setText(errorLogMeta, `更新：${nowText()}`);
        errorLogViewer.scrollTop = errorLogViewer.scrollHeight;
    } catch (e) {
        console.error('refreshErrorLogContent failed:', e);
        setText(errorLogMeta, '读取失败');
    }
}

async function copyActiveLogs() {
    const tab = document.querySelector('.tab.active')?.getAttribute('data-tab');
    if (tab !== 'logs') return;
    const parts = [];
    if (cpaOutputViewer?.textContent) parts.push('=== CPA OUTPUT ===\n' + cpaOutputViewer.textContent);
    if (errorLogViewer?.textContent) parts.push('=== ERROR LOG ===\n' + errorLogViewer.textContent);
    const text = parts.join('\n\n');
    if (!text) return;
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

async function clearCpaOutput() {
    if (!window.__TAURI__?.core?.invoke) return;
    try {
        await window.__TAURI__.core.invoke('clear_cpa_output_tail');
        setText(cpaOutputViewer, '');
        setText(cpaOutputMeta, `已清空：${nowText()}`);
        typeof showSuccessMessage === 'function' && showSuccessMessage('已清空');
    } catch (e) {
        console.error('clearCpaOutput failed:', e);
        typeof showError === 'function' && showError(`清空失败：${e?.message || String(e)}`);
    }
}

async function clearAllErrorLogs() {
    if (!window.__TAURI__?.core?.invoke) return;
    const doClear = async () => {
        try {
            const res = await window.__TAURI__.core.invoke('clear_all_error_logs');
            await loadErrorLogList(true);
            await refreshErrorLogContent();
            const count = typeof res?.count === 'number' ? res.count : 0;
            const errorCount = typeof res?.errorCount === 'number' ? res.errorCount : 0;
            if (errorCount > 0) {
                typeof showError === 'function' && showError(`删除完成：${count} 个；失败：${errorCount} 个`);
            } else {
                typeof showSuccessMessage === 'function' && showSuccessMessage(`已删除全部错误日志（${count} 个）`);
            }
        } catch (e) {
            console.error('clearAllErrorLogs failed:', e);
            typeof showError === 'function' && showError(`删除失败：${e?.message || String(e)}`);
        }
    };
    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('删除错误日志', '确定要删除所有错误日志文件吗？该操作无法撤销。', doClear);
    } else {
        if (confirm('确定要删除所有错误日志文件吗？该操作无法撤销。')) await doClear();
    }
}

async function deleteCurrentErrorLog() {
    if (!window.__TAURI__?.core?.invoke) return;
    const name = (errorLogSelect?.value || '').trim();
    if (!name) return;
    const doDelete = async () => {
        try {
            await window.__TAURI__.core.invoke('delete_error_log_file', { name });
            currentErrorLogName = '';
            await loadErrorLogList(true);
            await refreshErrorLogContent();
            typeof showSuccessMessage === 'function' && showSuccessMessage('已删除');
        } catch (e) {
            console.error('deleteCurrentErrorLog failed:', e);
            typeof showError === 'function' && showError(`删除失败：${e?.message || String(e)}`);
        }
    };
    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('删除错误日志', `确定要删除 ${name} 吗？该操作无法撤销。`, doDelete);
    } else {
        if (confirm(`确定要删除 ${name} 吗？该操作无法撤销。`)) await doDelete();
    }
}

function startLogsTimer() {
    if (logsTimer) return;
    logsTimer = setInterval(async () => {
        const currentTab = document.querySelector('.tab.active')?.getAttribute('data-tab');
        if (currentTab !== 'logs') return;
        if (cpaOutputAuto && !cpaOutputAuto.checked) return;
        await refreshCpaOutput();
    }, 1200);
}

function stopLogsTimer() {
    if (!logsTimer) return;
    clearInterval(logsTimer);
    logsTimer = null;
}

// Called by settings-tabs.js
async function loadLogsTab() {
    await refreshCpaOutput();
    await loadErrorLogList(true);
    await refreshErrorLogContent();
    startLogsTimer();
}

logsRefreshBtn && logsRefreshBtn.addEventListener('click', async () => {
    await refreshCpaOutput();
    await loadErrorLogList(false);
    await refreshErrorLogContent();
});
logsCopyBtn && logsCopyBtn.addEventListener('click', copyActiveLogs);
cpaOutputClearBtn && cpaOutputClearBtn.addEventListener('click', clearCpaOutput);

errorLogReloadBtn && errorLogReloadBtn.addEventListener('click', async () => {
    await loadErrorLogList(false);
    await refreshErrorLogContent();
});
errorLogSelect && errorLogSelect.addEventListener('change', refreshErrorLogContent);
errorLogCopyBtn && errorLogCopyBtn.addEventListener('click', async () => {
    if (!errorLogViewer?.textContent) return;
    const ok = typeof copyTextToClipboard === 'function' ? await copyTextToClipboard(errorLogViewer.textContent) : false;
    if (ok) {
        typeof showSuccessMessage === 'function' && showSuccessMessage('已复制');
    } else {
        typeof showError === 'function' && showError('复制失败');
    }
});
errorLogClearAllBtn && errorLogClearAllBtn.addEventListener('click', clearAllErrorLogs);
errorLogDeleteBtn && errorLogDeleteBtn.addEventListener('click', deleteCurrentErrorLog);

// Stop timer when leaving page
window.addEventListener('beforeunload', stopLogsTimer);
