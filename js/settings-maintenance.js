// Maintenance actions: update CPA and open management page

const openManagementBtn = document.getElementById('open-management-btn');
const updateCpaBtn = document.getElementById('update-cpa-btn');
const restartCpaBtn = document.getElementById('restart-cpa-btn');
const stopCpaBtn = document.getElementById('stop-cpa-btn');
const openHelperBtn = document.getElementById('open-helper-btn');
const updateHelperBtn = document.getElementById('update-helper-btn');
const restartHelperBtn = document.getElementById('restart-helper-btn');
const stopHelperBtn = document.getElementById('stop-helper-btn');

const HELPER_URL = 'http://127.0.0.1:18317';

function normalizeBaseUrl(url) {
    const s = String(url || '').trim().replace(/\/+$/g, '');
    return s;
}

async function openManagementPage() {
    try {
        const type = localStorage.getItem('type') || 'local';
        let url = '';
        if (type === 'local') {
            const config = await configManager.getConfig();
            const port = config.port || 8317;
            url = `http://127.0.0.1:${port}/management.html`;
        } else {
            configManager.refreshConnection();
            const base = normalizeBaseUrl(localStorage.getItem('base-url') || configManager.baseUrl);
            if (!base) throw new Error('缺少远程地址');
            url = `${base}/management.html`;
        }

        if (window.__TAURI__?.shell?.open) {
            await window.__TAURI__.shell.open(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        console.error('openManagementPage failed:', e);
        typeof showError === 'function' && showError(`打开失败：${e?.message || String(e)}`);
    }
}

async function openExternalUrl(url) {
    if (window.__TAURI__?.shell?.open) {
        await window.__TAURI__.shell.open(url);
    } else {
        window.open(url, '_blank');
    }
}

async function updateCpa() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    try {
        const proxyUrl = (localStorage.getItem('proxy-url') || '').trim();
        updateCpaBtn && (updateCpaBtn.disabled = true);
        const old = updateCpaBtn?.textContent;
        updateCpaBtn && (updateCpaBtn.textContent = '检查中...');

        const check = await window.__TAURI__.core.invoke('check_version_and_download', { proxyUrl });
        if (!check || !check.success) {
            throw new Error(check?.error || '检查更新失败');
        }
        if (!check.needsUpdate) {
            typeof showSuccessMessage === 'function' && showSuccessMessage(`已是最新版本：${check.version || ''}`);
            return;
        }

        // Confirm update
        const msg = `当前版本：${check.version}\n最新版本：${check.latestVersion}\n\n是否更新到最新版本？`;
        if (typeof showConfirmDialog !== 'function') {
            // fallback
            if (!confirm(msg)) return;
            await doUpdate(proxyUrl);
            return;
        }
        showConfirmDialog('更新 CLIProxyAPI', msg, async () => {
            await doUpdate(proxyUrl);
        }, { confirmText: '更新', confirmButtonClass: 'btn-primary' });
    } catch (e) {
        console.error('updateCpa failed:', e);
        typeof showError === 'function' && showError(`更新失败：${e?.message || String(e)}`);
    } finally {
        updateCpaBtn && (updateCpaBtn.disabled = false);
        if (updateCpaBtn) updateCpaBtn.textContent = '更新 CPA';
    }
}

async function doUpdate(proxyUrl) {
    updateCpaBtn && (updateCpaBtn.disabled = true);
    if (updateCpaBtn) updateCpaBtn.textContent = '更新中...';
    try {
        const res = await window.__TAURI__.core.invoke('download_cliproxyapi', { proxyUrl });
        if (!res || !res.success) {
            throw new Error(res?.error || '下载/安装失败');
        }

        localStorage.setItem('cliproxyapi-path', res.path || '');
        localStorage.setItem('cliproxyapi-version', res.version || '');
        typeof showSuccessMessage === 'function' && showSuccessMessage(`更新完成：${res.version || ''}`);

        // Restart local CPA if possible
        try {
            await window.__TAURI__.core.invoke('restart_cliproxyapi');
            typeof showSuccessMessage === 'function' && showSuccessMessage('已重启 CLIProxyAPI');
        } catch (e) {
            console.warn('restart_cliproxyapi failed:', e);
        }
    } catch (e) {
        console.error('doUpdate failed:', e);
        typeof showError === 'function' && showError(`更新失败：${e?.message || String(e)}`);
    } finally {
        updateCpaBtn && (updateCpaBtn.disabled = false);
        if (updateCpaBtn) updateCpaBtn.textContent = '更新 CPA';
    }
}

async function openHelperPage() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    try {
        const result = await window.__TAURI__.core.invoke('start_cpa_helper');
        if (!result || !result.success) {
            throw new Error(result?.error || 'CPA-Helper 启动失败，请先更新 Helper');
        }
        await openExternalUrl(HELPER_URL);
    } catch (e) {
        console.error('openHelperPage failed:', e);
        typeof showError === 'function' && showError(`打开 Helper 失败：${e?.message || String(e)}`);
    }
}

async function updateHelper() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    try {
        const proxyUrl = (localStorage.getItem('proxy-url') || '').trim();
        updateHelperBtn && (updateHelperBtn.disabled = true);
        updateHelperBtn && (updateHelperBtn.textContent = '检查中...');

        const check = await window.__TAURI__.core.invoke('check_helper_version_and_download', { proxyUrl });
        if (!check || !check.success) {
            throw new Error(check?.error || '检查 Helper 更新失败');
        }
        if (!check.needsUpdate) {
            typeof showSuccessMessage === 'function' && showSuccessMessage(`Helper 已是最新版本：${check.version || ''}`);
            return;
        }

        const msg = `当前版本：${check.version || '未安装'}\n最新版本：${check.latestVersion}\n\n是否更新 Helper 到最新版本？`;
        if (typeof showConfirmDialog !== 'function') {
            if (!confirm(msg)) return;
            await doUpdateHelper(proxyUrl);
            return;
        }
        showConfirmDialog('更新 CPA-Helper', msg, async () => {
            await doUpdateHelper(proxyUrl);
        }, { confirmText: '更新', confirmButtonClass: 'btn-primary' });
    } catch (e) {
        console.error('updateHelper failed:', e);
        typeof showError === 'function' && showError(`更新 Helper 失败：${e?.message || String(e)}`);
    } finally {
        updateHelperBtn && (updateHelperBtn.disabled = false);
        if (updateHelperBtn) updateHelperBtn.textContent = '更新 Helper';
    }
}

async function doUpdateHelper(proxyUrl) {
    updateHelperBtn && (updateHelperBtn.disabled = true);
    if (updateHelperBtn) updateHelperBtn.textContent = '更新中...';
    try {
        const res = await window.__TAURI__.core.invoke('download_cpa_helper', { proxyUrl });
        if (!res || !res.success) {
            throw new Error(res?.error || 'Helper 下载/安装失败');
        }

        localStorage.setItem('cpa-helper-path', res.path || '');
        localStorage.setItem('cpa-helper-version', res.version || '');
        typeof showSuccessMessage === 'function' && showSuccessMessage(`Helper 更新完成：${res.version || ''}`);

        try {
            const restart = await window.__TAURI__.core.invoke('restart_cpa_helper');
            if (!restart || !restart.success) {
                throw new Error(restart?.error || 'CPA-Helper 重启失败');
            }
            typeof showSuccessMessage === 'function' && showSuccessMessage('已重启 CPA-Helper');
        } catch (e) {
            console.warn('restart_cpa_helper failed:', e);
        }
    } catch (e) {
        console.error('doUpdateHelper failed:', e);
        typeof showError === 'function' && showError(`更新 Helper 失败：${e?.message || String(e)}`);
    } finally {
        updateHelperBtn && (updateHelperBtn.disabled = false);
        if (updateHelperBtn) updateHelperBtn.textContent = '更新 Helper';
    }
}

async function restartHelper() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    const type = localStorage.getItem('type') || 'local';
    if (type !== 'local') {
        typeof showError === 'function' && showError('远程模式不支持重启 Helper');
        return;
    }

    const doRestart = async () => {
        restartHelperBtn.disabled = true;
        const old = restartHelperBtn.textContent;
        restartHelperBtn.textContent = '重启中...';
        try {
            const res = await window.__TAURI__.core.invoke('restart_cpa_helper');
            if (!res || !res.success) {
                throw new Error(res?.error || 'CPA-Helper 重启失败');
            }
            typeof showSuccessMessage === 'function' && showSuccessMessage('已重启 CPA-Helper');
        } catch (e) {
            console.error('restart_cpa_helper failed:', e);
            typeof showError === 'function' && showError(`重启 Helper 失败：${e?.message || String(e)}`);
        } finally {
            restartHelperBtn.disabled = false;
            restartHelperBtn.textContent = old || '重启 Helper';
        }
    };

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('重启 CPA-Helper', '确定要重启 Helper 吗？', doRestart, { confirmText: '确定', confirmButtonClass: 'btn-primary' });
    } else {
        if (confirm('确定要重启 Helper 吗？')) await doRestart();
    }
}

async function stopHelper() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    const type = localStorage.getItem('type') || 'local';
    if (type !== 'local') {
        typeof showError === 'function' && showError('远程模式不支持关闭 Helper');
        return;
    }

    const doStop = async () => {
        stopHelperBtn.disabled = true;
        const old = stopHelperBtn.textContent;
        stopHelperBtn.textContent = '关闭中...';
        try {
            const res = await window.__TAURI__.core.invoke('stop_cpa_helper');
            if (!res || !res.success) {
                throw new Error(res?.error || 'CPA-Helper 关闭失败');
            }
            typeof showSuccessMessage === 'function' && showSuccessMessage('已关闭 CPA-Helper');
        } catch (e) {
            console.error('stop_cpa_helper failed:', e);
            typeof showError === 'function' && showError(`关闭 Helper 失败：${e?.message || String(e)}`);
        } finally {
            stopHelperBtn.disabled = false;
            stopHelperBtn.textContent = old || '关闭 Helper';
        }
    };

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('关闭 CPA-Helper', '确定要关闭 Helper 进程吗？', doStop, { confirmText: '关闭', confirmButtonClass: 'btn-primary' });
    } else {
        if (confirm('确定要关闭 Helper 进程吗？')) await doStop();
    }
}

async function stopCpa() {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    const type = localStorage.getItem('type') || 'local';
    if (type !== 'local') {
        typeof showError === 'function' && showError('远程模式不支持关闭 CPA');
        return;
    }

    const doStop = async () => {
        stopCpaBtn.disabled = true;
        const old = stopCpaBtn.textContent;
        stopCpaBtn.textContent = '关闭中...';
        try {
            const res = await window.__TAURI__.core.invoke('stop_cliproxyapi');
            if (!res || !res.success) {
                throw new Error(res?.error || 'CLIProxyAPI 关闭失败');
            }
            typeof showSuccessMessage === 'function' && showSuccessMessage('已关闭 CLIProxyAPI');
        } catch (e) {
            console.error('stop_cliproxyapi failed:', e);
            typeof showError === 'function' && showError(`关闭 CPA 失败：${e?.message || String(e)}`);
        } finally {
            stopCpaBtn.disabled = false;
            stopCpaBtn.textContent = old || '关闭 CPA';
        }
    };

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('关闭 CLIProxyAPI', '确定要关闭 CPA 进程吗？', doStop, { confirmText: '关闭', confirmButtonClass: 'btn-primary' });
    } else {
        if (confirm('确定要关闭 CPA 进程吗？')) await doStop();
    }
}

openManagementBtn && openManagementBtn.addEventListener('click', openManagementPage);
updateCpaBtn && updateCpaBtn.addEventListener('click', updateCpa);
stopCpaBtn && stopCpaBtn.addEventListener('click', stopCpa);
openHelperBtn && openHelperBtn.addEventListener('click', openHelperPage);
updateHelperBtn && updateHelperBtn.addEventListener('click', updateHelper);
restartHelperBtn && restartHelperBtn.addEventListener('click', restartHelper);
stopHelperBtn && stopHelperBtn.addEventListener('click', stopHelper);
restartCpaBtn && restartCpaBtn.addEventListener('click', async () => {
    if (!window.__TAURI__?.core?.invoke) {
        typeof showError === 'function' && showError('该功能需要在 Tauri 环境中运行');
        return;
    }
    const type = localStorage.getItem('type') || 'local';
    if (type !== 'local') {
        typeof showError === 'function' && showError('远程模式不支持重启 CPA');
        return;
    }

    const doRestart = async () => {
        restartCpaBtn.disabled = true;
        const old = restartCpaBtn.textContent;
        restartCpaBtn.textContent = '重启中...';
        try {
            await window.__TAURI__.core.invoke('restart_cliproxyapi');
            typeof showSuccessMessage === 'function' && showSuccessMessage('已重启 CLIProxyAPI');
        } catch (e) {
            console.error('restart_cliproxyapi failed:', e);
            typeof showError === 'function' && showError(`重启失败：${e?.message || String(e)}`);
        } finally {
            restartCpaBtn.disabled = false;
            restartCpaBtn.textContent = old || '重启 CPA';
        }
    };

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('重启 CLIProxyAPI', '确定要重启 CPA 吗？', doRestart, { confirmText: '确定', confirmButtonClass: 'btn-primary' });
    } else {
        if (confirm('确定要重启 CPA 吗？')) await doRestart();
    }
});
