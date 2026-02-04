// Authentication files management: list, selection, upload/download, and actions

// Elements
const selectAllBtn = document.getElementById('select-all-btn');
const deleteBtn = document.getElementById('delete-btn');
const authFilesList = document.getElementById('auth-files-list');
const authLoading = document.getElementById('auth-loading');
const authFilesContainer = document.querySelector('#auth-content .auth-files-container');

// New dropdown elements
const newDropdown = document.getElementById('new-dropdown');
const newBtn = document.getElementById('new-btn');
const dropdownMenu = document.getElementById('dropdown-menu');
const downloadBtn = document.getElementById('download-btn');
const refreshBtn = document.getElementById('refresh-btn');

// State
let selectedAuthFiles = new Set();
let authFiles = [];

// Drag & drop upload overlay for auth files
let authDropOverlay = null;
let authDragDepth = 0;

function ensureAuthDropOverlay() {
    if (authDropOverlay || !authFilesContainer) return;
    const overlay = document.createElement('div');
    overlay.className = 'auth-drop-overlay';
    overlay.innerHTML = `
        <div>
            <div class="auth-drop-title">拖拽认证文件到这里上传</div>
            <div class="auth-drop-sub">支持 .json（可多选）</div>
        </div>
    `;
    authFilesContainer.appendChild(overlay);
    authDropOverlay = overlay;
}

function isAuthTabActive() {
    return document.querySelector('.tab.active')?.getAttribute('data-tab') === 'auth';
}

function showAuthDropOverlay() {
    ensureAuthDropOverlay();
    if (!authDropOverlay) return;
    authDropOverlay.classList.add('show');
}

function hideAuthDropOverlay() {
    if (!authDropOverlay) return;
    authDropOverlay.classList.remove('show');
}

async function handleDroppedAuthFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const invalid = files.filter(f => !String(f?.name || '').toLowerCase().endsWith('.json'));
    if (invalid.length) {
        showError(`只支持 .json 文件：${invalid.map(f => f.name).join(', ')}`);
        return;
    }
    await uploadFilesToServer(files);
    await loadAuthFiles();
}

async function uploadAuthFilesFromTauriPaths(paths) {
    if (!window.__TAURI__?.core?.invoke) {
        throw new Error('Tauri 环境不可用');
    }
    const type = localStorage.getItem('type') || 'local';
    if (type !== 'local') {
        throw new Error('远程模式暂不支持拖拽上传，请使用“新建 -> 本地文件”上传');
    }
    const list = Array.isArray(paths) ? paths : [];
    if (list.length === 0) return;
    const result = await window.__TAURI__.core.invoke('upload_local_auth_files_from_paths', { paths: list });
    if (result?.success && result?.successCount > 0) {
        typeof showSuccessMessage === 'function' && showSuccessMessage(`Uploaded ${result.successCount} file(s) successfully`);
    }
    if (result?.errorCount > 0) {
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const msg = errors.length && errors.length <= 3
            ? `Failed to upload ${result.errorCount} file(s): ${errors.join(', ')}`
            : `Failed to upload ${result.errorCount} file(s)`;
        showError(msg);
    }
}

// Load auth files from server
async function loadAuthFiles() {
    try {
        authFiles = await configManager.getAuthFiles();
        renderAuthFiles();
        updateActionButtons();
    } catch (error) {
        console.error('Error loading auth files:', error);
        showError('网络错误');
        showEmptyAuthFiles();
        updateActionButtons();
    }
}

// Render auth files list
function renderAuthFiles() {
    authLoading.style.display = 'none';
    if (authFiles.length === 0) {
        showEmptyAuthFiles();
        return;
    }
    authFilesList.innerHTML = '';
    authFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'auth-file-item';
        fileItem.dataset.filename = file.name;

        const fileSize = formatFileSize(file.size);
        const modTime = formatDate(file.modtime);

        fileItem.innerHTML = `
            <div class="auth-file-info">
                <div class="auth-file-name">${file.name}</div>
                <div class="auth-file-details">
                    <span class="auth-file-type">类型：${file.type || 'unknown'}</span>
                    <span class="auth-file-size">${fileSize}</span>
                    <span>修改时间：${modTime}</span>
                </div>
            </div>
        `;

        fileItem.addEventListener('click', () => toggleAuthFileSelection(file.name, fileItem));
        authFilesList.appendChild(fileItem);
    });
}

// Empty state for auth files
function showEmptyAuthFiles() {
    authLoading.style.display = 'none';
    authFilesList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <div class="empty-state-text">暂无认证文件</div>
            <div class="empty-state-subtitle">上传认证文件后即可在此管理</div>
        </div>
    `;
    updateActionButtons();
}

// Toggle selection of an auth file
function toggleAuthFileSelection(filename, fileItem) {
    if (selectedAuthFiles.has(filename)) {
        selectedAuthFiles.delete(filename);
        fileItem.classList.remove('selected');
    } else {
        selectedAuthFiles.add(filename);
        fileItem.classList.add('selected');
    }
    updateActionButtons();
}

// Update action buttons based on current tab/state
function updateActionButtons() {
    const hasSelection = selectedAuthFiles.size > 0;
    const allSelected = selectedAuthFiles.size === authFiles.length && authFiles.length > 0;
    const currentTab = document.querySelector('.tab.active').getAttribute('data-tab');
    if (currentTab === 'auth') {
        resetBtn.style.display = 'none';
        applyBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        selectAllBtn.style.display = 'block';
        deleteBtn.style.display = 'block';
        newDropdown.style.display = 'block';
        downloadBtn.style.display = 'block';
        selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
        deleteBtn.disabled = !hasSelection;
        downloadBtn.disabled = !hasSelection;
    } else if (currentTab === 'quota') {
        resetBtn.style.display = 'none';
        applyBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'block';
        selectAllBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        newDropdown.style.display = 'none';
        downloadBtn.style.display = 'none';
    } else if (currentTab === 'config') {
        resetBtn.style.display = 'none';
        applyBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        selectAllBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        newDropdown.style.display = 'none';
        downloadBtn.style.display = 'none';
    } else if (currentTab === 'logs') {
        resetBtn.style.display = 'none';
        applyBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        selectAllBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        newDropdown.style.display = 'none';
        downloadBtn.style.display = 'none';
    } else if (currentTab === 'access-token' || currentTab === 'api' || currentTab === 'openai' || currentTab === 'basic') {
        resetBtn.style.display = 'block';
        applyBtn.style.display = 'block';
        if (refreshBtn) refreshBtn.style.display = 'none';
        selectAllBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        newDropdown.style.display = 'none';
        downloadBtn.style.display = 'none';
    }
}

// Toggle select all auth files
function toggleSelectAllAuthFiles() {
    const allSelected = selectedAuthFiles.size === authFiles.length;
    if (allSelected) {
        selectedAuthFiles.clear();
        document.querySelectorAll('.auth-file-item').forEach(item => item.classList.remove('selected'));
    } else {
        selectedAuthFiles.clear();
        authFiles.forEach(file => selectedAuthFiles.add(file.name));
        document.querySelectorAll('.auth-file-item').forEach(item => item.classList.add('selected'));
    }
    updateActionButtons();
}

// Delete selected auth files
async function deleteSelectedAuthFiles() {
    if (selectedAuthFiles.size === 0 || deleteBtn.disabled) return;
    const fileCount = selectedAuthFiles.size;
    const fileText = '个文件';
    showConfirmDialog(
        '确认删除',
        `确定要删除 ${fileCount} ${fileText} 吗？\n该操作无法撤销。`,
        async () => {
            deleteBtn.disabled = true;
            deleteBtn.textContent = '删除中...';
            try {
                const result = await configManager.deleteAuthFiles(Array.from(selectedAuthFiles));
                if (result.success) {
                    showSuccessMessage(`已删除 ${result.successCount} 个文件`);
                    selectedAuthFiles.clear();
                    await loadAuthFiles();
                } else {
                    if (result.error) {
                        showError(result.error);
                    } else {
                        showError(`删除失败：${result.errorCount} 个文件`);
                    }
                }
            } catch (error) {
                console.error('Error deleting auth files:', error);
                showError('网络错误');
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.textContent = '删除';
                updateActionButtons();
            }
        }
    );
}

// Toggle dropdown menu visibility
function toggleDropdown() {
    dropdownMenu.classList.toggle('show');
}

// Close dropdown menu
function closeDropdown() {
    dropdownMenu.classList.remove('show');
}

// Create a new auth file by type
function createNewAuthFile(type) {
    const typeNames = {
        'gemini': 'Gemini CLI',
        'gemini-web': 'Gemini WEB',
        'claude': 'Claude Code',
        'codex': 'Codex',
        'qwen': 'Qwen Code',
        'vertex': 'Vertex',
        'iflow': 'iFlow',
        'antigravity': 'Antigravity',
        'local': '本地文件'
    };

    if (type === 'local') {
        uploadLocalFile();
    } else if (type === 'codex') {
        startCodexAuthFlow();
    } else if (type === 'claude') {
        startClaudeAuthFlow();
    } else if (type === 'gemini') {
        showGeminiProjectIdDialog();
    } else if (type === 'gemini-web') {
        showGeminiWebDialog();
    } else if (type === 'qwen') {
        startQwenAuthFlow();
    } else if (type === 'vertex') {
        showVertexImportDialog();
    } else if (type === 'antigravity') {
        startAntigravityAuthFlow();
    } else if (type === 'iflow') {
        startIFlowCookieFlow();
    } else {
        console.log(`Creating new ${typeNames[type]} auth file`);
        showSuccessMessage(`Creating new ${typeNames[type]} auth file...`);
    }
}

// Show Gemini Web dialog
function showGeminiWebDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'gemini-web-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Gemini WEB Authentication</h3>
                <button class="modal-close" id="gemini-web-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="codex-auth-content">
                    <p>Please enter your Gemini Web cookies:</p>
                    <div class="form-group">
                        <label for="gemini-web-secure-1psid-input">Secure-1PSID:</label>
                        <input type="text" id="gemini-web-secure-1psid-input" class="form-input" placeholder="Enter Secure-1PSID">
                    </div>
                    <div class="form-group">
                        <label for="gemini-web-secure-1psidts-input">Secure-1PSIDTS:</label>
                        <input type="text" id="gemini-web-secure-1psidts-input" class="form-input" placeholder="Enter Secure-1PSIDTS">
                    </div>
                    <div class="form-group">
                        <label for="gemini-web-email-input" style="text-align: left;">Email:</label>
                        <input type="email" id="gemini-web-email-input" class="form-input" placeholder="Enter your email address">
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="gemini-web-confirm-btn" class="btn-primary">Confirm</button>
                        <button type="button" id="gemini-web-cancel-btn" class="btn-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('gemini-web-modal-close').addEventListener('click', cancelGeminiWebDialog);
    document.getElementById('gemini-web-confirm-btn').addEventListener('click', confirmGeminiWebTokens);
    document.getElementById('gemini-web-cancel-btn').addEventListener('click', cancelGeminiWebDialog);
    document.addEventListener('keydown', handleGeminiWebEscapeKey);
    document.getElementById('gemini-web-secure-1psid-input').focus();
}

// Handle Gemini Web dialog escape key
function handleGeminiWebEscapeKey(e) {
    if (e.key === 'Escape') {
        cancelGeminiWebDialog();
    }
}

// Cancel Gemini Web dialog
function cancelGeminiWebDialog() {
    document.removeEventListener('keydown', handleGeminiWebEscapeKey);
    const modal = document.getElementById('gemini-web-modal');
    if (modal) modal.remove();
}

// Confirm Gemini Web tokens
async function confirmGeminiWebTokens() {
    try {
        const emailInput = document.getElementById('gemini-web-email-input');
        const secure1psidInput = document.getElementById('gemini-web-secure-1psid-input');
        const secure1psidtsInput = document.getElementById('gemini-web-secure-1psidts-input');

        const email = emailInput.value.trim();
        const secure1psid = secure1psidInput.value.trim();
        const secure1psidts = secure1psidtsInput.value.trim();

        if (!email || !secure1psid || !secure1psidts) {
            showError('Please enter email, Secure-1PSID and Secure-1PSIDTS');
            return;
        }

        cancelGeminiWebDialog();

        // Call Management API to save Gemini Web tokens
        const result = await configManager.saveGeminiWebTokens(secure1psid, secure1psidts, email);

        if (result.success) {
            showSuccessMessage('Gemini Web tokens saved successfully');
            // Refresh the auth files list
            await loadAuthFiles();
        } else {
            showError('Failed to save Gemini Web tokens: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving Gemini Web tokens:', error);
        showError('Failed to save Gemini Web tokens: ' + error.message);
    }
}

// Upload local JSON files
function uploadLocalFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) {
            document.body.removeChild(fileInput);
            return;
        }
        const invalidFiles = files.filter(file => !file.name.toLowerCase().endsWith('.json'));
        if (invalidFiles.length > 0) {
            showError(`Please select only JSON files. Invalid files: ${invalidFiles.map(f => f.name).join(', ')}`);
            document.body.removeChild(fileInput);
            return;
        }
        try {
            await uploadFilesToServer(files);
            await loadAuthFiles();
        } catch (error) {
            console.error('Error uploading files:', error);
            showError('Failed to upload files');
        } finally {
            document.body.removeChild(fileInput);
        }
    });
}

// Upload multiple files via config manager
async function uploadFilesToServer(files) {
    try {
        const result = await configManager.uploadAuthFiles(files);
        if (result.success && result.successCount > 0) {
            showSuccessMessage(`Uploaded ${result.successCount} file(s) successfully`);
        }
        if (result.errorCount > 0) {
            const errorMessage = result.errors && result.errors.length <= 3
                ? `Failed to upload ${result.errorCount} file(s): ${result.errors.join(', ')}`
                : `Failed to upload ${result.errorCount} file(s)`;
            showError(errorMessage);
        }
        if (result.error) {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error uploading files:', error);
        showError('Failed to upload files');
    }
}

// Legacy single-file upload (kept for compatibility)
async function uploadSingleFile(file, apiUrl, password) {
    console.warn('uploadSingleFile is deprecated, use configManager.uploadAuthFiles() instead');
}

// Download selected auth files
async function downloadSelectedAuthFiles() {
    if (selectedAuthFiles.size === 0 || downloadBtn.disabled) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = '下载中...';
    try {
        const result = await configManager.downloadAuthFiles(Array.from(selectedAuthFiles));
        if (result.success && result.successCount > 0) {
            showSuccessMessage(`已下载 ${result.successCount} 个文件`);
        }
        if (result.errorCount > 0) {
            showError(`下载失败：${result.errorCount} 个文件`);
        }
        if (result.error) {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error downloading files:', error);
        showError('下载失败');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '下载';
    }
}

// Legacy single-file download (kept for compatibility)
async function downloadFileToDirectory(filename, directoryHandle, baseUrl, password) {
    console.warn('downloadFileToDirectory is deprecated, use configManager.downloadAuthFiles() instead');
}

// Event wiring for auth files UI
selectAllBtn.addEventListener('click', toggleSelectAllAuthFiles);
deleteBtn.addEventListener('click', deleteSelectedAuthFiles);
downloadBtn.addEventListener('click', downloadSelectedAuthFiles);

newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
});

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = item.getAttribute('data-type');
        createNewAuthFile(type);
        closeDropdown();
    });
});

// Drag & drop events
if (authFilesContainer) {
    ensureAuthDropOverlay();

    const onDragEnter = (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
        authDragDepth += 1;
        showAuthDropOverlay();
    };
    const onDragOver = (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
        if (e?.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        showAuthDropOverlay();
    };
    const onDragLeave = (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
        authDragDepth = Math.max(0, authDragDepth - 1);
        if (authDragDepth === 0) hideAuthDropOverlay();
    };
    const onDrop = async (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
        authDragDepth = 0;
        hideAuthDropOverlay();
        try {
            // In WebView2, HTML5 drag/drop dataTransfer can be empty; prefer Tauri native file-drop events.
            const files = e?.dataTransfer?.files;
            const count = files ? files.length : 0;
            if (count > 0) {
                typeof showSuccessMessage === 'function' && showSuccessMessage(`检测到 ${count} 个文件，正在上传...`);
                await handleDroppedAuthFiles(files);
            } else {
                console.debug('[AUTH-FILES] drop received but no dataTransfer files; waiting for tauri://file-drop');
            }
        } catch (error) {
            console.error('Drop upload failed:', error);
            showError('上传失败');
        }
    };

    // Use container to ensure overlay doesn't swallow events
    authFilesContainer.addEventListener('dragenter', onDragEnter, true);
    authFilesContainer.addEventListener('dragover', onDragOver, true);
    authFilesContainer.addEventListener('dragleave', onDragLeave, true);
    authFilesContainer.addEventListener('drop', onDrop, true);

    // Prevent browser navigation when dropping files, only while auth tab is active
    window.addEventListener('dragover', (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
        if (!isAuthTabActive()) return;
        e.preventDefault();
    });
}

// Tauri native file-drop (more reliable in WebView2 than HTML5 drag/drop)
(() => {
    const tauri = window.__TAURI__;
    const hasTauri = !!tauri?.core?.invoke;
    console.log('[AUTH-FILES] init drag-drop', { hasTauri, hasEvent: !!tauri?.event?.listen, hasWindow: !!tauri?.window });

    const extractPaths = (payload) => {
        if (Array.isArray(payload)) return payload.filter(Boolean);
        if (Array.isArray(payload?.paths)) return payload.paths.filter(Boolean);
        if (Array.isArray(payload?.payload)) return payload.payload.filter(Boolean);
        return [];
    };

    const register = async () => {
        if (!tauri) return;

        // Prefer window-scoped listeners; file-drop is emitted per-window in Tauri.
        let listenTarget = null;
        try {
            const candidates = [
                () => tauri?.window?.getCurrentWindow?.(),
                () => tauri?.window?.WebviewWindow?.getCurrent?.(),
                () => tauri?.webviewWindow?.getCurrentWebviewWindow?.(),
                () => tauri?.webviewWindow?.WebviewWindow?.getCurrent?.(),
            ];
            for (const getWindow of candidates) {
                try {
                    const w = getWindow();
                    if (w?.listen) {
                        listenTarget = w;
                        break;
                    }
                } catch (_) { }
            }
        } catch (e) {
            console.warn('[AUTH-FILES] getCurrentWindow failed:', e);
        }
        if (!listenTarget && tauri?.event?.listen) listenTarget = tauri.event;
        if (!listenTarget?.listen) return;

        // Newer Tauri versions emit drag-drop events.
        await listenTarget.listen('tauri://drag-enter', (event) => {
            console.log('[AUTH-FILES] tauri://drag-enter', event?.payload);
            if (!isAuthTabActive()) return;
            showAuthDropOverlay();
        });
        await listenTarget.listen('tauri://drag-over', (event) => {
            console.log('[AUTH-FILES] tauri://drag-over', event?.payload);
            if (!isAuthTabActive()) return;
            showAuthDropOverlay();
        });
        await listenTarget.listen('tauri://drag-leave', (event) => {
            console.log('[AUTH-FILES] tauri://drag-leave', event?.payload);
            hideAuthDropOverlay();
            authDragDepth = 0;
        });
        await listenTarget.listen('tauri://drag-drop', async (event) => {
            console.log('[AUTH-FILES] tauri://drag-drop', event?.payload);
            if (!isAuthTabActive()) return;
            hideAuthDropOverlay();
            authDragDepth = 0;

            const paths = extractPaths(event?.payload);
            if (!paths.length) return;
            try {
                typeof showSuccessMessage === 'function' && showSuccessMessage(`检测到 ${paths.length} 个文件，正在上传...`);
                await uploadAuthFilesFromTauriPaths(paths);
                await loadAuthFiles();
            } catch (e) {
                console.error('tauri file-drop upload failed:', e);
                showError(`上传失败：${e?.message || String(e)}`);
            }
        });

        // Backward compatibility: older Tauri emitted file-drop events.
        await listenTarget.listen('tauri://file-drop-hover', (event) => {
            console.log('[AUTH-FILES] tauri://file-drop-hover', event?.payload);
            if (!isAuthTabActive()) return;
            showAuthDropOverlay();
        });
        await listenTarget.listen('tauri://file-drop-cancelled', (event) => {
            console.log('[AUTH-FILES] tauri://file-drop-cancelled', event?.payload);
            hideAuthDropOverlay();
            authDragDepth = 0;
        });
        await listenTarget.listen('tauri://file-drop', async (event) => {
            console.log('[AUTH-FILES] tauri://file-drop', event?.payload);
            if (!isAuthTabActive()) return;
            hideAuthDropOverlay();
            authDragDepth = 0;
            const paths = extractPaths(event?.payload);
            if (!paths.length) return;
            try {
                typeof showSuccessMessage === 'function' && showSuccessMessage(`检测到 ${paths.length} 个文件，正在上传...`);
                await uploadAuthFilesFromTauriPaths(paths);
                await loadAuthFiles();
            } catch (e) {
                console.error('tauri file-drop upload failed:', e);
                showError(`上传失败：${e?.message || String(e)}`);
            }
        });

        console.log('[AUTH-FILES] registered file-drop listeners', {
            target: listenTarget === tauri.event ? 'tauri.event' : 'currentWindow'
        });
    };

    register().catch((e) => {
        console.warn('[AUTH-FILES] failed to register tauri file-drop listeners:', e);
    });
})();

document.addEventListener('click', (e) => {
    if (!newDropdown.contains(e.target)) {
        closeDropdown();
    }
});
