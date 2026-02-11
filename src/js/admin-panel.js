/**
 * Admin Panel - Painel de Gerenciamento Completo
 * Ctrl+Shift+F9 para abrir/fechar
 *
 * Seções: Dashboard, Bans, Notificações, Dispositivos, Mods, Notícias
 */

(function () {
    'use strict';

    // ==========================================
    // Estado Global
    // ==========================================
    let isAuthenticated = false;
    let authToken = null;
    let authUsername = null;
    let panelOpen = false;
    let loginOpen = false;
    let currentSection = 'dashboard';
    let refreshInterval = null;

    // Cache de dados por seção
    const cache = {
        dashboard: null,
        bans: null,
        notifications: null,
        devices: null,
        mods: null,
        news: null
    };

    // ==========================================
    // Elementos DOM
    // ==========================================
    const loginOverlay = document.getElementById('adminLoginOverlay');
    const loginUser = document.getElementById('adminLoginUser');
    const loginPass = document.getElementById('adminLoginPass');
    const loginBtn = document.getElementById('adminLoginBtn');
    const loginError = document.getElementById('adminLoginError');
    const loginErrorMsg = document.getElementById('adminLoginErrorMsg');
    const overlay = document.getElementById('adminPanelOverlay');
    const nav = document.getElementById('adminNav');
    const closeBtn = document.getElementById('adminCloseBtn');
    const contentTitle = document.getElementById('adminContentTitle');
    const contentActions = document.getElementById('adminContentActions');
    const contentBody = document.getElementById('adminContentBody');
    const formOverlay = document.getElementById('adminFormOverlay');
    const formTitle = document.getElementById('adminFormTitle');
    const formBody = document.getElementById('adminFormBody');
    const formClose = document.getElementById('adminFormClose');
    const formCancel = document.getElementById('adminFormCancel');
    const formSave = document.getElementById('adminFormSave');
    const confirmOverlay = document.getElementById('adminConfirmOverlay');
    const confirmTitle = document.getElementById('adminConfirmTitle');
    const confirmMessage = document.getElementById('adminConfirmMessage');
    const confirmCancel = document.getElementById('adminConfirmCancel');
    const confirmOk = document.getElementById('adminConfirmOk');
    const toastContainer = document.getElementById('adminToastContainer');

    // ==========================================
    // Seções config
    // ==========================================
    const sections = {
        dashboard: { title: 'Dashboard', icon: 'bi-speedometer2' },
        bans: { title: 'Bans', icon: 'bi-slash-circle' },
        notifications: { title: 'Notificações', icon: 'bi-bell' },
        devices: { title: 'Dispositivos', icon: 'bi-pc-display' },
        mods: { title: 'Mods', icon: 'bi-puzzle' },
        news: { title: 'Notícias', icon: 'bi-newspaper' }
    };

    // ==========================================
    // API Helper
    // ==========================================
    async function apiRequest(module, action, data = {}) {
        try {
            const result = await ipcRenderer.invoke('admin-api-request', { module, action, data });
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function fetchDashboardStats() {
        try {
            return await ipcRenderer.invoke('fetch-admin-stats');
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ==========================================
    // Toast
    // ==========================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
        toast.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // Confirm Dialog
    // ==========================================
    let confirmCallback = null;

    function showConfirm(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmOverlay.classList.add('active');
    }

    confirmCancel.addEventListener('click', () => {
        confirmOverlay.classList.remove('active');
        confirmCallback = null;
    });

    confirmOk.addEventListener('click', async () => {
        confirmOverlay.classList.remove('active');
        if (confirmCallback) {
            await confirmCallback();
            confirmCallback = null;
        }
    });

    confirmOverlay.addEventListener('click', (e) => {
        if (e.target === confirmOverlay) {
            confirmOverlay.classList.remove('active');
            confirmCallback = null;
        }
    });

    // ==========================================
    // Form Modal
    // ==========================================
    let formSaveCallback = null;

    function openForm(title, icon, fields, saveCallback, existingData = null) {
        formTitle.innerHTML = `<i class="bi ${icon}"></i> <span>${title}</span>`;
        formSaveCallback = saveCallback;

        formBody.innerHTML = fields.map(field => {
            if (field.type === 'row') {
                return `<div class="admin-form-row">${field.fields.map(f => renderFormField(f, existingData)).join('')}</div>`;
            }
            return renderFormField(field, existingData);
        }).join('');

        // Registrar listeners para campos condicionais
        formBody.querySelectorAll('[data-toggle-target]').forEach(el => {
            el.addEventListener('change', () => {
                const target = el.dataset.toggleTarget;
                const value = el.dataset.toggleValue;
                const targetEl = formBody.querySelector(`[data-field-name="${target}"]`);
                if (targetEl) {
                    targetEl.classList.toggle('hidden', el.value !== value);
                }
            });
            el.dispatchEvent(new Event('change'));
        });

        formOverlay.classList.add('active');
    }

    function renderFormField(field, existingData) {
        const value = existingData ? (existingData[field.name] ?? '') : (field.default ?? '');
        const hiddenClass = field.hidden ? ' hidden' : '';
        const dataField = field.name ? ` data-field-name="${field.name}"` : '';
        let input = '';

        if (field.type === 'select') {
            const options = field.options.map(o => {
                const selected = String(value) === String(o.value) ? ' selected' : '';
                return `<option value="${o.value}"${selected}>${o.label}</option>`;
            }).join('');
            const toggleAttrs = field.toggleTarget
                ? ` data-toggle-target="${field.toggleTarget}" data-toggle-value="${field.toggleValue}"`
                : '';
            input = `<select name="${field.name}"${toggleAttrs}>${options}</select>`;
        } else if (field.type === 'textarea') {
            input = `<textarea name="${field.name}" placeholder="${field.placeholder || ''}" rows="${field.rows || 3}">${escapeHtml(String(value))}</textarea>`;
        } else if (field.type === 'checkbox') {
            const checked = value ? ' checked' : '';
            return `<div class="admin-form-group${hiddenClass}"${dataField}>
                <div class="admin-checkbox-group">
                    <input type="checkbox" name="${field.name}" id="form_${field.name}"${checked}>
                    <label for="form_${field.name}">${field.label}</label>
                </div>
            </div>`;
        } else {
            input = `<input type="${field.type || 'text'}" name="${field.name}" value="${escapeHtml(String(value))}" placeholder="${field.placeholder || ''}">`;
        }

        const hint = field.hint ? `<span class="form-hint">${field.hint}</span>` : '';

        return `<div class="admin-form-group${hiddenClass}"${dataField}>
            <label>${field.label}</label>
            ${input}
            ${hint}
        </div>`;
    }

    function getFormData() {
        const data = {};
        formBody.querySelectorAll('input, select, textarea').forEach(el => {
            if (!el.name) return;
            if (el.type === 'checkbox') {
                data[el.name] = el.checked ? 1 : 0;
            } else {
                data[el.name] = el.value;
            }
        });
        return data;
    }

    function closeForm() {
        formOverlay.classList.remove('active');
        formSaveCallback = null;
    }

    formClose.addEventListener('click', closeForm);
    formCancel.addEventListener('click', closeForm);
    formOverlay.addEventListener('click', (e) => {
        if (e.target === formOverlay) closeForm();
    });

    formSave.addEventListener('click', async () => {
        if (formSaveCallback) {
            const data = getFormData();
            await formSaveCallback(data);
        }
    });

    // ==========================================
    // Login
    // ==========================================
    function openLogin() {
        loginOpen = true;
        loginUser.value = '';
        loginPass.value = '';
        loginError.style.display = 'none';
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Entrar';
        loginOverlay.classList.add('active');
        setTimeout(() => loginUser.focus(), 100);
    }

    function closeLogin() {
        loginOpen = false;
        loginOverlay.classList.remove('active');
    }

    async function doLogin() {
        const username = loginUser.value.trim();
        const password = loginPass.value;

        if (!username || !password) {
            loginError.style.display = 'flex';
            loginErrorMsg.textContent = 'Preencha usuário e senha';
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<div class="admin-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Autenticando...';
        loginError.style.display = 'none';

        try {
            const result = await ipcRenderer.invoke('admin-auth', { username, password });

            if (result.success) {
                isAuthenticated = true;
                authToken = result.token;
                authUsername = result.username;
                closeLogin();
                openPanel();
                showToast(`Bem-vindo, ${result.username}!`);
            } else {
                loginError.style.display = 'flex';
                loginErrorMsg.textContent = result.error || 'Credenciais inválidas';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Entrar';
                loginPass.value = '';
                loginPass.focus();
            }
        } catch (err) {
            loginError.style.display = 'flex';
            loginErrorMsg.textContent = 'Erro de conexão com o servidor';
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Entrar';
        }
    }

    loginBtn.addEventListener('click', doLogin);

    // Enter para fazer login
    loginPass.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    loginUser.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginPass.focus();
    });

    // ==========================================
    // Panel Open / Close
    // ==========================================
    function openPanel() {
        panelOpen = true;
        overlay.classList.add('active');
        if (authUsername && userNameEl) {
            userNameEl.textContent = authUsername;
        }
        navigateTo('dashboard');
        startAutoRefresh();
    }

    function closePanel() {
        panelOpen = false;
        overlay.classList.remove('active');
        stopAutoRefresh();
    }

    function logout() {
        isAuthenticated = false;
        authToken = null;
        authUsername = null;
        closePanel();
        showToast('Sessão encerrada');
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshInterval = setInterval(() => {
            loadSection(currentSection, true);
        }, 30000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // Atalho Ctrl+Shift+F9
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'F9') {
            e.preventDefault();
            if (panelOpen) {
                closePanel();
            } else if (loginOpen) {
                closeLogin();
            } else if (isAuthenticated) {
                openPanel();
            } else {
                openLogin();
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (loginOpen) {
                closeLogin();
            } else if (panelOpen) {
                if (formOverlay.classList.contains('active')) {
                    closeForm();
                } else if (confirmOverlay.classList.contains('active')) {
                    confirmOverlay.classList.remove('active');
                } else {
                    closePanel();
                }
            }
        }
    });

    closeBtn.addEventListener('click', closePanel);

    // Logout
    const logoutBtn = document.getElementById('adminLogoutBtn');
    const userNameEl = document.getElementById('adminUserName');
    logoutBtn.addEventListener('click', logout);

    // ==========================================
    // Navigation
    // ==========================================
    nav.addEventListener('click', (e) => {
        const item = e.target.closest('.admin-nav-item');
        if (!item) return;
        navigateTo(item.dataset.section);
    });

    function navigateTo(section) {
        currentSection = section;
        // Atualizar nav ativa
        nav.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        // Atualizar título
        const sec = sections[section];
        contentTitle.innerHTML = `<i class="bi ${sec.icon}"></i> ${sec.title}`;
        // Limpar actions
        contentActions.innerHTML = '';
        // Carregar conteúdo
        loadSection(section);
    }

    // ==========================================
    // Carregar Seção
    // ==========================================
    async function loadSection(section, silent = false) {
        if (!silent) {
            contentBody.innerHTML = `<div class="admin-loading"><div class="admin-loading-spinner"></div><span>Carregando...</span></div>`;
        }

        switch (section) {
            case 'dashboard': await loadDashboard(); break;
            case 'bans': await loadBans(); break;
            case 'notifications': await loadNotifications(); break;
            case 'devices': await loadDevices(); break;
            case 'mods': await loadMods(); break;
            case 'news': await loadNews(); break;
        }
    }

    // ==========================================
    // Helpers
    // ==========================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copiado!');
        });
    }

    function buildSearchHeader(placeholder, onSearch, extraButtons = '') {
        contentActions.innerHTML = `
            ${extraButtons}
            <div class="admin-search">
                <i class="bi bi-search"></i>
                <input type="text" placeholder="${placeholder}" id="adminSearchInput">
            </div>
        `;

        const searchInput = document.getElementById('adminSearchInput');
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => onSearch(searchInput.value.toLowerCase()), 250);
        });
    }

    // ==========================================
    // DASHBOARD
    // ==========================================
    async function loadDashboard() {
        contentActions.innerHTML = '';

        const result = await fetchDashboardStats();
        if (!result.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${result.error || 'Erro ao carregar'}</span></div>`;
            return;
        }

        const s = result.stats;
        const currentVersion = (typeof appConfig !== 'undefined' && appConfig.version) ? appConfig.version : '1.1.7';

        let versionsHtml = '';
        if (s.sessionsByVersion && s.sessionsByVersion.length > 0) {
            versionsHtml = s.sessionsByVersion.map(v => {
                const isCurrent = v.launcher_version === currentVersion;
                const badgeClass = isCurrent ? 'admin-badge-current' : 'admin-badge-old';
                const badgeText = isCurrent ? 'Atual' : 'Antiga';
                return `<tr>
                    <td><strong>v${escapeHtml(v.launcher_version)}</strong></td>
                    <td>${v.count}</td>
                    <td><span class="admin-badge ${badgeClass}">${badgeText}</span></td>
                </tr>`;
            }).join('');
        } else {
            versionsHtml = '<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);">Sem dados</td></tr>';
        }

        contentBody.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card accent-green">
                    <span class="admin-stat-value">${s.playingNow || 0}</span>
                    <span class="admin-stat-label">Jogando Agora</span>
                    <span class="admin-stat-sub">Pelo launcher</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${s.activeSessions || 0}</span>
                    <span class="admin-stat-label">Sessões Ativas</span>
                    <span class="admin-stat-sub">Últimos 5 min</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${s.totalDevices || 0}</span>
                    <span class="admin-stat-label">Dispositivos</span>
                    <span class="admin-stat-sub">Total registrado</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${s.activeNotifications || 0}</span>
                    <span class="admin-stat-label">Notificações Ativas</span>
                    <span class="admin-stat-sub">Em andamento</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${s.notificationsSentToday || 0}</span>
                    <span class="admin-stat-label">Notificações Enviadas</span>
                    <span class="admin-stat-sub">Hoje</span>
                </div>
                <div class="admin-stat-card accent-red">
                    <span class="admin-stat-value">${s.vmsDetected || 0}</span>
                    <span class="admin-stat-label">VMs Detectadas</span>
                    <span class="admin-stat-sub">Últimas 24h</span>
                </div>
            </div>
            <div class="admin-table-container admin-versions-section">
                <div class="admin-table-title"><i class="bi bi-diagram-3"></i> Versões do Launcher (24h)</div>
                <table class="admin-table">
                    <thead><tr><th>Versão</th><th>Sessões</th><th>Status</th></tr></thead>
                    <tbody>${versionsHtml}</tbody>
                </table>
            </div>
        `;
    }

    // ==========================================
    // BANS
    // ==========================================
    let bansData = [];

    async function loadBans() {
        const addBtn = `<button class="admin-btn admin-btn-success" id="adminBansAdd"><i class="bi bi-plus-lg"></i> Novo Ban</button>`;
        buildSearchHeader('Buscar HWID, razão...', filterBans, addBtn);

        document.getElementById('adminBansAdd').addEventListener('click', () => openBanForm());

        const [listResult, statsResult] = await Promise.all([
            apiRequest('bans', 'list'),
            apiRequest('bans', 'stats')
        ]);

        if (!listResult.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${listResult.error}</span></div>`;
            return;
        }

        bansData = listResult.data || [];
        const stats = statsResult.success ? statsResult.data : {};

        renderBans(bansData, stats);
    }

    function filterBans(query) {
        if (!query) {
            renderBansTable(bansData);
            return;
        }
        const filtered = bansData.filter(b =>
            (b.hwid || '').toLowerCase().includes(query) ||
            (b.reason || '').toLowerCase().includes(query) ||
            (b.banned_by || '').toLowerCase().includes(query)
        );
        renderBansTable(filtered);
    }

    function renderBans(data, stats) {
        contentBody.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${stats.total || 0}</span>
                    <span class="admin-stat-label">Total de Bans</span>
                </div>
                <div class="admin-stat-card accent-green">
                    <span class="admin-stat-value">${stats.active || 0}</span>
                    <span class="admin-stat-label">Bans Ativos</span>
                </div>
                <div class="admin-stat-card accent-red">
                    <span class="admin-stat-value">${stats.permanent || 0}</span>
                    <span class="admin-stat-label">Permanentes</span>
                </div>
            </div>
            <div class="admin-table-container">
                <div class="admin-table-wrap">
                    <table class="admin-table" id="adminBansTable">
                        <thead>
                            <tr>
                                <th>HWID</th>
                                <th>Razão</th>
                                <th>Banido por</th>
                                <th>Tipo</th>
                                <th>Expira</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="adminBansBody"></tbody>
                    </table>
                </div>
            </div>
        `;
        renderBansTable(data);
    }

    function renderBansTable(data) {
        const tbody = document.getElementById('adminBansBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">Nenhum ban encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(b => {
            const isPermanent = !b.expires_at;
            const isExpired = !isPermanent && new Date(b.expires_at) < new Date();
            let typeBadge, expiresText;

            if (isPermanent) {
                typeBadge = '<span class="admin-badge admin-badge-permanent">Permanente</span>';
                expiresText = '-';
            } else if (isExpired) {
                typeBadge = '<span class="admin-badge admin-badge-expired">Expirado</span>';
                expiresText = formatDate(b.expires_at);
            } else {
                typeBadge = '<span class="admin-badge admin-badge-temporary">Temporário</span>';
                expiresText = formatDate(b.expires_at);
            }

            return `<tr>
                <td class="cell-mono">${escapeHtml((b.hwid || '').substring(0, 16))}... <button class="admin-copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(b.hwid)}')"><i class="bi bi-clipboard"></i></button></td>
                <td class="cell-truncate" title="${escapeHtml(b.reason)}">${escapeHtml(b.reason)}</td>
                <td>${escapeHtml(b.banned_by || 'Admin')}</td>
                <td>${typeBadge}</td>
                <td>${expiresText}</td>
                <td>${formatDate(b.created_at)}</td>
                <td class="cell-actions">
                    <button class="admin-btn admin-btn-sm admin-btn-primary" data-edit-ban="${b.id}"><i class="bi bi-pencil"></i></button>
                    <button class="admin-btn admin-btn-sm admin-btn-danger" data-delete-ban="${b.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        // Event listeners
        tbody.querySelectorAll('[data-edit-ban]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.editBan);
                const ban = bansData.find(b => b.id == id);
                if (ban) openBanForm(ban);
            });
        });
        tbody.querySelectorAll('[data-delete-ban]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.deleteBan);
                showConfirm('Remover Ban', 'Tem certeza que deseja remover este ban?', async () => {
                    const result = await apiRequest('bans', 'delete', { id });
                    if (result.success) {
                        showToast('Ban removido');
                        loadSection('bans');
                    } else {
                        showToast(result.error || 'Erro ao remover', 'error');
                    }
                });
            });
        });
    }

    function openBanForm(existing = null) {
        const title = existing ? 'Editar Ban' : 'Novo Ban';
        const icon = existing ? 'bi-pencil' : 'bi-slash-circle';
        const fields = [
            { name: 'hwid', label: 'HWID', placeholder: 'Hash do hardware ID', type: 'text' },
            { name: 'reason', label: 'Razão', placeholder: 'Motivo do ban', type: 'textarea', rows: 2 },
            { type: 'row', fields: [
                { name: 'banned_by', label: 'Banido por', placeholder: 'Admin', default: 'Admin' },
                { name: 'expires_at', label: 'Expira em (vazio = permanente)', type: 'datetime-local', hint: 'Deixe vazio para ban permanente' }
            ]}
        ];

        openForm(title, icon, fields, async (data) => {
            if (!data.hwid || !data.reason) {
                showToast('HWID e razão são obrigatórios', 'error');
                return;
            }
            const action = existing ? 'update' : 'create';
            const payload = { ...data };
            if (existing) payload.id = existing.id;
            if (!payload.expires_at) payload.expires_at = null;

            const result = await apiRequest('bans', action, payload);
            if (result.success) {
                closeForm();
                showToast(existing ? 'Ban atualizado' : 'Ban criado');
                loadSection('bans');
            } else {
                showToast(result.error || 'Erro ao salvar', 'error');
            }
        }, existing);
    }

    // ==========================================
    // NOTIFICATIONS
    // ==========================================
    let notificationsData = [];

    async function loadNotifications() {
        const addBtn = `<button class="admin-btn admin-btn-success" id="adminNotifsAdd"><i class="bi bi-plus-lg"></i> Nova Notificação</button>`;
        buildSearchHeader('Buscar título...', filterNotifications, addBtn);

        document.getElementById('adminNotifsAdd').addEventListener('click', () => openNotificationForm());

        const result = await apiRequest('notifications', 'list');
        if (!result.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${result.error}</span></div>`;
            return;
        }

        notificationsData = result.data || [];
        renderNotifications(notificationsData);
    }

    function filterNotifications(query) {
        if (!query) {
            renderNotificationsTable(notificationsData);
            return;
        }
        const filtered = notificationsData.filter(n =>
            (n.title || '').toLowerCase().includes(query) ||
            (n.body || '').toLowerCase().includes(query)
        );
        renderNotificationsTable(filtered);
    }

    function renderNotifications(data) {
        contentBody.innerHTML = `
            <div class="admin-table-container">
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Título</th>
                                <th>Corpo</th>
                                <th>Alvo</th>
                                <th>Entregas</th>
                                <th>Status</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="adminNotifsBody"></tbody>
                    </table>
                </div>
            </div>
        `;
        renderNotificationsTable(data);
    }

    function renderNotificationsTable(data) {
        const tbody = document.getElementById('adminNotifsBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">Nenhuma notificação</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(n => {
            const statusBadge = n.active == 1
                ? '<span class="admin-badge admin-badge-active">Ativa</span>'
                : '<span class="admin-badge admin-badge-inactive">Inativa</span>';

            const targetMap = { all: 'Todos', specific_hwid: 'HWIDs específicos' };
            const target = targetMap[n.target_type] || n.target_type;

            return `<tr>
                <td class="cell-truncate" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</td>
                <td class="cell-truncate" title="${escapeHtml(n.body)}">${escapeHtml(n.body)}</td>
                <td>${escapeHtml(target)}</td>
                <td>${n.delivery_count || 0}</td>
                <td>${statusBadge}</td>
                <td>${formatDate(n.created_at)}</td>
                <td class="cell-actions">
                    <button class="admin-btn admin-btn-sm admin-btn-secondary" data-toggle-notif="${n.id}" title="Ativar/Desativar"><i class="bi bi-toggle-${n.active == 1 ? 'on' : 'off'}"></i></button>
                    <button class="admin-btn admin-btn-sm admin-btn-danger" data-delete-notif="${n.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-toggle-notif]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.toggleNotif);
                const result = await apiRequest('notifications', 'toggle', { id });
                if (result.success) {
                    showToast('Status alterado');
                    loadSection('notifications');
                } else {
                    showToast(result.error || 'Erro', 'error');
                }
            });
        });

        tbody.querySelectorAll('[data-delete-notif]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.deleteNotif);
                showConfirm('Remover Notificação', 'Tem certeza? Os registros de entrega também serão removidos.', async () => {
                    const result = await apiRequest('notifications', 'delete', { id });
                    if (result.success) {
                        showToast('Notificação removida');
                        loadSection('notifications');
                    } else {
                        showToast(result.error || 'Erro ao remover', 'error');
                    }
                });
            });
        });
    }

    function openNotificationForm() {
        const fields = [
            { name: 'title', label: 'Título', placeholder: 'Título da notificação' },
            { name: 'body', label: 'Corpo', type: 'textarea', placeholder: 'Mensagem da notificação', rows: 3 },
            { type: 'row', fields: [
                { name: 'icon', label: 'Ícone (opcional)', placeholder: 'info, warning, update...' },
                { name: 'silent', label: 'Silenciosa', type: 'checkbox', default: false }
            ]},
            { type: 'row', fields: [
                { name: 'action_type', label: 'Tipo de Ação', type: 'select', default: 'none', options: [
                    { value: 'none', label: 'Nenhuma' },
                    { value: 'open_url', label: 'Abrir URL' },
                    { value: 'open_tab', label: 'Abrir Aba' }
                ]},
                { name: 'action_value', label: 'Valor da Ação', placeholder: 'URL ou identificador' }
            ]},
            { type: 'row', fields: [
                { name: 'target_type', label: 'Alvo', type: 'select', default: 'all', toggleTarget: 'target_hwids', toggleValue: 'specific_hwid', options: [
                    { value: 'all', label: 'Todos' },
                    { value: 'specific_hwid', label: 'HWIDs Específicos' }
                ]},
                { name: 'target_hwids', label: 'HWIDs (separados por vírgula)', placeholder: 'hwid1, hwid2...', hidden: true }
            ]},
            { type: 'row', fields: [
                { name: 'start_date', label: 'Data Início', type: 'datetime-local' },
                { name: 'end_date', label: 'Data Fim (opcional)', type: 'datetime-local' }
            ]}
        ];

        openForm('Nova Notificação', 'bi-bell', fields, async (data) => {
            if (!data.title || !data.body) {
                showToast('Título e corpo são obrigatórios', 'error');
                return;
            }
            const result = await apiRequest('notifications', 'create', data);
            if (result.success) {
                closeForm();
                showToast('Notificação criada');
                loadSection('notifications');
            } else {
                showToast(result.error || 'Erro ao criar', 'error');
            }
        });
    }

    // ==========================================
    // DEVICES
    // ==========================================
    let devicesData = [];
    let devicesStats = {};
    let devicesSearchActive = false;

    async function loadDevices() {
        // Busca server-side com debounce
        contentActions.innerHTML = `
            <div class="admin-search">
                <i class="bi bi-search"></i>
                <input type="text" placeholder="Buscar por nome, HWID ou IP..." id="adminDevicesSearch" style="width:240px;">
            </div>
        `;

        const searchInput = document.getElementById('adminDevicesSearch');
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();
            if (query.length === 0) {
                devicesSearchActive = false;
                renderDevicesLayout(devicesData, devicesStats);
            } else if (query.length >= 2) {
                debounceTimer = setTimeout(() => searchDevices(query), 400);
            }
        });

        // Enter para buscar imediatamente
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(debounceTimer);
                const query = searchInput.value.trim();
                if (query.length >= 2) {
                    searchDevices(query);
                }
            }
        });

        const [listResult, statsResult] = await Promise.all([
            apiRequest('devices', 'list'),
            apiRequest('devices', 'stats')
        ]);

        if (!listResult.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${listResult.error}</span></div>`;
            return;
        }

        devicesData = listResult.data || [];
        devicesStats = statsResult.success ? statsResult.data : {};
        renderDevicesLayout(devicesData, devicesStats);
    }

    async function searchDevices(query) {
        devicesSearchActive = true;

        // Mostrar loading na tabela sem limpar stats
        const tbody = document.getElementById('adminDevicesBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;"><div class="admin-loading-spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div></td></tr>`;
        }

        const result = await apiRequest('devices', 'search', { query });

        if (!devicesSearchActive) return; // Já voltou pra listagem

        if (result.success) {
            const searchInfo = document.getElementById('adminDevicesSearchInfo');
            if (searchInfo) {
                searchInfo.textContent = `${result.data.length} resultado${result.data.length !== 1 ? 's' : ''} para "${query}"`;
                searchInfo.style.display = 'block';
            }
            renderDevicesTable(result.data);
        } else {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-red);padding:20px;">${result.error || 'Erro na busca'}</td></tr>`;
            }
        }
    }

    function renderDevicesLayout(data, stats) {
        contentBody.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${stats.total || 0}</span>
                    <span class="admin-stat-label">Total de Dispositivos</span>
                </div>
                <div class="admin-stat-card accent-green">
                    <span class="admin-stat-value">${stats.active24h || 0}</span>
                    <span class="admin-stat-label">Ativos (24h)</span>
                </div>
                <div class="admin-stat-card accent-yellow">
                    <span class="admin-stat-value">${stats.vms || 0}</span>
                    <span class="admin-stat-label">VMs Detectadas</span>
                </div>
            </div>
            <div id="adminDevicesSearchInfo" style="display:none;font-family:'Roboto',sans-serif;font-size:12px;color:var(--text-secondary);margin-bottom:10px;"></div>
            <div class="admin-table-container">
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>HWID</th>
                                <th>Fabricante</th>
                                <th>VM</th>
                                <th>IP</th>
                                <th>Primeiro Acesso</th>
                                <th>Último Acesso</th>
                            </tr>
                        </thead>
                        <tbody id="adminDevicesBody"></tbody>
                    </table>
                </div>
            </div>
        `;
        const searchInfo = document.getElementById('adminDevicesSearchInfo');
        if (searchInfo) searchInfo.style.display = 'none';
        renderDevicesTable(data);
    }

    function renderDevicesTable(data) {
        const tbody = document.getElementById('adminDevicesBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">Nenhum dispositivo encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => {
            const vmBadge = d.is_vm == 1
                ? '<span class="admin-badge admin-badge-vm">VM</span>'
                : '<span class="admin-badge admin-badge-active">Real</span>';

            return `<tr>
                <td><strong>${escapeHtml(d.username || '-')}</strong></td>
                <td class="cell-mono">${escapeHtml((d.hwid || '').substring(0, 16))}... <button class="admin-copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(d.hwid || '')}')"><i class="bi bi-clipboard"></i></button></td>
                <td>${escapeHtml(d.manufacturer || '-')}</td>
                <td>${vmBadge}</td>
                <td class="cell-mono">${escapeHtml(d.ip_address || '-')} <button class="admin-copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(d.ip_address || '')}')"><i class="bi bi-clipboard"></i></button></td>
                <td>${formatDate(d.created_at)}</td>
                <td>${formatDate(d.last_seen)}</td>
            </tr>`;
        }).join('');
    }

    // ==========================================
    // MODS
    // ==========================================
    let modsData = [];

    const modCategories = [
        { value: 'cleo', label: 'CLEO' },
        { value: 'texture', label: 'Textura' },
        { value: 'vehicle', label: 'Veículo' },
        { value: 'weapon', label: 'Arma' },
        { value: 'skin', label: 'Skin' },
        { value: 'map', label: 'Mapa' },
        { value: 'hud', label: 'HUD' },
        { value: 'sound', label: 'Som' },
        { value: 'effect', label: 'Efeito' },
        { value: 'timecyc', label: 'TimeCyc' },
        { value: 'skybox', label: 'Skybox' },
        { value: 'font', label: 'Fonte' },
        { value: 'radar', label: 'Radar' },
        { value: 'tools', label: 'Ferramentas' }
    ];

    async function loadMods() {
        const addBtn = `<button class="admin-btn admin-btn-success" id="adminModsAdd"><i class="bi bi-plus-lg"></i> Novo Mod</button>`;
        buildSearchHeader('Buscar mod...', filterMods, addBtn);

        document.getElementById('adminModsAdd').addEventListener('click', () => openModForm());

        const [listResult, statsResult] = await Promise.all([
            apiRequest('mods', 'list'),
            apiRequest('mods', 'stats')
        ]);

        if (!listResult.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${listResult.error}</span></div>`;
            return;
        }

        modsData = listResult.data || [];
        const stats = statsResult.success ? statsResult.data : {};
        renderMods(modsData, stats);
    }

    function filterMods(query) {
        if (!query) {
            renderModsTable(modsData);
            return;
        }
        const filtered = modsData.filter(m =>
            (m.name || '').toLowerCase().includes(query) ||
            (m.author || '').toLowerCase().includes(query) ||
            (m.mod_id || '').toLowerCase().includes(query) ||
            (m.category || '').toLowerCase().includes(query)
        );
        renderModsTable(filtered);
    }

    function renderMods(data, stats) {
        contentBody.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${stats.total || 0}</span>
                    <span class="admin-stat-label">Total de Mods</span>
                </div>
                <div class="admin-stat-card accent-green">
                    <span class="admin-stat-value">${stats.rp || 0}</span>
                    <span class="admin-stat-label">Mods RP</span>
                </div>
                <div class="admin-stat-card accent-red">
                    <span class="admin-stat-value">${stats.dm || 0}</span>
                    <span class="admin-stat-label">Mods DM</span>
                </div>
            </div>
            <div class="admin-table-container">
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Imagem</th>
                                <th>Nome</th>
                                <th>Autor</th>
                                <th>Categoria</th>
                                <th>Jogo</th>
                                <th>Versão</th>
                                <th>Tamanho</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="adminModsBody"></tbody>
                    </table>
                </div>
            </div>
        `;
        renderModsTable(data);
    }

    function renderModsTable(data) {
        const tbody = document.getElementById('adminModsBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:30px;">Nenhum mod</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(m => {
            const img = m.image
                ? `<img src="${escapeHtml(m.image)}" class="admin-img-preview" alt="">`
                : '<span style="color:var(--text-muted);">-</span>';

            const gameBadgeClass = { rp: 'admin-badge-rp', dm: 'admin-badge-dm', dayz: 'admin-badge-dayz' }[m.game_category] || 'admin-badge-rp';
            const gameBadge = `<span class="admin-badge ${gameBadgeClass}">${(m.game_category || 'rp').toUpperCase()}</span>`;

            const statusBadge = m.active == 1
                ? '<span class="admin-badge admin-badge-active">Ativo</span>'
                : '<span class="admin-badge admin-badge-inactive">Inativo</span>';

            return `<tr>
                <td>${img}</td>
                <td title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</td>
                <td>${escapeHtml(m.author || '-')}</td>
                <td>${escapeHtml(m.category || '-')}</td>
                <td>${gameBadge}</td>
                <td>${escapeHtml(m.version || '-')}</td>
                <td>${formatSize(m.size)}</td>
                <td>${statusBadge}</td>
                <td class="cell-actions">
                    <button class="admin-btn admin-btn-sm admin-btn-primary" data-edit-mod="${m.id}"><i class="bi bi-pencil"></i></button>
                    <button class="admin-btn admin-btn-sm admin-btn-danger" data-delete-mod="${m.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-edit-mod]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.editMod);
                const mod = modsData.find(m => m.id == id);
                if (mod) openModForm(mod);
            });
        });

        tbody.querySelectorAll('[data-delete-mod]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.deleteMod);
                showConfirm('Remover Mod', 'Tem certeza que deseja remover este mod?', async () => {
                    const result = await apiRequest('mods', 'delete', { id });
                    if (result.success) {
                        showToast('Mod removido');
                        loadSection('mods');
                    } else {
                        showToast(result.error || 'Erro ao remover', 'error');
                    }
                });
            });
        });
    }

    function openModForm(existing = null) {
        const title = existing ? 'Editar Mod' : 'Novo Mod';
        const icon = existing ? 'bi-pencil' : 'bi-puzzle';

        const fields = [
            { type: 'row', fields: [
                { name: 'mod_id', label: 'Mod ID', placeholder: 'identificador-unico' },
                { name: 'name', label: 'Nome', placeholder: 'Nome do mod' }
            ]},
            { type: 'row', fields: [
                { name: 'author', label: 'Autor', placeholder: 'Autor' },
                { name: 'version', label: 'Versão', placeholder: '1.0', default: '1.0' }
            ]},
            { name: 'description', label: 'Descrição Curta', placeholder: 'Descrição breve do mod' },
            { name: 'full_description', label: 'Descrição Completa', type: 'textarea', placeholder: 'Descrição detalhada', rows: 3 },
            { type: 'row', fields: [
                { name: 'category', label: 'Categoria', type: 'select', options: modCategories },
                { name: 'game_category', label: 'Jogo', type: 'select', options: [
                    { value: 'rp', label: 'Horizonte RP' },
                    { value: 'dm', label: 'Horizonte DM' },
                    { value: 'dayz', label: 'Horizonte DayZ' }
                ]}
            ]},
            { name: 'image', label: 'URL da Imagem', placeholder: 'https://...' },
            { name: 'download_url', label: 'URL de Download', placeholder: 'https://...' },
            { type: 'row', fields: [
                { name: 'size', label: 'Tamanho (bytes)', type: 'number', placeholder: '0' },
                { name: 'order', label: 'Ordem', type: 'number', placeholder: '0', default: '0' }
            ]},
            { type: 'row', fields: [
                { name: 'popular', label: 'Popular', type: 'checkbox', default: false },
                { name: 'active', label: 'Ativo', type: 'checkbox', default: true }
            ]},
            { name: 'dependencies', label: 'Dependências (JSON)', placeholder: '[]', default: '[]', hint: 'Array JSON de mod_ids' }
        ];

        openForm(title, icon, fields, async (data) => {
            if (!data.mod_id || !data.name) {
                showToast('Mod ID e nome são obrigatórios', 'error');
                return;
            }
            const action = existing ? 'update' : 'create';
            const payload = { ...data };
            if (existing) payload.id = existing.id;

            const result = await apiRequest('mods', action, payload);
            if (result.success) {
                closeForm();
                showToast(existing ? 'Mod atualizado' : 'Mod criado');
                loadSection('mods');
            } else {
                showToast(result.error || 'Erro ao salvar', 'error');
            }
        }, existing);
    }

    // ==========================================
    // NEWS
    // ==========================================
    let newsData = [];

    async function loadNews() {
        const addBtn = `<button class="admin-btn admin-btn-success" id="adminNewsAdd"><i class="bi bi-plus-lg"></i> Nova Notícia</button>`;
        buildSearchHeader('Buscar notícia...', filterNews, addBtn);

        document.getElementById('adminNewsAdd').addEventListener('click', () => openNewsForm());

        const [listResult, statsResult] = await Promise.all([
            apiRequest('news', 'list'),
            apiRequest('news', 'stats')
        ]);

        if (!listResult.success) {
            contentBody.innerHTML = `<div class="admin-empty"><i class="bi bi-exclamation-triangle"></i><span>${listResult.error}</span></div>`;
            return;
        }

        newsData = listResult.data || [];
        const stats = statsResult.success ? statsResult.data : {};
        renderNews(newsData, stats);
    }

    function filterNews(query) {
        if (!query) {
            renderNewsTable(newsData);
            return;
        }
        const filtered = newsData.filter(n =>
            (n.title || '').toLowerCase().includes(query) ||
            (n.category || '').toLowerCase().includes(query)
        );
        renderNewsTable(filtered);
    }

    function renderNews(data, stats) {
        contentBody.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <span class="admin-stat-value">${stats.total || 0}</span>
                    <span class="admin-stat-label">Total de Notícias</span>
                </div>
                <div class="admin-stat-card accent-green">
                    <span class="admin-stat-value">${stats.rp || 0}</span>
                    <span class="admin-stat-label">Notícias RP</span>
                </div>
                <div class="admin-stat-card accent-red">
                    <span class="admin-stat-value">${stats.dm || 0}</span>
                    <span class="admin-stat-label">Notícias DM</span>
                </div>
            </div>
            <div class="admin-table-container">
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Imagem</th>
                                <th>Título</th>
                                <th>Categoria</th>
                                <th>Link</th>
                                <th>Ordem</th>
                                <th>Status</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="adminNewsBody"></tbody>
                    </table>
                </div>
            </div>
        `;
        renderNewsTable(data);
    }

    function renderNewsTable(data) {
        const tbody = document.getElementById('adminNewsBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:30px;">Nenhuma notícia</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(n => {
            const img = n.image
                ? `<img src="${escapeHtml(n.image)}" class="admin-img-preview" alt="">`
                : '<span style="color:var(--text-muted);">-</span>';

            const catBadgeClass = { rp: 'admin-badge-rp', dm: 'admin-badge-dm', dayz: 'admin-badge-dayz' }[n.category] || 'admin-badge-rp';
            const catBadge = `<span class="admin-badge ${catBadgeClass}">${(n.category || 'rp').toUpperCase()}</span>`;

            const statusBadge = n.active == 1
                ? '<span class="admin-badge admin-badge-active">Ativa</span>'
                : '<span class="admin-badge admin-badge-inactive">Inativa</span>';

            const linkText = n.link ? `<a href="#" class="cell-truncate" style="color:#667eea;text-decoration:none;" title="${escapeHtml(n.link)}">${escapeHtml(n.link.substring(0, 30))}...</a>` : '-';

            return `<tr>
                <td>${img}</td>
                <td class="cell-truncate" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</td>
                <td>${catBadge}</td>
                <td>${linkText}</td>
                <td>${n.order || 0}</td>
                <td>${statusBadge}</td>
                <td>${formatDate(n.created_at)}</td>
                <td class="cell-actions">
                    <button class="admin-btn admin-btn-sm admin-btn-primary" data-edit-news="${n.id}"><i class="bi bi-pencil"></i></button>
                    <button class="admin-btn admin-btn-sm admin-btn-danger" data-delete-news="${n.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-edit-news]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.editNews);
                const item = newsData.find(n => n.id == id);
                if (item) openNewsForm(item);
            });
        });

        tbody.querySelectorAll('[data-delete-news]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.deleteNews);
                showConfirm('Remover Notícia', 'Tem certeza que deseja remover esta notícia?', async () => {
                    const result = await apiRequest('news', 'delete', { id });
                    if (result.success) {
                        showToast('Notícia removida');
                        loadSection('news');
                    } else {
                        showToast(result.error || 'Erro ao remover', 'error');
                    }
                });
            });
        });
    }

    function openNewsForm(existing = null) {
        const title = existing ? 'Editar Notícia' : 'Nova Notícia';
        const icon = existing ? 'bi-pencil' : 'bi-newspaper';

        const fields = [
            { name: 'title', label: 'Título', placeholder: 'Título da notícia' },
            { name: 'category', label: 'Categoria', type: 'select', options: [
                { value: 'rp', label: 'Horizonte RP' },
                { value: 'dm', label: 'Horizonte DM' },
                { value: 'dayz', label: 'Horizonte DayZ' }
            ]},
            { name: 'image', label: 'URL da Imagem', placeholder: 'https://...' },
            { name: 'link', label: 'Link', placeholder: 'https://...' },
            { type: 'row', fields: [
                { name: 'order', label: 'Ordem', type: 'number', placeholder: '0', default: '0' },
                { name: 'active', label: 'Ativa', type: 'checkbox', default: true }
            ]}
        ];

        openForm(title, icon, fields, async (data) => {
            if (!data.title) {
                showToast('Título é obrigatório', 'error');
                return;
            }
            const action = existing ? 'update' : 'create';
            const payload = { ...data };
            if (existing) payload.id = existing.id;

            const result = await apiRequest('news', action, payload);
            if (result.success) {
                closeForm();
                showToast(existing ? 'Notícia atualizada' : 'Notícia criada');
                loadSection('news');
            } else {
                showToast(result.error || 'Erro ao salvar', 'error');
            }
        }, existing);
    }

})();
