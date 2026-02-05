// Maintenance actions: update CPA and open management page

const openManagementBtn = document.getElementById('open-management-btn');
const updateCpaBtn = document.getElementById('update-cpa-btn');
const restartCpaBtn = document.getElementById('restart-cpa-btn');

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
}

openManagementBtn && openManagementBtn.addEventListener('click', openManagementPage);
updateCpaBtn && updateCpaBtn.addEventListener('click', updateCpa);
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
