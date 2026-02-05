// Custom confirmation dialog helpers and events

// Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmClose = document.getElementById('confirm-close');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmDelete = document.getElementById('confirm-delete');

// State
let confirmCallback = null;

function setConfirmButtonStyle(button, className) {
    if (!button) return;
    button.classList.remove('btn-delete', 'btn-primary');
    const names = String(className || '').trim().split(/\s+/g).filter(Boolean);
    if (names.length) button.classList.add(...names);
}

function showConfirmDialog(title, message, callback, options) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmCallback = callback;

    const opts = options && typeof options === 'object' ? options : {};
    confirmCancel.textContent = opts.cancelText || '取消';
    confirmDelete.textContent = opts.confirmText || '删除';
    setConfirmButtonStyle(confirmDelete, opts.confirmButtonClass || 'btn-delete');

    confirmModal.classList.add('show');
}

function hideConfirmDialog() {
    confirmModal.classList.remove('show');
    confirmCallback = null;
}

function handleConfirmDelete() {
    if (confirmCallback) {
        confirmCallback();
    }
    hideConfirmDialog();
}

// Events
confirmClose.addEventListener('click', hideConfirmDialog);
confirmCancel.addEventListener('click', hideConfirmDialog);
confirmDelete.addEventListener('click', handleConfirmDelete);
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) hideConfirmDialog(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && confirmModal.classList.contains('show')) hideConfirmDialog(); });

