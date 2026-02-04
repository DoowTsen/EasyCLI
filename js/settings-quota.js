// Quota management: surface selected features from CPA management center

const quotaAuthStatusEl = document.getElementById('quota-auth-status');
const quotaCodexEl = document.getElementById('quota-codex');
const quotaGeminiEl = document.getElementById('quota-gemini');
const quotaAntigravityEl = document.getElementById('quota-antigravity');
const quotaLastUpdatedEl = document.getElementById('quota-last-updated');

const quotaRefreshStatusBtn = document.getElementById('quota-refresh-status-btn');
const quotaRefreshQuotaBtn = document.getElementById('quota-refresh-quota-btn');
const actionRefreshBtn = document.getElementById('refresh-btn');

// Constants extracted from CPA management.html
const CODEx_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_HEADERS = {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
};

const GEMINI_QUOTA_URL = 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';
const GEMINI_HEADERS = {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
};

const ANTIGRAVITY_URLS = [
    'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
    'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
];
const ANTIGRAVITY_HEADERS = {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'antigravity/1.11.5 windows/amd64',
};

let authStatusList = [];
let quotaState = {
    codex: new Map(),
    gemini: new Map(),
    antigravity: new Map(),
};

const authFileDetailsCache = new Map(); // name -> parsed JSON (best-effort)

function getAuthIndex(item) {
    const v = item?.auth_index ?? item?.authIndex ?? item?.index ?? item?.id;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string') {
        const s = v.trim();
        return s ? s : null;
    }
    return null;
}

function getProvider(item) {
    return String(item?.provider ?? item?.type ?? item?.kind ?? item?.name ?? '').trim();
}

function getLabel(item) {
    return String(item?.label ?? item?.email ?? item?.name ?? item?.file ?? '').trim();
}

function getProjectId(item) {
    return String(item?.project_id ?? item?.projectId ?? '').trim();
}

function getAccountId(item) {
    const direct = String(item?.account_id ?? item?.accountId ?? item?.chatgpt_account_id ?? item?.chatgptAccountId ?? '').trim();
    if (direct) return direct;
    const nested = String(item?.id_token?.chatgpt_account_id ?? '').trim();
    return nested;
}

function getAuthFileName(item) {
    return String(item?.name ?? item?.id ?? '').trim();
}

function parseProjectIdFromAccountString(item) {
    const account = String(item?.account ?? '').trim();
    if (!account) return '';
    const m = account.match(/\(([^)]+)\)\s*$/);
    return m ? String(m[1] || '').trim() : '';
}

function parseProjectIdFromFilename(item) {
    const name = getAuthFileName(item);
    if (!name) return '';
    const provider = getProvider(item).toLowerCase();
    // Only attempt for gemini-cli filenames like: gemini-<email>-<project>.json
    if (!/gemini/i.test(provider)) return '';
    const base = name.replace(/\.json$/i, '');
    const idx = base.lastIndexOf('-');
    if (idx <= 0 || idx === base.length - 1) return '';
    const project = base.slice(idx + 1).trim();
    return project;
}

async function getAuthFileDetails(item) {
    const name = getAuthFileName(item);
    if (!name) return null;
    if (authFileDetailsCache.has(name)) return authFileDetailsCache.get(name);
    try {
        const json = await configManager.downloadAuthFileJson(name, { timeoutMs: 30000 });
        authFileDetailsCache.set(name, json);
        return json;
    } catch (e) {
        console.warn('downloadAuthFileJson failed:', name, e);
        authFileDetailsCache.set(name, null);
        return null;
    }
}

async function resolveProjectId(item) {
    const fromFields = getProjectId(item);
    if (fromFields) return fromFields;
    const fromAccount = parseProjectIdFromAccountString(item);
    if (fromAccount) return fromAccount;
    const fromName = parseProjectIdFromFilename(item);
    if (fromName) return fromName;
    const details = await getAuthFileDetails(item);
    const fromDetails = String(details?.project_id ?? details?.projectId ?? '').trim();
    return fromDetails;
}

async function resolveAccountId(item) {
    const fromFields = getAccountId(item);
    if (fromFields) return fromFields;
    const details = await getAuthFileDetails(item);
    const fromDetails = String(details?.account_id ?? details?.accountId ?? '').trim();
    return fromDetails;
}

function normalizeAuthStatusList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.files)) return raw.files;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.auths)) return raw.auths;
    if (Array.isArray(raw.data)) return raw.data;
    if (raw.status && Array.isArray(raw.status)) return raw.status;
    return [];
}

function normalizeApiCallResponse(raw) {
    const statusCode = Number(raw?.status_code ?? raw?.statusCode ?? 0);
    const headers = raw?.header ?? raw?.headers ?? {};
    const err = raw?.error ?? raw?.message ?? '';

    let body = raw?.body;
    let bodyText = '';

    if (typeof body === 'string') {
        bodyText = body;
        try { body = JSON.parse(body); } catch (_) { }
    } else if (body && typeof body === 'object') {
        try { bodyText = JSON.stringify(body); } catch (_) { bodyText = ''; }
    } else if (typeof raw?.bodyText === 'string') {
        bodyText = raw.bodyText;
    }

    return { statusCode, headers, body, bodyText, error: err };
}

function escapeHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderEmpty(container, title, subtitle) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-text">${escapeHtml(title)}</div>
            <div class="empty-state-subtitle">${escapeHtml(subtitle)}</div>
        </div>
    `;
}

function renderError(container, title, message) {
    container.innerHTML = `
        <div class="error-state">
            <div class="error-state-icon">⚠️</div>
            <div class="error-state-text">${escapeHtml(title)}</div>
            <div class="error-state-subtitle">${escapeHtml(message)}</div>
        </div>
    `;
}

function setLastUpdated() {
    if (!quotaLastUpdatedEl) return;
    const now = new Date();
    quotaLastUpdatedEl.textContent = `最后更新：${now.toLocaleString()}`;
}

function renderAuthStatus(list) {
    if (!quotaAuthStatusEl) return;
    if (!list || list.length === 0) {
        renderEmpty(quotaAuthStatusEl, '暂无认证信息', '请先配置并上传认证文件，然后刷新认证状态');
        return;
    }

    const rows = list.map(item => {
        const provider = getProvider(item) || '-';
        const authIndex = getAuthIndex(item);
        const label = getLabel(item) || '-';
        const projectId = getProjectId(item) || parseProjectIdFromAccountString(item) || parseProjectIdFromFilename(item) || '-';
        const accountId = getAccountId(item) || '-';
        const status = String(item?.status ?? item?.state ?? (item?.disabled ? 'disabled' : '') ?? '').trim() || '-';

        const canCodex = /codex|chatgpt/i.test(provider);
        const canGemini = /gemini/i.test(provider) && /cli/i.test(provider);
        const canAnti = /antigravity/i.test(provider);

        const btns = [
            canCodex ? `<button class="quota-mini-btn" data-action="codex" data-auth="${authIndex ?? ''}">查询 Codex</button>` : '',
            canGemini ? `<button class="quota-mini-btn" data-action="gemini" data-auth="${authIndex ?? ''}">查询 Gemini</button>` : '',
            canAnti ? `<button class="quota-mini-btn" data-action="antigravity" data-auth="${authIndex ?? ''}">查询 Antigravity</button>` : '',
        ].filter(Boolean).join('');

        return `
            <div class="quota-row" data-auth="${authIndex ?? ''}">
                <div class="quota-col quota-provider">${escapeHtml(provider)}</div>
                <div class="quota-col quota-index">${authIndex ?? '-'}</div>
                <div class="quota-col quota-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
                <div class="quota-col quota-meta" title="${escapeHtml(projectId)}">${escapeHtml(projectId)}</div>
                <div class="quota-col quota-meta" title="${escapeHtml(accountId)}">${escapeHtml(accountId)}</div>
                <div class="quota-col quota-status">${escapeHtml(status)}</div>
                <div class="quota-col quota-actions">${btns || '<span class="quota-muted">不支持</span>'}</div>
            </div>
        `;
    }).join('');

    quotaAuthStatusEl.innerHTML = `
        <div class="quota-table">
            <div class="quota-row quota-head">
                <div class="quota-col quota-provider">提供商</div>
                <div class="quota-col quota-index">索引</div>
                <div class="quota-col quota-label">标识</div>
                <div class="quota-col quota-meta">Project</div>
                <div class="quota-col quota-meta">Account</div>
                <div class="quota-col quota-status">状态</div>
                <div class="quota-col quota-actions">操作</div>
            </div>
            ${rows}
        </div>
    `;

    quotaAuthStatusEl.querySelectorAll('.quota-mini-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-action');
            const idx = String(btn.getAttribute('data-auth') || '').trim();
            if (!idx) return;

            const item = authStatusList.find(x => getAuthIndex(x) === idx);
            if (!item) return;

            btn.disabled = true;
            const oldText = btn.textContent;
            btn.textContent = '查询中...';
            try {
                if (action === 'codex') {
                    await fetchCodexQuota(item);
                } else if (action === 'gemini') {
                    await fetchGeminiQuota(item);
                } else if (action === 'antigravity') {
                    await fetchAntigravityModels(item);
                }
                setLastUpdated();
            } catch (e) {
                console.error('Quota action failed:', e);
                showError(`查询失败：${e?.message || String(e)}`);
            } finally {
                btn.disabled = false;
                btn.textContent = oldText;
            }
        });
    });
}

function renderJsonBlock(title, obj) {
    const body = obj == null ? '' : escapeHtml(JSON.stringify(obj, null, 2));
    return `
        <div class="quota-json">
            <div class="quota-json-title">${escapeHtml(title)}</div>
            <pre class="quota-json-pre">${body}</pre>
        </div>
    `;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatResetTime(value) {
    if (!value) return '-';
    let date = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        // CPA codex usage uses unix seconds
        date = new Date(value * 1000);
    } else if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return '-';
        const num = Number(s);
        if (Number.isFinite(num) && s.length >= 9) {
            date = new Date(num * 1000);
        } else {
            const d = new Date(s);
            if (!Number.isNaN(d.getTime())) date = d;
        }
    } else if (value instanceof Date) {
        date = value;
    }

    if (!date || Number.isNaN(date.getTime())) return '-';
    return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function clampPercent(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function parseCodexUsage(body) {
    if (!body) return null;
    const planTypeRaw = String(body?.plan_type ?? body?.planType ?? '').trim();
    const planType = planTypeRaw ? (planTypeRaw[0].toUpperCase() + planTypeRaw.slice(1)) : '';

    const windows = [];
    const rate = body?.rate_limit ?? body?.rateLimit ?? {};
    const code = body?.code_review_rate_limit ?? body?.codeReviewRateLimit ?? {};

    const primary = rate?.primary_window ?? rate?.primaryWindow;
    const secondary = rate?.secondary_window ?? rate?.secondaryWindow;
    const codePrimary = code?.primary_window ?? code?.primaryWindow;

    if (primary) {
        const used = clampPercent(primary?.used_percent ?? primary?.usedPercent);
        const resetAt = primary?.reset_at ?? primary?.resetAt;
        windows.push({
            key: 'primary',
            label: '5 小时限额',
            usedPercent: used,
            remainingPercent: used == null ? null : 100 - used,
            resetAt
        });
    }
    if (secondary) {
        const used = clampPercent(secondary?.used_percent ?? secondary?.usedPercent);
        const resetAt = secondary?.reset_at ?? secondary?.resetAt;
        windows.push({
            key: 'secondary',
            label: '周限额',
            usedPercent: used,
            remainingPercent: used == null ? null : 100 - used,
            resetAt
        });
    }
    if (codePrimary) {
        const used = clampPercent(codePrimary?.used_percent ?? codePrimary?.usedPercent);
        const resetAt = codePrimary?.reset_at ?? codePrimary?.resetAt;
        windows.push({
            key: 'code_review',
            label: '代码审查周限额',
            usedPercent: used,
            remainingPercent: used == null ? null : 100 - used,
            resetAt
        });
    }

    return { planType, windows };
}

function parseGeminiQuota(body) {
    if (!body) return null;
    const buckets = Array.isArray(body?.buckets) ? body.buckets : [];
    return {
        buckets: buckets.map(b => ({
            modelId: String(b?.modelId ?? b?.model_id ?? '').trim(),
            tokenType: String(b?.tokenType ?? b?.token_type ?? '').trim(),
            remainingFraction: typeof b?.remainingFraction === 'number' ? b.remainingFraction : (typeof b?.remaining_fraction === 'number' ? b.remaining_fraction : null),
            remainingAmount: b?.remainingAmount ?? b?.remaining_amount ?? null,
            resetTime: b?.resetTime ?? b?.reset_time ?? null,
        }))
    };
}

function parseAntigravityQuota(body) {
    if (!body) return null;
    const models = body?.models && typeof body.models === 'object' ? body.models : null;
    if (!models) return null;

    const sorts = Array.isArray(body?.agentModelSorts) ? body.agentModelSorts : [];
    const groups = [];
    const opts = arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : {};
    const scope = String(opts.scope || 'recommended').toLowerCase(); // recommended | all

    const pushGroupByIds = (title, ids, limit = 16) => {
        const items = [];
        for (const id of ids) {
            const m = models[id];
            if (!m) continue;
            const q = m?.quotaInfo ?? {};
            items.push({
                id,
                displayName: String(m?.displayName ?? id).trim(),
                remainingFraction: typeof q?.remainingFraction === 'number' ? q.remainingFraction : null,
                resetTime: q?.resetTime ?? null,
                recommended: !!m?.recommended,
            });
        }
        if (items.length) groups.push({ title, items: items.slice(0, limit) });
    };

    // Prefer recommended groups from CPAMC
    if (scope !== 'all') {
        for (const sort of sorts) {
            const sortName = String(sort?.displayName ?? '').trim();
            const sortGroups = Array.isArray(sort?.groups) ? sort.groups : [];
            for (const g of sortGroups) {
                const ids = Array.isArray(g?.modelIds) ? g.modelIds : [];
                if (ids.length === 0) continue;
                const items = [];
                for (const id of ids) {
                    const m = models[id];
                    if (!m) continue;
                    const q = m?.quotaInfo ?? {};
                    items.push({
                        id,
                        displayName: String(m?.displayName ?? id).trim(),
                        remainingFraction: typeof q?.remainingFraction === 'number' ? q.remainingFraction : null,
                        resetTime: q?.resetTime ?? null,
                        recommended: !!m?.recommended,
                    });
                }
                if (items.length) {
                    groups.push({ title: sortName || 'Recommended', items });
                }
            }
            if (groups.length) break;
        }

        // Ensure image generation models are visible in "recommended" scope.
        const imageIds = Array.isArray(body?.imageGenerationModelIds) ? body.imageGenerationModelIds : [];
        if (imageIds.length) {
            const already = new Set();
            for (const g of groups) {
                for (const it of (g?.items || [])) already.add(it.id);
            }
            const extra = imageIds.filter(id => !already.has(id));
            if (extra.length) pushGroupByIds('图像生成', extra, 12);
        }
    }

    // "all" scope: show all models with quotaInfo (still trimmed per-card in renderer).
    if (scope === 'all') {
        const items = [];
        for (const [id, m] of Object.entries(models)) {
            const q = m?.quotaInfo ?? {};
            if (q?.remainingFraction == null) continue;
            items.push({
                id,
                displayName: String(m?.displayName ?? id).trim(),
                remainingFraction: typeof q?.remainingFraction === 'number' ? q.remainingFraction : null,
                resetTime: q?.resetTime ?? null,
                recommended: !!m?.recommended,
            });
        }
        items.sort((a, b) => {
            const r = Number(b.recommended) - Number(a.recommended);
            if (r !== 0) return r;
            return String(a.displayName).localeCompare(String(b.displayName));
        });
        groups.push({ title: '全部模型', items });
    }

    return { groups };
}

function renderProviderControls(providerKey, count) {
    return `
        <div class="quota-provider-controls">
            <div class="quota-provider-count">${escapeHtml(String(count))}</div>
            <div class="quota-provider-actions">
                <button class="quota-view-btn" data-provider="${escapeHtml(providerKey)}" data-mode="paged" type="button">按页显示</button>
                <button class="quota-view-btn" data-provider="${escapeHtml(providerKey)}" data-mode="all" type="button">显示全部</button>
                <button class="quota-icon-btn" data-provider-refresh="${escapeHtml(providerKey)}" type="button" title="刷新">⟳</button>
            </div>
        </div>
    `;
}

const quotaUiState = {
    codex: { mode: 'paged', page: 1, pageSize: 3, view: 'pretty' }, // pretty | json
    gemini: { mode: 'paged', page: 1, pageSize: 3, view: 'pretty' }, // pretty | json
    antigravity: { mode: 'paged', page: 1, pageSize: 3, view: 'models' }, // models | management | json
};

function toggleSimpleJsonView(providerKey) {
    const state = quotaUiState[providerKey];
    if (!state) return;
    state.view = state.view === 'json' ? 'pretty' : 'json';
}

function getSimpleViewLabel(view) {
    return view === 'json' ? 'JSON' : '卡片';
}

function cycleAntigravityView() {
    const order = ['models', 'management', 'json'];
    const cur = quotaUiState.antigravity.view || 'models';
    const idx = order.indexOf(cur);
    quotaUiState.antigravity.view = order[(idx + 1) % order.length];
}

function toggleAntigravityScope() {
    const cur = String(quotaUiState.antigravity.scope || 'recommended');
    quotaUiState.antigravity.scope = cur === 'all' ? 'recommended' : 'all';
}

function getAntigravityScopeLabel(scope) {
    return String(scope || 'recommended') === 'all' ? '全部' : '推荐';
}

function getAntigravityViewLabel(view) {
    if (view === 'management') return '管理';
    if (view === 'json') return 'JSON';
    return '模型';
}

const ANTIGRAVITY_MANAGEMENT_GROUPS = [
    {
        label: 'Claude/GPT',
        identifiers: [
            'claude-sonnet-4-5',
            'claude-sonnet-4-5-thinking',
            'claude-opus-4-5-thinking',
            'gpt-oss-120b-medium',
        ],
    },
    {
        label: 'Gemini 3 Pro',
        identifiers: [
            'gemini-3-pro-high',
            'gemini-3-pro-low',
            'gemini-3-pro-preview',
            'gemini-3-pro',
        ],
    },
    { label: 'Gemini 2.5 Flash', identifiers: ['gemini-2.5-flash', 'gemini-2.5-flash-preview'] },
    { label: 'Gemini 2.5 Flash Lite', identifiers: ['gemini-2.5-flash-lite', 'gemini-2.5-flash-lite-preview'] },
    { label: 'Gemini 3 Flash', identifiers: ['gemini-3-flash', 'gemini-3-flash-preview'] },
    { label: 'Gemini 3 Pro Image', identifiers: ['gemini-3-pro-image', 'gemini-3-pro-image-preview'] },
];

function normalizeToObject(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (_) { return null; }
    }
    return null;
}

async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return false;
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (_) {
        // fall through
    }

    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (_) {
        return false;
    }
}

function aggregateAntigravityGroup(raw, group) {
    const obj = normalizeToObject(raw);
    const models = obj?.models && typeof obj.models === 'object' ? obj.models : null;
    if (!models) return null;

    let remaining = null; // min remainingFraction across identifiers
    let earliestReset = null; // earliest reset time

    for (const id of group.identifiers) {
        const m = models[id];
        if (!m) continue;
        const q = m?.quotaInfo ?? {};
        const rf = typeof q?.remainingFraction === 'number' ? q.remainingFraction : null;
        if (rf != null) {
            remaining = remaining == null ? rf : Math.min(remaining, rf);
        }
        const rt = q?.resetTime ?? null;
        if (rt) {
            const d = new Date(rt);
            if (!Number.isNaN(d.getTime())) {
                earliestReset = earliestReset == null ? d : (d < earliestReset ? d : earliestReset);
            }
        }
    }

    if (remaining == null) return null;
    return { label: group.label, remainingFraction: remaining, resetTime: earliestReset ? earliestReset.toISOString() : null };
}

function getPagedEntries(map, state) {
    const entries = Array.from(map.entries());
    if (state.mode === 'all') return { entries, pageCount: 1 };
    const size = Math.max(1, Number(state.pageSize) || 3);
    const pageCount = Math.max(1, Math.ceil(entries.length / size));
    const page = Math.max(1, Math.min(pageCount, Number(state.page) || 1));
    state.page = page;
    const start = (page - 1) * size;
    return { entries: entries.slice(start, start + size), pageCount };
}

function renderPager(providerKey, state, pageCount) {
    if (state.mode === 'all' || pageCount <= 1) return '';
    return `
        <div class="quota-pager">
            <button class="quota-pager-btn" type="button" data-pager="${escapeHtml(providerKey)}" data-dir="-1" ${state.page <= 1 ? 'disabled' : ''}>上一页</button>
            <div class="quota-pager-info">${escapeHtml(String(state.page))} / ${escapeHtml(String(pageCount))}</div>
            <button class="quota-pager-btn" type="button" data-pager="${escapeHtml(providerKey)}" data-dir="1" ${state.page >= pageCount ? 'disabled' : ''}>下一页</button>
        </div>
    `;
}

async function refreshProvider(providerKey) {
    const items = authStatusList.slice();
    for (const item of items) {
        const provider = getProvider(item);
        try {
            if (providerKey === 'codex' && /codex|chatgpt/i.test(provider)) {
                await fetchCodexQuota(item);
            } else if (providerKey === 'gemini' && /gemini/i.test(provider) && /cli/i.test(provider)) {
                await fetchGeminiQuota(item);
            } else if (providerKey === 'antigravity' && /antigravity/i.test(provider)) {
                await fetchAntigravityModels(item);
            }
        } catch (e) {
            console.warn('refreshProvider failed:', providerKey, e);
        }
    }
    setLastUpdated();
}

function renderCodex() {
    if (!quotaCodexEl) return;
    if (quotaState.codex.size === 0) {
        renderEmpty(quotaCodexEl, '暂无 Codex 配额数据', '点击“刷新配额”或在认证状态中点击“查询 Codex”');
        return;
    }

    const ui = quotaUiState.codex;
    const { entries, pageCount } = getPagedEntries(quotaState.codex, ui);
    const view = ui.view || 'pretty';
    const viewLabel = getSimpleViewLabel(view);

    const cards = entries.map(([k, v]) => {
        if (v && typeof v === 'object' && v.error) {
            return `
                <div class="quota-card quota-card-error">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-codex">Codex</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                    </div>
                    <div class="quota-card-error-text">${escapeHtml(String(v.error))}</div>
                </div>
            `;
        }

        const raw = (v && typeof v === 'object' && v.raw !== undefined) ? v.raw : v;

        if (view === 'json') {
            const obj = normalizeToObject(raw) ?? raw;
            const body = escapeHtml(JSON.stringify(obj, null, 2));
            return `
                <div class="quota-card">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-codex">Codex</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                        <button class="quota-copy-btn" type="button" data-copy-json>复制</button>
                    </div>
                    <div class="quota-card-body">
                        <pre class="quota-json-pre quota-json-pre-card">${body}</pre>
                    </div>
                </div>
            `;
        }

        const parsed = (v && typeof v === 'object' && v.parsed !== undefined) ? v.parsed : (parseCodexUsage(raw) || raw);
        const planType = parsed?.planType ? String(parsed.planType) : '';
        const windows = Array.isArray(parsed?.windows) ? parsed.windows : [];

        const rows = windows.map(w => {
            const pct = w?.remainingPercent == null ? null : clampPercent(w.remainingPercent);
            const pctLabel = pct == null ? '--' : `${pct}%`;
            const resetLabel = formatResetTime(w?.resetAt);
            const width = pct == null ? 0 : pct;
            return `
                <div class="quota-metric">
                    <div class="quota-metric-label">${escapeHtml(w?.label || '-')}</div>
                    <div class="quota-metric-meta">
                        <span class="quota-metric-percent">${escapeHtml(pctLabel)}</span>
                        <span class="quota-metric-reset">${escapeHtml(resetLabel)}</span>
                    </div>
                    <div class="quota-progress">
                        <div class="quota-progress-fill" style="width:${width}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="quota-card">
                <div class="quota-card-header">
                    <span class="quota-badge quota-badge-codex">Codex</span>
                    <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                </div>
                <div class="quota-card-sub">
                    <span class="quota-card-sub-label">套餐</span>
                    <span class="quota-card-sub-value">${escapeHtml(planType || '-')}</span>
                </div>
                <div class="quota-card-body">
                    ${rows || `<div class="quota-muted">暂无额度窗口信息</div>`}
                </div>
            </div>
        `;
    }).join('');

    quotaCodexEl.innerHTML = `
        <div class="quota-provider-controls">
            <div class="quota-provider-count">${escapeHtml(String(quotaState.codex.size))}</div>
            <div class="quota-provider-actions">
                <button class="quota-view-btn" data-provider="codex" data-mode="paged" type="button">按页显示</button>
                <button class="quota-view-btn" data-provider="codex" data-mode="all" type="button">显示全部</button>
                <button class="quota-view-btn quota-antiview-toggle" data-codexview-toggle type="button">视图：${escapeHtml(viewLabel)}</button>
                <button class="quota-icon-btn" data-provider-refresh="codex" type="button" title="刷新">⟳</button>
            </div>
        </div>
        <div class="quota-cards">${cards}</div>
        ${renderPager('codex', ui, pageCount)}
    `;

    // Wire controls
    quotaCodexEl.querySelectorAll('.quota-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            if (!mode) return;
            quotaUiState.codex.mode = mode;
            quotaUiState.codex.page = 1;
            renderCodex();
        });
    });
    const viewToggle = quotaCodexEl.querySelector('[data-codexview-toggle]');
    viewToggle && viewToggle.addEventListener('click', () => {
        toggleSimpleJsonView('codex');
        renderCodex();
    });
    const refreshBtn = quotaCodexEl.querySelector('[data-provider-refresh="codex"]');
    refreshBtn && refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        try { await refreshProvider('codex'); } finally { refreshBtn.disabled = false; }
    });
    quotaCodexEl.querySelectorAll('[data-copy-json]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.quota-card');
            const pre = card ? card.querySelector('.quota-json-pre-card') : null;
            const text = pre ? pre.textContent : '';
            btn.disabled = true;
            const old = btn.textContent;
            btn.textContent = '复制中...';
            try {
                const ok = await copyTextToClipboard(text);
                if (ok) {
                    if (typeof showSuccessMessage === 'function') showSuccessMessage('已复制');
                } else {
                    throw new Error('复制失败');
                }
            } catch (e) {
                if (typeof showError === 'function') showError(`复制失败：${e?.message || String(e)}`);
            } finally {
                btn.disabled = false;
                btn.textContent = old;
            }
        });
    });
    quotaCodexEl.querySelectorAll('[data-pager="codex"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = Number(btn.getAttribute('data-dir'));
            quotaUiState.codex.page = Math.max(1, quotaUiState.codex.page + (Number.isFinite(dir) ? dir : 0));
            renderCodex();
        });
    });
}

function renderGemini() {
    if (!quotaGeminiEl) return;
    if (quotaState.gemini.size === 0) {
        renderEmpty(quotaGeminiEl, '暂无 Gemini 配额数据', '点击“刷新配额”或在认证状态中点击“查询 Gemini”');
        return;
    }

    const ui = quotaUiState.gemini;
    const { entries, pageCount } = getPagedEntries(quotaState.gemini, ui);
    const view = ui.view || 'pretty';
    const viewLabel = getSimpleViewLabel(view);

    const cards = entries.map(([k, v]) => {
        if (v && typeof v === 'object' && v.error) {
            return `
                <div class="quota-card quota-card-error">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-gemini">Gemini</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                    </div>
                    <div class="quota-card-error-text">${escapeHtml(String(v.error))}</div>
                </div>
            `;
        }

        const raw = (v && typeof v === 'object' && v.raw !== undefined) ? v.raw : v;

        if (view === 'json') {
            const obj = normalizeToObject(raw) ?? raw;
            const body = escapeHtml(JSON.stringify(obj, null, 2));
            return `
                <div class="quota-card">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-gemini">Gemini</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                        <button class="quota-copy-btn" type="button" data-copy-json>复制</button>
                    </div>
                    <div class="quota-card-body">
                        <pre class="quota-json-pre quota-json-pre-card">${body}</pre>
                    </div>
                </div>
            `;
        }

        const parsed = (v && typeof v === 'object' && v.parsed !== undefined) ? v.parsed : (parseGeminiQuota(raw) || raw);
        const buckets = Array.isArray(parsed?.buckets) ? parsed.buckets : [];

        const rows = buckets.map(b => {
            const pct = b?.remainingFraction == null ? null : clampPercent(b.remainingFraction * 100);
            const pctLabel = pct == null ? '--' : `${pct}%`;
            const resetLabel = formatResetTime(b?.resetTime);
            const title = b?.tokenType ? `${b.modelId} (${b.tokenType})` : b.modelId;
            const width = pct == null ? 0 : pct;
            return `
                <div class="quota-metric">
                    <div class="quota-metric-label" title="${escapeHtml(title || '')}">${escapeHtml(b.modelId || '-')}</div>
                    <div class="quota-metric-meta">
                        <span class="quota-metric-percent">${escapeHtml(pctLabel)}</span>
                        <span class="quota-metric-reset">${escapeHtml(resetLabel)}</span>
                    </div>
                    <div class="quota-progress">
                        <div class="quota-progress-fill" style="width:${width}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="quota-card">
                <div class="quota-card-header">
                    <span class="quota-badge quota-badge-gemini">Gemini</span>
                    <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                </div>
                <div class="quota-card-body">
                    ${rows || `<div class="quota-muted">暂无配额桶信息</div>`}
                </div>
            </div>
        `;
    }).join('');

    quotaGeminiEl.innerHTML = `
        <div class="quota-provider-controls">
            <div class="quota-provider-count">${escapeHtml(String(quotaState.gemini.size))}</div>
            <div class="quota-provider-actions">
                <button class="quota-view-btn" data-provider="gemini" data-mode="paged" type="button">按页显示</button>
                <button class="quota-view-btn" data-provider="gemini" data-mode="all" type="button">显示全部</button>
                <button class="quota-view-btn quota-antiview-toggle" data-geminiview-toggle type="button">视图：${escapeHtml(viewLabel)}</button>
                <button class="quota-icon-btn" data-provider-refresh="gemini" type="button" title="刷新">⟳</button>
            </div>
        </div>
        <div class="quota-cards">${cards}</div>
        ${renderPager('gemini', ui, pageCount)}
    `;

    quotaGeminiEl.querySelectorAll('.quota-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            if (!mode) return;
            quotaUiState.gemini.mode = mode;
            quotaUiState.gemini.page = 1;
            renderGemini();
        });
    });
    const viewToggle = quotaGeminiEl.querySelector('[data-geminiview-toggle]');
    viewToggle && viewToggle.addEventListener('click', () => {
        toggleSimpleJsonView('gemini');
        renderGemini();
    });
    const refreshBtn = quotaGeminiEl.querySelector('[data-provider-refresh="gemini"]');
    refreshBtn && refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        try { await refreshProvider('gemini'); } finally { refreshBtn.disabled = false; }
    });
    quotaGeminiEl.querySelectorAll('[data-copy-json]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.quota-card');
            const pre = card ? card.querySelector('.quota-json-pre-card') : null;
            const text = pre ? pre.textContent : '';
            btn.disabled = true;
            const old = btn.textContent;
            btn.textContent = '复制中...';
            try {
                const ok = await copyTextToClipboard(text);
                if (ok) {
                    if (typeof showSuccessMessage === 'function') showSuccessMessage('已复制');
                } else {
                    throw new Error('复制失败');
                }
            } catch (e) {
                if (typeof showError === 'function') showError(`复制失败：${e?.message || String(e)}`);
            } finally {
                btn.disabled = false;
                btn.textContent = old;
            }
        });
    });
    quotaGeminiEl.querySelectorAll('[data-pager="gemini"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = Number(btn.getAttribute('data-dir'));
            quotaUiState.gemini.page = Math.max(1, quotaUiState.gemini.page + (Number.isFinite(dir) ? dir : 0));
            renderGemini();
        });
    });
}

function renderAntigravity() {
    if (!quotaAntigravityEl) return;
    if (quotaState.antigravity.size === 0) {
        renderEmpty(quotaAntigravityEl, '暂无 Antigravity 数据', '点击“刷新配额”或在认证状态中点击“查询 Antigravity”');
        return;
    }
    const ui = quotaUiState.antigravity;
    const { entries, pageCount } = getPagedEntries(quotaState.antigravity, ui);
    const view = ui.view || 'models';
    const viewLabel = getAntigravityViewLabel(view);
    const scope = ui.scope || 'recommended';
    const scopeLabel = getAntigravityScopeLabel(scope);

    const cards = entries.map(([k, v]) => {
        if (v && typeof v === 'object' && v.error) {
            return `
                <div class="quota-card quota-card-error">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-antigravity">Antigravity</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                    </div>
                    <div class="quota-card-error-text">${escapeHtml(String(v.error))}</div>
                </div>
            `;
        }

        const raw = (v && typeof v === 'object' && v.raw !== undefined) ? v.raw : v;

        if (view === 'json') {
            const obj = normalizeToObject(raw) ?? raw;
            const body = escapeHtml(JSON.stringify(obj, null, 2));
            return `
                <div class="quota-card">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-antigravity">Antigravity</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                        <button class="quota-copy-btn" type="button" data-copy-json>复制</button>
                    </div>
                    <div class="quota-card-body">
                        <pre class="quota-json-pre quota-json-pre-card">${body}</pre>
                    </div>
                </div>
            `;
        }

        if (view === 'management') {
            const lines = ANTIGRAVITY_MANAGEMENT_GROUPS.map(g => aggregateAntigravityGroup(raw, g)).filter(Boolean);
            const rows = lines.map(line => {
                const pct = line?.remainingFraction == null ? null : clampPercent(line.remainingFraction * 100);
                const pctLabel = pct == null ? '--' : `${pct}%`;
                const resetLabel = formatResetTime(line?.resetTime);
                const width = pct == null ? 0 : pct;
                return `
                    <div class="quota-metric">
                        <div class="quota-metric-label">${escapeHtml(line.label || '-')}</div>
                        <div class="quota-metric-meta">
                            <span class="quota-metric-percent">${escapeHtml(pctLabel)}</span>
                            <span class="quota-metric-reset">${escapeHtml(resetLabel)}</span>
                        </div>
                        <div class="quota-progress">
                            <div class="quota-progress-fill" style="width:${width}%"></div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="quota-card">
                    <div class="quota-card-header">
                        <span class="quota-badge quota-badge-antigravity">Antigravity</span>
                        <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                    </div>
                    <div class="quota-card-body">
                        ${rows || `<div class="quota-muted">暂无额度信息</div>`}
                    </div>
                </div>
            `;
        }

        const parsed = (parseAntigravityQuota(raw, { scope }) || raw);
        const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];

        const bodyHtml = groups.map(g => {
            const title = String(g?.title ?? '').trim();
            const items = Array.isArray(g?.items) ? g.items : [];
            const rows = items.slice(0, 16).map(m => {
                const pct = m?.remainingFraction == null ? null : clampPercent(m.remainingFraction * 100);
                const pctLabel = pct == null ? '--' : `${pct}%`;
                const resetLabel = formatResetTime(m?.resetTime);
                const width = pct == null ? 0 : pct;
                return `
                    <div class="quota-metric">
                        <div class="quota-metric-label" title="${escapeHtml(m.displayName || m.id)}">${escapeHtml(m.displayName || m.id)}</div>
                        <div class="quota-metric-meta">
                            <span class="quota-metric-percent">${escapeHtml(pctLabel)}</span>
                            <span class="quota-metric-reset">${escapeHtml(resetLabel)}</span>
                        </div>
                        <div class="quota-progress">
                            <div class="quota-progress-fill" style="width:${width}%"></div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                ${title ? `<div class="quota-card-section-title">${escapeHtml(title)}</div>` : ''}
                <div class="quota-card-body">${rows || `<div class="quota-muted">暂无模型额度信息</div>`}</div>
            `;
        }).join('');

        return `
            <div class="quota-card">
                <div class="quota-card-header">
                    <span class="quota-badge quota-badge-antigravity">Antigravity</span>
                    <div class="quota-card-title" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                </div>
                ${bodyHtml || `<div class="quota-muted">暂无模型额度信息</div>`}
            </div>
        `;
    }).join('');

    quotaAntigravityEl.innerHTML = `
        <div class="quota-provider-controls">
            <div class="quota-provider-count">${escapeHtml(String(quotaState.antigravity.size))}</div>
            <div class="quota-provider-actions">
                <button class="quota-view-btn" data-provider="antigravity" data-mode="paged" type="button">按页显示</button>
                <button class="quota-view-btn" data-provider="antigravity" data-mode="all" type="button">显示全部</button>
                <button class="quota-view-btn quota-antiview-toggle" data-antiview-toggle type="button">视图：${escapeHtml(viewLabel)}</button>
                ${view === 'models' ? `<button class="quota-view-btn quota-antiview-toggle" data-antiscope-toggle type="button">范围：${escapeHtml(scopeLabel)}</button>` : ''}
                <button class="quota-icon-btn" data-provider-refresh="antigravity" type="button" title="刷新">⟳</button>
            </div>
        </div>
        <div class="quota-cards">${cards}</div>
        ${renderPager('antigravity', ui, pageCount)}
    `;

    quotaAntigravityEl.querySelectorAll('.quota-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            if (!mode) return;
            quotaUiState.antigravity.mode = mode;
            quotaUiState.antigravity.page = 1;
            renderAntigravity();
        });
    });
    const refreshBtn = quotaAntigravityEl.querySelector('[data-provider-refresh="antigravity"]');
    refreshBtn && refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        try { await refreshProvider('antigravity'); } finally { refreshBtn.disabled = false; }
    });
    const viewToggle = quotaAntigravityEl.querySelector('[data-antiview-toggle]');
    viewToggle && viewToggle.addEventListener('click', () => {
        cycleAntigravityView();
        renderAntigravity();
    });
    const scopeToggle = quotaAntigravityEl.querySelector('[data-antiscope-toggle]');
    scopeToggle && scopeToggle.addEventListener('click', () => {
        toggleAntigravityScope();
        renderAntigravity();
    });
    quotaAntigravityEl.querySelectorAll('[data-copy-json]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.quota-card');
            const pre = card ? card.querySelector('.quota-json-pre-card') : null;
            const text = pre ? pre.textContent : '';
            btn.disabled = true;
            const old = btn.textContent;
            btn.textContent = '复制中...';
            try {
                const ok = await copyTextToClipboard(text);
                if (ok) {
                    if (typeof showSuccessMessage === 'function') showSuccessMessage('已复制');
                } else {
                    throw new Error('复制失败');
                }
            } catch (e) {
                if (typeof showError === 'function') showError(`复制失败：${e?.message || String(e)}`);
            } finally {
                btn.disabled = false;
                btn.textContent = old;
            }
        });
    });
    quotaAntigravityEl.querySelectorAll('[data-pager="antigravity"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = Number(btn.getAttribute('data-dir'));
            quotaUiState.antigravity.page = Math.max(1, quotaUiState.antigravity.page + (Number.isFinite(dir) ? dir : 0));
            renderAntigravity();
        });
    });
}

function renderAllQuota() {
    renderCodex();
    renderGemini();
    renderAntigravity();
}

async function fetchApiCall(payload, timeoutMs = 30000) {
    const raw = await configManager.apiCall(payload, { timeoutMs });
    const res = normalizeApiCallResponse(raw);
    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        const msg = res.error || (res.statusCode ? `HTTP ${res.statusCode}` : 'Request failed');
        throw new Error(msg);
    }
    return res;
}

async function fetchCodexQuota(auth) {
    const authIndex = getAuthIndex(auth);
    if (!authIndex) throw new Error('缺少 authIndex');

    const accountId = await resolveAccountId(auth);
    if (!accountId) throw new Error('缺少 accountId（Chatgpt-Account-Id）');

    const payload = {
        authIndex,
        auth_index: authIndex,
        method: 'GET',
        url: CODEx_USAGE_URL,
        header: {
            ...CODEX_HEADERS,
            'Chatgpt-Account-Id': accountId,
        }
    };

    const res = await fetchApiCall(payload, 30000);
    const raw = res.body ?? res.bodyText;
    const parsed = parseCodexUsage(raw) || raw;
    quotaState.codex.set(`${getAuthFileName(auth) || getLabel(auth) || `auth#${authIndex}`}`, { raw, parsed });
    renderCodex();
}

async function fetchGeminiQuota(auth) {
    const authIndex = getAuthIndex(auth);
    if (!authIndex) throw new Error('缺少 authIndex');
    const projectId = await resolveProjectId(auth);
    if (!projectId) throw new Error('缺少 projectId');

    const payload = {
        authIndex,
        auth_index: authIndex,
        method: 'POST',
        url: GEMINI_QUOTA_URL,
        header: { ...GEMINI_HEADERS },
        data: JSON.stringify({ project: projectId }),
    };

    const res = await fetchApiCall(payload, 30000);
    const raw = res.body ?? res.bodyText;
    const parsed = parseGeminiQuota(raw) || raw;
    quotaState.gemini.set(`${getAuthFileName(auth) || getLabel(auth) || `auth#${authIndex}`}`, { raw, parsed });
    renderGemini();
}

async function fetchAntigravityModels(auth) {
    const authIndex = getAuthIndex(auth);
    if (!authIndex) throw new Error('缺少 authIndex');
    const projectId = await resolveProjectId(auth);
    if (!projectId) throw new Error('缺少 projectId');

    const data = JSON.stringify({ project: projectId });
    let lastErr = null;
    for (const url of ANTIGRAVITY_URLS) {
        try {
            const payload = {
                authIndex,
                auth_index: authIndex,
                method: 'POST',
                url,
                header: { ...ANTIGRAVITY_HEADERS },
                data,
            };
            const res = await fetchApiCall(payload, 30000);
            const raw = res.body ?? res.bodyText;
            quotaState.antigravity.set(`${getAuthFileName(auth) || getLabel(auth) || `auth#${authIndex}`}`, { raw });
            renderAntigravity();
            return;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('请求失败');
}

async function refreshAuthStatus() {
    quotaAuthStatusEl && (quotaAuthStatusEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>正在刷新认证状态...</span></div>');
    try {
        // CPA WebUI 的“配额管理”依赖 /auth-files 列表，而不是 /get-auth-status（后者用于 OAuth state 轮询）。
        const raw = await configManager.listAuthFiles();
        authStatusList = normalizeAuthStatusList(raw);
        renderAuthStatus(authStatusList);
        setLastUpdated();
    } catch (e) {
        console.error('refreshAuthStatus failed:', e);
        if (quotaAuthStatusEl) {
            renderError(
                quotaAuthStatusEl,
                '获取认证信息失败',
                e?.message || String(e)
            );
        }
        throw e;
    }
}

async function refreshAllQuota() {
    if (!authStatusList || authStatusList.length === 0) {
        await refreshAuthStatus();
    }

    quotaState = {
        codex: new Map(),
        gemini: new Map(),
        antigravity: new Map(),
    };
    renderAllQuota();

    const items = authStatusList.slice();
    let failCount = 0;
    for (const item of items) {
        const provider = getProvider(item);
        const label = getLabel(item) || getAuthFileName(item) || provider || 'auth';
        const key = label;
        try {
            if (/codex|chatgpt/i.test(provider)) {
                await fetchCodexQuota(item);
            } else if (/gemini/i.test(provider) && /cli/i.test(provider)) {
                await fetchGeminiQuota(item);
            } else if (/antigravity/i.test(provider)) {
                await fetchAntigravityModels(item);
            }
        } catch (e) {
            failCount += 1;
            const msg = e?.message || String(e);
            console.warn('Quota refresh skipped/failed:', provider, msg);
            if (/codex|chatgpt/i.test(provider)) {
                quotaState.codex.set(key, { error: msg });
                renderCodex();
            } else if (/gemini/i.test(provider) && /cli/i.test(provider)) {
                quotaState.gemini.set(key, { error: msg });
                renderGemini();
            } else if (/antigravity/i.test(provider)) {
                quotaState.antigravity.set(key, { error: msg });
                renderAntigravity();
            }
        }
    }

    if (failCount > 0) {
        showError(`部分配额刷新失败（${failCount} 项），可在控制台查看详情`);
    }
    setLastUpdated();
}

// Called by settings-tabs.js
async function loadQuotaManagement() {
    renderAuthStatus(authStatusList);
    renderAllQuota();
}

// Wire buttons
if (quotaRefreshStatusBtn) {
    quotaRefreshStatusBtn.addEventListener('click', async () => {
        quotaRefreshStatusBtn.disabled = true;
        const old = quotaRefreshStatusBtn.textContent;
        quotaRefreshStatusBtn.textContent = '刷新中...';
        try {
            await refreshAuthStatus();
        } catch (e) {
            console.error('refreshAuthStatus failed:', e);
            showError(`刷新失败：${e?.message || String(e)}`);
        } finally {
            quotaRefreshStatusBtn.disabled = false;
            quotaRefreshStatusBtn.textContent = old;
        }
    });
}

if (quotaRefreshQuotaBtn) {
    quotaRefreshQuotaBtn.addEventListener('click', async () => {
        quotaRefreshQuotaBtn.disabled = true;
        const old = quotaRefreshQuotaBtn.textContent;
        quotaRefreshQuotaBtn.textContent = '刷新中...';
        try {
            await refreshAllQuota();
        } catch (e) {
            console.error('refreshAllQuota failed:', e);
            showError(`刷新失败：${e?.message || String(e)}`);
        } finally {
            quotaRefreshQuotaBtn.disabled = false;
            quotaRefreshQuotaBtn.textContent = old;
        }
    });
}

if (actionRefreshBtn) {
    actionRefreshBtn.addEventListener('click', async () => {
        const currentTab = document.querySelector('.tab.active')?.getAttribute('data-tab');
        if (currentTab !== 'quota') return;
        actionRefreshBtn.disabled = true;
        const old = actionRefreshBtn.textContent;
        actionRefreshBtn.textContent = '刷新中...';
        try {
            await refreshAllQuota();
        } catch (e) {
            console.error('action refresh failed:', e);
            showError(`刷新失败：${e?.message || String(e)}`);
        } finally {
            actionRefreshBtn.disabled = false;
            actionRefreshBtn.textContent = old;
        }
    });
}
