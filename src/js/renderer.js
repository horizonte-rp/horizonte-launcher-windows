const { ipcRenderer, shell } = require('electron');

// Estado global
let appConfig = {};
let userConfig = {};
let selectedCategory = 'rp';
let selectedServerIndex = 0;
let selectedServerPerCategory = { rp: 0, dm: 0, dayz: 0 }; // Servidor selecionado por categoria

// Estado do jogo (para categoria selecionada)
let gameState = {
    installed: false,
    downloading: false,
    extracting: false,
    gamePath: '',
    needsUpdate: false,
    installedVersion: null,
    remoteVersion: null
};

// Estado de instalação de drivers
let isInstallingDrivers = false;

// Flag para evitar cliques múltiplos no botão Jogar
let isLaunching = false;

// Função para formatar caminho no estilo Windows 11 (> Pasta > Subpasta > Final)
function shortenPath(fullPath) {
    if (!fullPath) return 'Não configurado';

    const parts = fullPath.replace(/\//g, '\\').split('\\').filter(p => p);

    // Encontrar índice após pasta do usuário (C:\Users\NomeUsuario)
    let startIndex = 0;
    const usersIndex = parts.findIndex(p => p.toLowerCase() === 'users');
    if (usersIndex !== -1 && usersIndex + 1 < parts.length) {
        // Pular C:, Users, e NomeUsuario
        startIndex = usersIndex + 2;
    }

    // Pegar partes relevantes (após pasta do usuário)
    let relevantParts = parts.slice(startIndex);

    // Se não sobrou nada ou caminho é curto, mostrar últimas 3 partes do original
    if (relevantParts.length === 0) {
        relevantParts = parts.slice(-3);
    } else if (relevantParts.length > 3) {
        // Limitar a 3 pastas
        relevantParts = relevantParts.slice(-3);
    }

    // Formatar no estilo Windows 11: > Pasta > Subpasta
    return '> ' + relevantParts.join(' > ');
}

// Estado global de download (independente da categoria selecionada)
let globalDownloadState = {
    isDownloading: false,
    isExtracting: false,
    category: null,
    percent: 0
};

// Elementos DOM
const elements = {
    // Header
    serverTabs: document.querySelectorAll('.server-tab'),
    nickname: document.getElementById('nickname'),
    btnSettings: document.getElementById('btnSettings'),
    btnMinimize: document.getElementById('btnMinimize'),
    btnClose: document.getElementById('btnClose'),

    // Main
    serverName: document.getElementById('serverName'),
    btnSite: document.getElementById('btnSite'),
    btnDiscord: document.getElementById('btnDiscord'),

    // Footer
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    footerServerName: document.getElementById('footerServerName'),
    footerPlayers: document.getElementById('footerPlayers'),
    serverSelector: document.getElementById('serverSelector'),
    btnServerMenu: document.getElementById('btnServerMenu'),
    serverMenu: document.getElementById('serverMenu'),
    btnPlay: document.getElementById('btnPlay'),

    // Settings Sidebar
    settingsSidebar: document.getElementById('settingsSidebar'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnChangeGameFolder: document.getElementById('btnChangeGameFolder'),
    btnReinstallGame: document.getElementById('btnReinstallGame'),
    btnClearCache: document.getElementById('btnClearCache'),
    btnInstallDrivers: document.getElementById('btnInstallDrivers'),
    driversStatus: document.getElementById('driversStatus'),
    settingsLauncherVersion: document.getElementById('settingsLauncherVersion'),
    settingsGameVersion: document.getElementById('settingsGameVersion'),
    settingsCurrentCategory: document.getElementById('settingsCurrentCategory'),
    settingsGamePath: document.getElementById('settingsGamePath'),
    settingsFooterVersion: document.getElementById('settingsFooterVersion'),

    // Toggles de preferências
    toggleDiscordRPC: document.getElementById('toggleDiscordRPC'),
    toggleAutoLaunch: document.getElementById('toggleAutoLaunch'),

    // Main Page Buttons
    btnStore: document.getElementById('btnStore'),
    btnMods: document.getElementById('btnMods'),
    btnSubNavBack: document.getElementById('btnSubNavBack'),

    // Mods Navigation (old - keeping for compatibility)
    btnNavBack: document.getElementById('btnNavBack'),
    btnNavStore: document.getElementById('btnNavStore'),
    btnNavMods: document.getElementById('btnNavMods'),
    modsNavBtns: document.querySelectorAll('.mods-nav-btn'),

    // Mods Page
    modsPage: document.getElementById('modsPage'),
    modsSearch: document.getElementById('modsSearch'),
    modsPopular: document.getElementById('modsPopular'),
    modsAll: document.getElementById('modsAll'),
    modsCategoryFilter: document.getElementById('modsCategoryFilter'),
    mainContent: document.querySelector('.main-content'),

    // Mod Modal
    modModalOverlay: document.getElementById('modModalOverlay'),
    modModalClose: document.getElementById('modModalClose'),
    modModalImage: document.getElementById('modModalImage'),
    modModalTitle: document.getElementById('modModalTitle'),
    modModalAuthor: document.getElementById('modModalAuthor'),
    modModalDesc: document.getElementById('modModalDesc'),
    modModalRequirements: document.getElementById('modModalRequirements'),
    modModalActions: document.getElementById('modModalActions'),
    modModalInstall: document.getElementById('modModalInstall')
};

// ==========================================
// Inicialização
// ==========================================
async function init() {
    // Carregar configurações locais primeiro (fallback)
    appConfig = await ipcRenderer.invoke('get-app-config');
    userConfig = await ipcRenderer.invoke('get-user-config');

    // Tentar buscar configurações remotas
    try {
        const remoteResult = await ipcRenderer.invoke('fetch-remote-config');
        if (remoteResult.success) {
            appConfig = remoteResult.config;

            // Enviar config do Discord RPC para o main process
            if (appConfig.howToPlayUrl || appConfig.social?.discord) {
                ipcRenderer.invoke('set-discord-rpc-config', {
                    howToPlayUrl: appConfig.howToPlayUrl,
                    defaultDiscordUrl: appConfig.social?.discord
                });
            }
        }
    } catch (error) {
        // Usando config local (API indisponível)
    }

    // Atualizar nomes das abas com base na configuração
    updateCategoryTabNames();

    // Atualizações são verificadas automaticamente pelo electron-updater no main.js
    // Os eventos 'update-available', 'update-downloaded' etc são recebidos via IPC

    // Verificar estado global do download (caso tenha download em andamento)
    await syncGlobalDownloadState();

    // Verificar se o jogo está instalado
    await checkGameInstalled();

    // Aplicar configurações do usuário
    if (userConfig.nickname) {
        elements.nickname.value = userConfig.nickname;
    }
    if (userConfig.selectedCategory) {
        selectedCategory = userConfig.selectedCategory;
    }
    // Carregar servidores salvos por categoria
    if (userConfig.selectedServerPerCategory) {
        selectedServerPerCategory = { ...selectedServerPerCategory, ...userConfig.selectedServerPerCategory };
    }

    // Configurar menu de servidores
    setupServerMenu();

    // Selecionar categoria inicial (selectCategory já restaura o servidor salvo)
    selectCategory(selectedCategory);

    // Iniciar query de servidores
    queryAllServers();
    setInterval(queryAllServers, 10000);

    // Setup eventos
    setupEventListeners();

    // Setup listeners de download
    setupDownloadListeners();

    // Atualizar versão do launcher no footer das configurações
    const launcherVersion = await ipcRenderer.invoke('get-launcher-version');
    if (elements.settingsFooterVersion) {
        elements.settingsFooterVersion.textContent = `v${launcherVersion || '1.0.0'}`;
    }

    // Aguardar imagens carregarem e esconder loading screen
    await waitForImagesToLoad();
    hideLoadingScreen();
}

// ==========================================
// Sincronizar estado global de download
// ==========================================
async function syncGlobalDownloadState() {
    const state = await ipcRenderer.invoke('get-download-state');
    globalDownloadState.isDownloading = state.isDownloading;
    globalDownloadState.isExtracting = state.isExtracting;
    globalDownloadState.category = state.category;
    globalDownloadState.percent = state.percent;

    // Se há download em andamento para a categoria atual, sincronizar
    if (state.category === selectedCategory) {
        gameState.downloading = state.isDownloading;
        gameState.extracting = state.isExtracting;
    }
}

// ==========================================
// Atualizar nomes das abas de categoria
// ==========================================
function updateCategoryTabNames() {
    const categories = Object.keys(appConfig?.categories || {});
    elements.serverTabs.forEach((tab, index) => {
        const categoryId = categories[index];
        if (categoryId && appConfig?.categories?.[categoryId]) {
            const categoryData = appConfig.categories[categoryId];
            // Atualizar o texto da aba (preservar o span de status)
            const statusSpan = tab.querySelector('.server-status-tag');
            tab.textContent = categoryData.name || categoryId;
            if (statusSpan) {
                tab.appendChild(statusSpan);
            }
        }
    });
}

// ==========================================
// Verificação do Jogo
// ==========================================
async function checkGameInstalled() {
    // Verificar se o jogo está instalado para a categoria atual
    const result = await ipcRenderer.invoke('check-game-installed', selectedCategory);
    gameState.installed = result.installed;
    gameState.gamePath = result.path;
    gameState.needsUpdate = result.needsUpdate || false;
    gameState.installedVersion = result.installedVersion;
    gameState.remoteVersion = result.remoteVersion;

    // Verificar se há download em andamento (desta ou de outra categoria)
    const isDownloadingThisCategory = globalDownloadState.category === selectedCategory &&
        (globalDownloadState.isDownloading || globalDownloadState.isExtracting);
    const isDownloadingOtherCategory = globalDownloadState.category &&
        globalDownloadState.category !== selectedCategory &&
        (globalDownloadState.isDownloading || globalDownloadState.isExtracting);

    // Sincronizar estado local com estado global se for mesma categoria
    if (isDownloadingThisCategory) {
        gameState.downloading = globalDownloadState.isDownloading;
        gameState.extracting = globalDownloadState.isExtracting;
    } else {
        gameState.downloading = false;
        gameState.extracting = false;
    }

    updatePlayButton();

    // Atualizar texto da barra de progresso
    if (isDownloadingOtherCategory) {
        // Outra categoria está baixando
        const action = globalDownloadState.isExtracting ? 'Extraindo' : 'Baixando';
        elements.progressPercent.textContent = `${globalDownloadState.percent}%`;
        elements.progressFill.style.width = `${globalDownloadState.percent}%`;
        elements.progressText.textContent = `${action}... ${globalDownloadState.percent}%`;
    } else if (gameState.installed && gameState.needsUpdate) {
        // Jogo instalado mas precisa atualizar
        elements.progressPercent.textContent = '100%';
        elements.progressFill.style.width = '100%';
        const versionText = gameState.installedVersion ? `v${gameState.installedVersion}` : '';
        elements.progressText.textContent = `Atualização disponível ${versionText} → v${gameState.remoteVersion}`;
    } else if (gameState.installed) {
        elements.progressPercent.textContent = '100%';
        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = 'Pronto para jogar';
    } else if (result.partialDownload) {
        // Existe download parcial - mostrar opção de retomar
        const downloadedMB = (result.partialDownload.downloaded / 1024 / 1024).toFixed(1);
        elements.progressText.textContent = `Download pausado (${downloadedMB}MB baixados)`;
        elements.btnPlay.innerHTML = '<i class="bi bi-play-fill"></i> RETOMAR DOWNLOAD';
    } else {
        elements.progressPercent.textContent = '0%';
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = 'Jogo não instalado';
    }
}

// Atualizar botão de jogar baseado no estado do jogo
function updatePlayButton() {
    // Verificar se está instalando drivers
    if (isInstallingDrivers) {
        elements.btnPlay.innerHTML = '<span class="btn-spinner"></span> INSTALANDO DRIVERS';
        elements.btnPlay.disabled = true;
        return;
    }

    // Verificar se outra categoria está baixando
    const isDownloadingOtherCategory = globalDownloadState.category &&
        globalDownloadState.category !== selectedCategory &&
        (globalDownloadState.isDownloading || globalDownloadState.isExtracting);

    if (gameState.downloading) {
        elements.btnPlay.innerHTML = '<i class="bi bi-pause-fill"></i> PAUSAR';
        elements.btnPlay.disabled = false;
    } else if (gameState.extracting) {
        elements.btnPlay.innerHTML = '<span class="btn-spinner"></span> EXTRAINDO';
        elements.btnPlay.disabled = true;
    } else if (isDownloadingOtherCategory) {
        // Outra categoria está baixando - desabilitar botão
        const action = globalDownloadState.isExtracting ? 'EXTRAINDO' : 'BAIXANDO';
        elements.btnPlay.innerHTML = `<span class="btn-spinner"></span> ${action}`;
        elements.btnPlay.disabled = true;
    } else if (gameState.installed && gameState.needsUpdate) {
        elements.btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg> ATUALIZAR';
        elements.btnPlay.disabled = false;
    } else if (gameState.installed) {
        elements.btnPlay.innerHTML = 'JOGAR <i class="bi bi-play-fill play-icon"></i>';
        elements.btnPlay.disabled = false;
    } else {
        elements.btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg> INSTALAR';
        elements.btnPlay.disabled = false;
    }
}

// ==========================================
// Download Listeners
// ==========================================
// Formatar velocidade de download (bytes para MB/s ou KB/s)
function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '';
    if (bytesPerSecond >= 1024 * 1024) {
        return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
}

function setupDownloadListeners() {
    // Progresso do download
    ipcRenderer.on('download-progress', (event, data) => {
        const { downloaded, total, percent, category, speed } = data;

        // Atualizar estado global
        globalDownloadState.isDownloading = true;
        globalDownloadState.isExtracting = false;
        globalDownloadState.category = category;
        globalDownloadState.percent = percent;

        // Só atualizar UI se for a categoria selecionada
        if (category === selectedCategory) {
            gameState.downloading = true;
            updatePlayButton();

            const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            const speedText = formatSpeed(speed);

            elements.progressPercent.textContent = `${percent}%`;
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Baixando... ${downloadedMB}MB / ${totalMB}MB${speedText ? ' • ' + speedText : ''}`;

            // Atualizar Discord RPC
            updateDiscordRPC(`Baixando ${percent}%`, 'Preparando para jogar');
        }
    });

    // Progresso da extração
    ipcRenderer.on('extract-progress', (event, data) => {
        const { percent, file, category } = data;

        // Atualizar estado global
        globalDownloadState.isDownloading = false;
        globalDownloadState.isExtracting = true;
        globalDownloadState.category = category;
        globalDownloadState.percent = percent;

        // Só atualizar UI se for a categoria selecionada
        if (category === selectedCategory) {
            gameState.downloading = false;
            gameState.extracting = true;
            updatePlayButton();

            elements.progressPercent.textContent = `${percent}%`;
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Extraindo arquivos...`;

            // Atualizar Discord RPC
            updateDiscordRPC(`Extraindo ${percent}%`, 'Instalando jogo');
        }
    });

    // Download completo
    ipcRenderer.on('download-complete', async (event, result) => {
        const completedCategory = result.category;

        // Resetar estado global
        globalDownloadState.isDownloading = false;
        globalDownloadState.isExtracting = false;
        globalDownloadState.category = null;
        globalDownloadState.percent = 0;

        // Só atualizar UI se for a categoria selecionada
        if (completedCategory === selectedCategory) {
            gameState.downloading = false;
            gameState.extracting = false;

            if (result.success) {
                gameState.installed = true;
                gameState.gamePath = result.path;
                gameState.needsUpdate = false;
                gameState.installedVersion = result.version || null;
                elements.progressPercent.textContent = '100%';
                elements.progressFill.style.width = '100%';
                elements.progressText.textContent = 'Pronto para jogar';
                showToast('Download concluído! Pronto para jogar.');

                // Atualizar Discord RPC
                updateDiscordRPC('No Launcher', 'Pronto para jogar');

                // Perguntar se quer instalar drivers (primeira instalação)
                setTimeout(() => promptDriverInstallation(), 1000);
            } else {
                elements.progressText.textContent = 'Erro na instalação';
                showToast('Erro: ' + result.error);
            }

            updatePlayButton();
        } else {
            // Download de outra categoria completou
            const categoryNames = { rp: 'RP', dm: 'DM', dayz: 'DayZ' };
            const catName = categoryNames[completedCategory] || completedCategory;
            if (result.success) {
                showToast(`Download de ${catName} concluído!`);
            }
        }
    });

    // Erro no download
    ipcRenderer.on('download-error', (event, error) => {
        globalDownloadState.isDownloading = false;
        globalDownloadState.isExtracting = false;
        globalDownloadState.category = null;

        gameState.downloading = false;
        gameState.extracting = false;
        elements.progressText.textContent = 'Erro no download';
        showToast('Erro no download: ' + error);
        updatePlayButton();
    });
}

// ==========================================
// Loading Screen
// ==========================================
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

// Aguarda o carregamento das imagens principais
async function waitForImagesToLoad() {
    const bgImage = document.getElementById('bgImage');
    const promises = [];

    // Aguardar banner principal
    if (bgImage && !bgImage.complete) {
        promises.push(new Promise((resolve) => {
            bgImage.onload = resolve;
            bgImage.onerror = resolve; // Resolve mesmo em erro para não travar
        }));
    }

    // Aguardar imagens das notícias
    const newsCards = document.querySelectorAll('.news-card');
    newsCards.forEach(card => {
        const bgUrl = card.style.backgroundImage;
        if (bgUrl && bgUrl !== 'none') {
            const url = bgUrl.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1');
            const img = new Image();
            promises.push(new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                img.src = url;
            }));
        }
    });

    // Timeout de segurança (5 segundos máximo)
    const timeout = new Promise(resolve => setTimeout(resolve, 5000));

    // Aguarda todas as imagens ou timeout
    await Promise.race([
        Promise.all(promises),
        timeout
    ]);
}

// ==========================================
// Verificar se categoria está habilitada (tem servidores)
// ==========================================
function isCategoryEnabled(category) {
    const categoryData = appConfig.categories?.[category];
    return categoryData?.servers && categoryData.servers.length > 0;
}

// ==========================================
// Carregar Notícias (Carrossel com 2 por página)
// ==========================================
const NEWS_PER_PAGE = 2;
let currentNewsPage = 0;
let newsItems = [];

function loadNews() {
    const newsCards = document.getElementById('newsCards');
    const newsDots = document.getElementById('newsDots');

    // Pegar notícias da categoria atual
    const categoryData = appConfig.categories?.[selectedCategory];
    const categoryNews = categoryData?.news || [];

    if (!newsCards || categoryNews.length === 0) {
        // Limpar se não houver notícias
        if (newsCards) newsCards.innerHTML = '';
        if (newsDots) newsDots.innerHTML = '';
        return;
    }

    // Armazenar notícias
    newsItems = categoryNews;
    currentNewsPage = 0;

    // Limpar conteúdo
    newsCards.innerHTML = '';
    newsDots.innerHTML = '';

    // Criar todos os cards (inicialmente ocultos)
    newsItems.forEach((news, index) => {
        const card = document.createElement('div');
        card.className = 'news-card';
        card.dataset.index = index;
        card.style.backgroundImage = `url('${news.image}')`;
        card.innerHTML = `
            <div class="news-card-overlay">
                <span class="news-card-title">${news.title}</span>
            </div>
        `;

        // Abrir link ao clicar
        if (news.link) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                ipcRenderer.send('open-external', news.link);
            });
        }

        newsCards.appendChild(card);
    });

    // Criar dots para páginas (apenas se tiver mais de 2 notícias)
    const totalPages = Math.ceil(newsItems.length / NEWS_PER_PAGE);
    if (totalPages > 1) {
        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot' + (i === 0 ? ' active' : '');
            dot.dataset.page = i;
            dot.addEventListener('click', () => {
                goToNewsPage(i);
            });
            newsDots.appendChild(dot);
        }
    }

    // Mostrar primeira página
    updateNewsDisplay();
}

function goToNewsPage(page) {
    currentNewsPage = page;
    updateNewsDisplay();
}

function updateNewsDisplay() {
    const newsCards = document.getElementById('newsCards');
    const newsDots = document.getElementById('newsDots');
    const cards = newsCards.querySelectorAll('.news-card');

    // Calcular índices visíveis
    const startIndex = currentNewsPage * NEWS_PER_PAGE;
    const endIndex = startIndex + NEWS_PER_PAGE;

    // Mostrar/ocultar cards
    cards.forEach((card, index) => {
        if (index >= startIndex && index < endIndex) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // Atualizar dots ativos
    const dots = newsDots.querySelectorAll('.dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentNewsPage);
    });
}

// ==========================================
// Verificação de Atualizações (via electron-updater)
// ==========================================

// Armazena info do update pendente
let pendingUpdate = null;
let updateDownloadComplete = false;
let isForceUpdate = false;
let userWantsAutoInstall = false; // true quando usuário clica em "Atualizar" no modal de escolha

// Listener: Atualização disponível COM forceUpdate (download automático)
ipcRenderer.on('update-available', (event, info) => {
    console.log('[Update] Atualização FORÇADA disponível:', info.version);
    pendingUpdate = info;
    isForceUpdate = true;
    showUpdateModal(info, 'downloading');
});

// Listener: Atualização disponível SEM forceUpdate (mostrar modal de escolha)
ipcRenderer.on('update-available-optional', (event, info) => {
    console.log('[Update] Atualização OPCIONAL disponível:', info.version);
    pendingUpdate = info;
    isForceUpdate = false;
    // Mostrar modal perguntando se quer atualizar agora ou depois
    showUpdateChoiceModal(info);
});

// Listener: Download completo
ipcRenderer.on('update-downloaded', (event, info) => {
    console.log('[Update] Download completo:', info.version);
    updateDownloadComplete = true;
    pendingUpdate = info;

    if (isForceUpdate || userWantsAutoInstall) {
        // ForceUpdate ou usuário escolheu "Atualizar": instalar automaticamente
        console.log('[Update] Instalando automaticamente...');
        // Pequeno delay para garantir que o modal apareça antes do app fechar
        setTimeout(() => {
            ipcRenderer.send('install-update');
        }, 500);
        userWantsAutoInstall = false;
    } else {
        // Usuário clicou no ícone do header: mostrar botão para instalar
        showUpdateReady(info, false);
    }
});

// Listener: Erro no update
ipcRenderer.on('update-error', (event, errorMessage) => {
    console.error('[Update] Erro:', errorMessage);
    showUpdateError(errorMessage);
});

// Modal de ESCOLHA - pergunta se quer atualizar agora ou depois
function showUpdateChoiceModal(update) {
    // Remover modal existente se houver
    const existingModal = document.getElementById('updateModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'update-modal';
    modal.id = 'updateModal';
    modal.innerHTML = `
        <div class="update-modal-content update-modal-centered">
            <div class="update-icon-warning" style="color: #3b82f6;">
                <i class="bi bi-cloud-arrow-down"></i>
            </div>
            <h2>Nova atualização disponível!</h2>
            <p class="update-message">Versão <strong>${update.version}</strong> está disponível.<br>Deseja atualizar agora?</p>
            <div class="update-modal-buttons">
                <button class="btn-update btn-update-green" id="btnUpdateNow">
                    Atualizar
                </button>
                <button class="btn-later btn-close-dark" id="btnUpdateLater">
                    Depois
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Event listener para "Atualizar" - inicia download e instalação automática
    document.getElementById('btnUpdateNow').addEventListener('click', function() {
        modal.remove();
        userWantsAutoInstall = true; // Instalar automaticamente após download
        // Mostrar modal de atualização
        showUpdateModal(update, 'downloading');
        // Iniciar download
        ipcRenderer.send('start-update-download');
    });

    // Event listener para "Depois" - fecha o modal e mostra ícone verde no header
    document.getElementById('btnUpdateLater').addEventListener('click', function() {
        modal.remove();
        // Mostra ícone verde no header para lembrar que há atualização
        showUpdateIcon(update);
    });
}

function showUpdateModal(update, status = 'downloading') {
    // Remover modal existente se houver
    const existingModal = document.getElementById('updateModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'update-modal';
    modal.id = 'updateModal';
    modal.innerHTML = `
        <div class="update-modal-content update-modal-centered">
            <div class="update-icon-warning">
                <i class="bi bi-arrow-repeat spinner"></i>
            </div>
            <h2>Atualizando launcher...</h2>
        </div>
    `;
    document.body.appendChild(modal);
}

function showUpdateReady(update, forceUpdate = false) {
    // Remover modal existente se houver
    const existingModal = document.getElementById('updateModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'update-modal';
    modal.id = 'updateModal';
    modal.innerHTML = `
        <div class="update-modal-content update-modal-centered">
            <div class="update-icon-warning" style="color: #4ade80;">
                <i class="bi bi-check-circle-fill"></i>
            </div>
            <h2>Atualização pronta!</h2>
            <p class="update-message">Versão ${update.version} baixada com sucesso.<br><strong>${forceUpdate ? 'Esta atualização é obrigatória.' : 'Clique em "Instalar" para reiniciar e atualizar.'}</strong></p>
            <div class="update-modal-buttons" id="updateButtons">
                <button class="btn-update btn-update-green" id="btnInstallUpdate">
                    Instalar Agora
                </button>
                ${!forceUpdate ? '<button class="btn-later btn-close-dark" id="btnUpdateLater">Depois</button>' : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Event listener para instalar
    document.getElementById('btnInstallUpdate').addEventListener('click', function() {
        ipcRenderer.send('install-update');
    });

    // Event listener para "Depois" - mostra ícone de update no header (update já baixado)
    const btnLater = document.getElementById('btnUpdateLater');
    if (btnLater) {
        btnLater.addEventListener('click', function() {
            modal.remove();
            showUpdateReadyIcon(update);
        });
    }
}

function showUpdateError(errorMessage) {
    // Remover modal existente se houver
    const existingModal = document.getElementById('updateModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'update-modal';
    modal.id = 'updateModal';
    modal.innerHTML = `
        <div class="update-modal-content update-modal-centered">
            <div class="update-icon-warning" style="color: #ef4444;">
                <i class="bi bi-x-circle-fill"></i>
            </div>
            <h2>Erro na atualização</h2>
            <p class="update-message">Não foi possível baixar a atualização.<br><small>${errorMessage}</small></p>
            <div class="update-modal-buttons">
                <button class="btn-later btn-close-dark" id="btnCloseError">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnCloseError').addEventListener('click', function() {
        modal.remove();
    });
}

// Ícone de atualização PRONTA no header (update já baixado, só precisa instalar)
function showUpdateReadyIcon(update) {
    // Remover ícone existente se houver
    const existing = document.getElementById('headerUpdateIcon');
    if (existing) existing.remove();

    // Encontrar o container dos botões do header
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // Criar o ícone de update (verde = pronto para instalar)
    const updateIcon = document.createElement('button');
    updateIcon.id = 'headerUpdateIcon';
    updateIcon.className = 'btn-icon header-update-icon update-ready';
    updateIcon.setAttribute('data-tooltip', `Versão ${update.version} pronta - Clique para instalar`);
    updateIcon.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/>
        </svg>
    `;

    // Ao clicar, mostra modal para instalar (update já baixado)
    updateIcon.addEventListener('click', () => {
        updateIcon.remove();
        showUpdateReady(update, false);
    });

    // Inserir antes do botão de configurações
    const settingsBtn = document.getElementById('btnSettings');
    if (settingsBtn) {
        headerRight.insertBefore(updateIcon, settingsBtn);
    } else {
        headerRight.prepend(updateIcon);
    }
}

// Ícone de atualização DISPONÍVEL no header (precisa baixar primeiro)
function showUpdateIcon(update) {
    // Remover ícone existente se houver
    const existing = document.getElementById('headerUpdateIcon');
    if (existing) existing.remove();

    // Encontrar o container dos botões do header
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // Criar container com tooltip moderno
    const updateContainer = document.createElement('div');
    updateContainer.id = 'headerUpdateIcon';
    updateContainer.className = 'update-icon-container';
    updateContainer.innerHTML = `
        <button class="btn-icon" style="color: #4ade80;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/>
            </svg>
        </button>
        <span class="update-tooltip">v${update.version} disponível</span>
    `;

    // Ao clicar, mostra o modal de escolha novamente
    updateContainer.addEventListener('click', () => {
        updateContainer.remove();
        showUpdateChoiceModal(update);
    });

    // Inserir antes do botão de configurações
    const settingsBtn = document.getElementById('btnSettings');
    if (settingsBtn) {
        headerRight.insertBefore(updateContainer, settingsBtn);
    } else {
        headerRight.prepend(updateContainer);
    }
}

function showMaintenanceModal(message) {
    const social = appConfig.social || {};
    const modal = document.createElement('div');
    modal.className = 'update-modal maintenance';
    modal.innerHTML = `
        <div class="update-modal-content">
            <h2><i class="bi bi-exclamation-triangle"></i> Manutenção</h2>
            <p>${message}</p>
            <div class="maintenance-social">
                ${social.site ? `<a href="#" onclick="openExternal('${social.site}')" class="social-icon" title="Site"><i class="bi bi-globe"></i></a>` : ''}
                ${social.discord ? `<a href="#" onclick="openExternal('${social.discord}')" class="social-icon" title="Discord"><i class="bi bi-discord"></i></a>` : ''}
                ${social.youtube ? `<a href="#" onclick="openExternal('${social.youtube}')" class="social-icon" title="YouTube"><i class="bi bi-youtube"></i></a>` : ''}
                ${social.instagram ? `<a href="#" onclick="openExternal('${social.instagram}')" class="social-icon" title="Instagram"><i class="bi bi-instagram"></i></a>` : ''}
                ${social.tiktok ? `<a href="#" onclick="openExternal('${social.tiktok}')" class="social-icon" title="TikTok"><i class="bi bi-tiktok"></i></a>` : ''}
                ${social.whatsapp ? `<a href="#" onclick="openExternal('${social.whatsapp}')" class="social-icon" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
            </div>
            <div class="update-modal-buttons">
                <button class="btn-later" onclick="window.close()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Função global para abrir links externos
window.openExternal = function(url) {
    ipcRenderer.send('open-external', url);
};

// ==========================================
// Setup do Menu de Servidores
// ==========================================
function setupServerMenu() {
    const serverMenu = elements.serverMenu;
    serverMenu.innerHTML = '';

    // Pegar servidores da categoria ativa
    const categoryData = appConfig.categories[selectedCategory];
    if (!categoryData || !categoryData.servers) return;

    categoryData.servers.forEach((server, index) => {
        const menuItem = document.createElement('div');
        menuItem.className = 'server-menu-item';
        menuItem.dataset.server = index;

        menuItem.innerHTML = `
            <div class="server-menu-icon-wrapper">
                <img src="assets/images/logo.png" alt="Server" class="server-menu-icon-img">
                <span class="server-menu-status-dot loading" data-server-status="${index}"></span>
            </div>
            <div class="server-menu-info">
                <span class="server-menu-name">${server.name}</span>
                <span class="server-menu-players loading" data-server-players="${index}"><i class="bi bi-three-dots"></i></span>
            </div>
        `;

        menuItem.addEventListener('click', () => {
            selectServer(index);
            hideServerMenu();
        });

        serverMenu.appendChild(menuItem);
    });
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
    // Abas de categoria
    elements.serverTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            const categories = Object.keys(appConfig?.categories || {});
            const category = categories[index];

            // Verificar se categoria tem servidores
            if (!isCategoryEnabled(category)) {
                showToast('Categoria indisponível', tab);
                return;
            }

            // Mostrar loading ao trocar de categoria
            selectCategory(category, true);
        });
    });

    // Nickname - filtrar caracteres especiais e números (apenas letras e _)
    elements.nickname.addEventListener('input', (e) => {
        // Remover tudo que não seja letra ou underscore
        const filtered = e.target.value.replace(/[^a-zA-Z_]/g, '');
        if (filtered !== e.target.value) {
            e.target.value = filtered;
        }
    });

    elements.nickname.addEventListener('change', () => {
        ipcRenderer.send('save-user-config', { nickname: elements.nickname.value });
    });

    // Controles da janela
    elements.btnMinimize.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    elements.btnClose.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    // Botões sociais
    setupSocialButtons();

    // Seletor de servidor
    elements.btnServerMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleServerMenu();
    });

    elements.serverSelector.addEventListener('click', (e) => {
        if (e.target !== elements.btnServerMenu) {
            toggleServerMenu();
        }
    });

    // Fechar menu ao clicar fora
    document.addEventListener('click', (e) => {
        if (!elements.serverMenu.contains(e.target) && !elements.serverSelector.contains(e.target)) {
            hideServerMenu();
        }
    });

    // Botão Play
    elements.btnPlay.addEventListener('click', launchGame);

    // Settings Sidebar
    elements.btnSettings.addEventListener('click', () => {
        openSettingsSidebar();
    });

    elements.btnCloseSettings.addEventListener('click', () => {
        closeSettingsSidebar();
    });

    elements.settingsOverlay.addEventListener('click', () => {
        closeSettingsSidebar();
    });

    elements.btnChangeGameFolder.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('select-game-folder', selectedCategory);
        if (result.success) {
            elements.settingsGamePath.textContent = shortenPath(result.path);
            elements.settingsGamePath.title = result.path; // Caminho completo no tooltip
            gameState.gamePath = result.path;
            showToast('Pasta alterada com sucesso');
            // Verificar se o jogo está instalado na nova pasta
            await checkGameInstalled();
            updatePlayButton();
        }
    });

    // Clique no caminho da pasta para abrir o diretório
    elements.settingsGamePath.addEventListener('click', () => {
        if (gameState.gamePath) {
            ipcRenderer.send('open-external', gameState.gamePath);
        } else {
            showToast('Pasta não configurada');
        }
    });

    elements.btnReinstallGame.addEventListener('click', async () => {
        if (!gameState.installed) {
            showToast('Jogo não instalado');
            return;
        }
        const confirmed = await showConfirm(
            'Reinstalar Jogo',
            'Tem certeza que deseja reinstalar o jogo?<br>Isso irá remover todos os arquivos e baixar novamente.',
            true
        );
        if (confirmed) {
            closeSettingsSidebar();

            // Marcar para reinstalar
            gameState.needsUpdate = true;
            gameState.installed = false;
            updatePlayButton();
            elements.progressText.textContent = 'Removendo arquivos antigos...';

            // Remover pasta do jogo antes de baixar novamente
            const removeResult = await ipcRenderer.invoke('remove-game-folder', selectedCategory);
            if (!removeResult.success) {
                showToast('Erro ao remover: ' + removeResult.error);
                return;
            }

            elements.progressText.textContent = 'Preparando download...';

            // Iniciar download
            const result = await ipcRenderer.invoke('start-game-download', selectedCategory);
            if (!result.success) {
                showToast('Erro: ' + result.error);
            }
        }
    });

    elements.btnClearCache.addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'Limpar Cache',
            'Deseja realmente limpar o cache?<br><br><small>Isso irá apagar os arquivos temporários e as configurações remotas.</small>'
        );

        if (!confirmed) return;

        const result = await ipcRenderer.invoke('clear-cache');
        if (result && result.success) {
            showToast('Cache limpo com sucesso!');
        } else {
            showToast('Erro ao limpar cache');
        }
    });

    // Botão de instalar drivers
    elements.btnInstallDrivers.addEventListener('click', async () => {
        await installDrivers();
    });

    // Toggle Discord Rich Presence
    elements.toggleDiscordRPC.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await ipcRenderer.invoke('set-discord-rpc-enabled', enabled);
    });

    // Toggle Auto-launch
    elements.toggleAutoLaunch.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await ipcRenderer.invoke('set-auto-launch-enabled', enabled);
    });
}

// ==========================================
// Settings Sidebar Functions
// ==========================================
async function openSettingsSidebar() {
    // Atualizar informações antes de abrir
    const launcherVersion = await ipcRenderer.invoke('get-launcher-version');
    elements.settingsLauncherVersion.textContent = launcherVersion || '1.0.0';
    elements.settingsFooterVersion.textContent = `v${launcherVersion || '1.0.0'}`;

    // Versão do jogo
    elements.settingsGameVersion.textContent = gameState.installedVersion || (gameState.installed ? 'Instalado' : '-');

    // Categoria atual (usar name da configuração)
    const categoryName = appConfig?.categories?.[selectedCategory]?.name || selectedCategory.toUpperCase();
    elements.settingsCurrentCategory.textContent = categoryName;

    // Pasta do jogo - buscar diretamente do store (para categoria atual)
    const savedGamePath = await ipcRenderer.invoke('get-game-path', selectedCategory);
    if (savedGamePath) {
        elements.settingsGamePath.textContent = shortenPath(savedGamePath);
        elements.settingsGamePath.title = savedGamePath; // Caminho completo no tooltip
    } else {
        elements.settingsGamePath.textContent = 'Não configurado';
        elements.settingsGamePath.title = '';
    }

    // Carregar estado dos toggles
    const discordRpcEnabled = await ipcRenderer.invoke('get-discord-rpc-enabled');
    const autoLaunchEnabled = await ipcRenderer.invoke('get-auto-launch-enabled');
    elements.toggleDiscordRPC.checked = discordRpcEnabled;
    elements.toggleAutoLaunch.checked = autoLaunchEnabled;

    // Mostrar sidebar e overlay
    elements.settingsSidebar.classList.add('show');
    elements.settingsOverlay.classList.add('show');
}

function closeSettingsSidebar() {
    elements.settingsSidebar.classList.remove('show');
    elements.settingsOverlay.classList.remove('show');
}

// ==========================================
// Setup dos Botões Sociais
// ==========================================
function setupSocialButtons() {
    // Site
    elements.btnSite.addEventListener('click', () => {
        if (appConfig.social && appConfig.social.site) {
            ipcRenderer.send('open-external', appConfig.social.site);
        }
    });

    // YouTube
    const btnYoutube = document.querySelector('.btn-youtube');
    if (btnYoutube) {
        btnYoutube.addEventListener('click', () => {
            if (appConfig.social && appConfig.social.youtube) {
                ipcRenderer.send('open-external', appConfig.social.youtube);
            }
        });
    }

    // Instagram
    const btnInstagram = document.querySelector('.btn-instagram');
    if (btnInstagram) {
        btnInstagram.addEventListener('click', () => {
            if (appConfig.social && appConfig.social.instagram) {
                ipcRenderer.send('open-external', appConfig.social.instagram);
            }
        });
    }

    // TikTok
    const btnTiktok = document.querySelector('.btn-tiktok');
    if (btnTiktok) {
        btnTiktok.addEventListener('click', () => {
            if (appConfig.social && appConfig.social.tiktok) {
                ipcRenderer.send('open-external', appConfig.social.tiktok);
            }
        });
    }

    // WhatsApp
    const btnWhatsapp = document.querySelector('.btn-whatsapp');
    if (btnWhatsapp) {
        btnWhatsapp.addEventListener('click', () => {
            if (appConfig.social && appConfig.social.whatsapp) {
                ipcRenderer.send('open-external', appConfig.social.whatsapp);
            }
        });
    }

    // Discord - abre o Discord do servidor selecionado
    elements.btnDiscord.addEventListener('click', () => {
        const categoryData = appConfig.categories[selectedCategory];
        const serverData = categoryData?.servers?.[selectedServerIndex];

        // Prioridade: Discord do servidor > Discord social genérico
        if (serverData?.discord) {
            ipcRenderer.send('open-external', serverData.discord);
        } else if (appConfig.social?.discord) {
            ipcRenderer.send('open-external', appConfig.social.discord);
        }
    });
}

// ==========================================
// Funções de Seleção
// ==========================================
// Atualizar cor do tema baseado na categoria
function updateCategoryTheme(category) {
    const categoryData = appConfig.categories[category];
    if (categoryData?.color) {
        // Define variável CSS para a cor da categoria
        document.documentElement.style.setProperty('--category-color', categoryData.color);

        // Calcular versão mais escura para hover (15% mais escuro)
        const darkerColor = adjustColorBrightness(categoryData.color, -15);
        document.documentElement.style.setProperty('--category-color-hover', darkerColor);
    }
}

// Ajustar brilho de uma cor hex
function adjustColorBrightness(hex, percent) {
    // Remove # se existir
    hex = hex.replace('#', '');

    // Converte para RGB
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Ajusta o brilho
    r = Math.max(0, Math.min(255, r + (r * percent / 100)));
    g = Math.max(0, Math.min(255, g + (g * percent / 100)));
    b = Math.max(0, Math.min(255, b + (b * percent / 100)));

    // Converte de volta para hex
    return '#' +
        Math.round(r).toString(16).padStart(2, '0') +
        Math.round(g).toString(16).padStart(2, '0') +
        Math.round(b).toString(16).padStart(2, '0');
}

async function selectCategory(category, showLoading = false) {
    // Mostrar loading se for troca de categoria (não na inicialização)
    if (showLoading) {
        showLoadingScreen();
    }

    selectedCategory = category;

    // Atualizar cor do tema
    updateCategoryTheme(category);

    // Se estiver na página de mods, recarregar os mods para a nova categoria
    if (currentPage === 'mods') {
        modsLoaded = false;  // Resetar flag para permitir recarregamento
        await loadMods();
    }

    // Restaurar servidor salvo da categoria (ou 0 se não existir)
    const savedServerIndex = selectedServerPerCategory[category] || 0;

    // Atualizar abas
    const categories = Object.keys(appConfig?.categories || {});
    elements.serverTabs.forEach((tab, i) => {
        const cat = categories[i];
        tab.classList.toggle('active', cat === category);

        // Atualizar status da aba (habilitada se tem servidores)
        const statusTag = tab.querySelector('.server-status-tag');
        if (statusTag) {
            if (isCategoryEnabled(cat)) {
                statusTag.classList.add('online');
                statusTag.classList.remove('offline');
            } else {
                statusTag.classList.add('offline');
                statusTag.classList.remove('online');
            }
        }
    });

    // Atualizar nome baseado na categoria (vem da API)
    const categoryData = appConfig.categories[category];
    elements.serverName.textContent = categoryData?.titleName || 'HORIZONTE';

    // Atualizar banner da categoria
    const bgImage = document.getElementById('bgImage');
    if (bgImage && categoryData?.banner) {
        bgImage.src = categoryData.banner;
    }

    // Reconfigurar menu de servidores
    setupServerMenu();

    // Selecionar servidor salvo da categoria (ou primeiro se não existir)
    const serverIndex = (categoryData?.servers && savedServerIndex < categoryData.servers.length) ? savedServerIndex : 0;
    selectServer(serverIndex);

    // Carregar notícias da categoria
    loadNews();

    // Verificar se o jogo está instalado para esta categoria
    await checkGameInstalled();

    // Salvar categoria selecionada
    ipcRenderer.send('save-user-config', { selectedCategory: category });

    // Aguardar imagens e esconder loading
    if (showLoading) {
        await waitForImagesToLoad();
        hideLoadingScreen();
    }
}

// Mostrar loading screen
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }
}

function selectServer(index) {
    selectedServerIndex = index;

    // Salvar servidor por categoria
    selectedServerPerCategory[selectedCategory] = index;

    const categoryData = appConfig.categories[selectedCategory];
    if (!categoryData || !categoryData.servers || !categoryData.servers[index]) return;

    const server = categoryData.servers[index];

    // Atualizar Discord RPC com o nome do servidor
    updateDiscordRPC(`Servidor: ${server.name}`, categoryData?.name || 'Horizonte', server.discord);

    // Atualizar footer
    elements.footerServerName.textContent = server.name;

    // Mostrar loading no footer
    const playersCount = elements.footerPlayers.querySelector('.players-count');
    const playersMax = elements.footerPlayers.querySelector('.players-max');
    if (playersCount) {
        playersCount.innerHTML = '<i class="bi bi-three-dots loading-dots"></i>';
    }
    if (playersMax) {
        playersMax.textContent = `/${server.maxPlayers}`;
    }

    // Salvar seleção (servidor por categoria)
    ipcRenderer.send('save-user-config', { selectedServerPerCategory });

    // Query do servidor
    queryServer(selectedCategory, index);
}

// Armazena o status de todos os servidores
let serverStatuses = {};

async function queryServer(category, index) {
    const categoryData = appConfig.categories[category];
    if (!categoryData || !categoryData.servers || !categoryData.servers[index]) return;

    const server = categoryData.servers[index];
    const result = await ipcRenderer.invoke('query-server', server.ip, server.port);

    // Armazenar status
    const key = `${category}_${index}`;
    serverStatuses[key] = result;

    // Atualizar UI se for o servidor selecionado
    if (category === selectedCategory) {
        // Atualizar bolinha de status no menu
        updateServerMenuStatus(index, result);

        if (index === selectedServerIndex) {
            updateFooterServerStatus(result);
        }
    }
}

async function queryAllServers() {
    const categoryData = appConfig.categories[selectedCategory];
    if (!categoryData || !categoryData.servers) return;

    for (let i = 0; i < categoryData.servers.length; i++) {
        await queryServer(selectedCategory, i);
    }
}

function updateFooterServerStatus(status) {
    const playersCount = elements.footerPlayers.querySelector('.players-count');
    const statusDot = document.getElementById('serverStatusDot');

    if (status.online) {
        playersCount.textContent = status.players;
        if (statusDot) statusDot.classList.add('online');
    } else {
        playersCount.textContent = '0';
        if (statusDot) statusDot.classList.remove('online');
    }
}

function updateServerMenuStatus(index, status) {
    // Atualizar bolinha de status no menu
    const statusDot = document.querySelector(`.server-menu-status-dot[data-server-status="${index}"]`);
    const playersSpan = document.querySelector(`.server-menu-players[data-server-players="${index}"]`);

    if (statusDot) {
        statusDot.classList.remove('loading');
        if (status.online) {
            statusDot.classList.add('online');
        } else {
            statusDot.classList.remove('online');
        }
    }

    if (playersSpan) {
        playersSpan.classList.remove('loading');
        const categoryData = appConfig.categories[selectedCategory];
        const server = categoryData.servers[index];

        if (status.online) {
            playersSpan.textContent = `${status.players}/${server.maxPlayers}`;
        } else {
            playersSpan.textContent = `0/${server.maxPlayers}`;
        }
    }
}

function toggleServerMenu() {
    const menu = elements.serverMenu;
    const rect = elements.serverSelector.getBoundingClientRect();

    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    menu.classList.toggle('show');
}

function hideServerMenu() {
    elements.serverMenu.classList.remove('show');
}

async function launchGame() {
    // Evitar cliques múltiplos
    if (isLaunching) {
        return;
    }

    // Se o jogo não está instalado ou precisa atualizar, iniciar download
    if (!gameState.installed || gameState.needsUpdate) {
        if (gameState.downloading) {
            // Pausar download
            await ipcRenderer.invoke('pause-game-download');
            gameState.downloading = false;
            updatePlayButton();
            elements.progressText.textContent = 'Download pausado';
            return;
        }

        // Verificar se a pasta de instalação está configurada
        if (!gameState.gamePath) {
            // Pedir para o usuário escolher a pasta
            const folderResult = await ipcRenderer.invoke('select-game-folder');
            if (!folderResult.success) {
                showToast('Selecione uma pasta para instalar o jogo');
                return;
            }
            gameState.gamePath = folderResult.path;
        }

        gameState.installed = false;
        elements.progressText.textContent = 'Iniciando download...';

        // Iniciar download
        elements.progressPercent.textContent = '0%';
        elements.progressFill.style.width = '0%';

        const result = await ipcRenderer.invoke('start-game-download', selectedCategory);
        if (!result.success) {
            showToast('Erro ao iniciar download: ' + result.error);
        }
        return;
    }

    const nickname = elements.nickname.value.trim();

    if (!nickname || nickname.length < 3) {
        showToast('Digite um nickname válido', elements.nickname);
        elements.nickname.focus();
        return;
    }

    // Verificar se a categoria tem servidores
    if (!isCategoryEnabled(selectedCategory)) {
        showToast('Categoria indisponível');
        return;
    }

    // Marcar que está iniciando (evita cliques múltiplos)
    isLaunching = true;

    // Atualizar UI
    elements.btnPlay.innerHTML = '<span class="btn-spinner"></span> JOGAR';
    elements.btnPlay.disabled = true;

    // Obter ID do servidor
    const categoryData = appConfig.categories[selectedCategory];
    const serverId = categoryData?.servers?.[selectedServerIndex]?.id || selectedServerIndex;

    // Verificar autenticação via IPC (HWID, VM, ban, token)
    const authResult = await ipcRenderer.invoke('verify-auth', {
        nickname,
        serverId: serverId.toString(),
        authApiUrl: appConfig.authApiUrl || 'http://horizontegames.com/api/auth'
    });

    if (!authResult.canPlay) {
        // Bloqueado (VM ou banido)
        isLaunching = false;
        elements.btnPlay.innerHTML = 'JOGAR <i class="bi bi-play-fill play-icon"></i>';
        elements.btnPlay.disabled = false;

        if (authResult.code === 'VM_DETECTED') {
            showAlert('Acesso Negado',
                'O uso de máquinas virtuais compromete a integridade do servidor e não é permitido.<br><br>' +
                'O Horizonte preza por um ambiente justo e equilibrado para todos os jogadores.'
            );
        } else if (authResult.code === 'HWID_BANNED') {
            // Remove prefixos da API para mostrar só o motivo
            let banReason = authResult.error || 'Violação das regras';
            banReason = banReason.replace('Este dispositivo está banido: ', '');
            banReason = banReason.replace('Você está banido: ', '');

            const serverData = appConfig?.categories?.[selectedCategory]?.servers?.[selectedServerIndex];
            const discordLink = serverData?.discord || 'https://discord.com/invite/GmrQbRAvrP';

            // Verifica se é ban temporário ou permanente
            const expiresAt = authResult.banInfo?.expiresAt;
            const isPermanent = !expiresAt;

            let title, expiresText = '';
            if (isPermanent) {
                title = 'Banido Permanentemente';
            } else {
                title = 'Banido Temporariamente';
                const expiresDate = new Date(expiresAt);
                expiresText = `<br><strong>Expira em:</strong> ${expiresDate.toLocaleDateString('pt-BR')} às ${expiresDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<br>`;
            }

            showAlert(title,
                `<strong>Motivo:</strong> ${banReason}${expiresText}<br><br>` +
                'O Horizonte não tolera condutas que prejudicam a experiência dos demais jogadores. ' +
                'O respeito às regras e a integridade do roleplay são essenciais para um ambiente justo e saudável para a comunidade.<br><br>' +
                `<em>Você pode acessar <a href="#" class="external-link" data-url="${discordLink}" style="color: #7289da; cursor: pointer;">nosso Discord</a> para saber mais${isPermanent ? ', incluindo seu direito de revisão' : ''}.</em>`
            );
        } else {
            showAlert('Erro de Verificação', authResult.error || 'Não foi possível verificar o acesso.');
        }
        return;
    }

    elements.btnPlay.innerHTML = '<span class="btn-spinner"></span> JOGAR';

    // Usar o caminho do jogo embutido (token já foi obtido no verify-auth)
    const result = await ipcRenderer.invoke('launch-game', selectedCategory, selectedServerIndex, nickname, authResult.token);

    // Resetar flag de lançamento
    isLaunching = false;

    if (result.success) {
        // Atualizar Discord RPC para mostrar que está jogando
        const categoryData = appConfig.categories[selectedCategory];
        const serverData = categoryData?.servers?.[selectedServerIndex];
        const serverName = serverData?.name || 'Servidor';
        const serverDiscord = serverData?.discord || null;
        updateDiscordRPC(`Jogando em ${serverName}`, categoryData?.name || 'Horizonte', serverDiscord);

        elements.btnPlay.innerHTML = 'JOGAR <i class="bi bi-play-fill play-icon"></i>';
        elements.btnPlay.disabled = false;
        // Minimizar após iniciar
        ipcRenderer.send('minimize-window');
    } else {
        showAlert('Erro ao iniciar', result.error);
        elements.btnPlay.innerHTML = 'JOGAR <i class="bi bi-play-fill play-icon"></i>';
        elements.btnPlay.disabled = false;
    }
}

// ==========================================
// Toast Notification
// ==========================================
function showToast(message, referenceElement = null) {
    // Remover toast existente
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Criar toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Posicionar abaixo do elemento de referência
    if (referenceElement) {
        const rect = referenceElement.getBoundingClientRect();
        const toastRect = toast.getBoundingClientRect();

        // Centralizar abaixo do elemento
        const left = rect.left + (rect.width / 2) - (toastRect.width / 2);
        const top = rect.bottom + 10;

        toast.style.left = `${left}px`;
        toast.style.top = `${top}px`;
    }

    // Animar entrada
    setTimeout(() => toast.classList.add('show'), 10);

    // Remover após 2 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ==========================================
// Custom Modal (Alert/Confirm)
// ==========================================
function showModal({ title, message, confirmText = 'OK', cancelText = 'Cancelar', showCancel = true, danger = false }) {
    return new Promise((resolve) => {
        // Remover modal existente
        const existingModal = document.querySelector('.custom-modal');
        if (existingModal) existingModal.remove();

        // Criar modal
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.innerHTML = `
            <div class="custom-modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="custom-modal-buttons">
                    ${showCancel ? `<button class="btn-cancel">${cancelText}</button>` : ''}
                    <button class="btn-confirm ${danger ? 'danger' : ''}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Animar entrada
        setTimeout(() => modal.classList.add('show'), 10);

        // Eventos dos botões
        const btnConfirm = modal.querySelector('.btn-confirm');
        const btnCancel = modal.querySelector('.btn-cancel');

        const closeModal = (result) => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 300);
        };

        btnConfirm.addEventListener('click', () => closeModal(true));
        if (btnCancel) {
            btnCancel.addEventListener('click', () => closeModal(false));
        }

        // Fechar ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });
    });
}

// Atalho para alerta simples
function showAlert(title, message) {
    return showModal({ title, message, showCancel: false });
}

// Atalho para confirmação
function showConfirm(title, message, danger = false) {
    return showModal({ title, message, confirmText: 'Confirmar', danger });
}

// ==========================================
// Driver Installation
// ==========================================
async function checkDriversStatus() {
    const result = await ipcRenderer.invoke('check-drivers-available');
    if (elements.driversStatus) {
        if (result.installed) {
            elements.driversStatus.textContent = 'Já instalados';
            elements.btnInstallDrivers.innerHTML = '<i class="bi bi-check-lg"></i>';
        } else {
            elements.driversStatus.textContent = 'DirectX e Visual C++';
        }
    }
    return result;
}

// skipConfirm = true quando chamado do prompt pós-instalação (já confirmou antes)
async function installDrivers(skipConfirm = false) {
    const driversInfo = await ipcRenderer.invoke('check-drivers-available');

    if (!driversInfo.available) {
        showAlert('Drivers não disponíveis', 'Os arquivos de drivers não foram encontrados.');
        return;
    }

    if (!skipConfirm) {
        if (driversInfo.installed) {
            const reinstall = await showConfirm(
                'Drivers já instalados',
                'Os drivers já foram instalados anteriormente.<br>Deseja reinstalar?'
            );
            if (!reinstall) return;
        }

        const confirmed = await showConfirm(
            'Instalar Drivers',
            'Serão instalados:<br><br>• DirectX<br>• Visual C++ 2008 - 2022<br><br>Isso pode demorar alguns minutos.<br>Deseja continuar?'
        );

        if (!confirmed) return;
    }

    // Desabilitar botão se estiver visível
    if (elements.btnInstallDrivers) {
        elements.btnInstallDrivers.disabled = true;
        elements.btnInstallDrivers.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    }
    if (elements.driversStatus) {
        elements.driversStatus.textContent = 'Instalando...';
    }

    // Marcar que está instalando drivers
    isInstallingDrivers = true;
    updatePlayButton();

    // Mostrar progresso na barra principal também
    elements.progressText.textContent = 'Instalando drivers...';

    try {
        const result = await ipcRenderer.invoke('install-drivers');

        if (result.success) {
            if (elements.driversStatus) {
                elements.driversStatus.textContent = 'Instalados com sucesso!';
            }
            if (elements.btnInstallDrivers) {
                elements.btnInstallDrivers.innerHTML = '<i class="bi bi-check-lg"></i>';
            }
            elements.progressText.textContent = 'Drivers instalados! Pronto para jogar.';
            showToast('Drivers instalados com sucesso!');
        } else {
            const errors = result.results.filter(r => r.status === 'error');
            if (errors.length > 0) {
                if (elements.driversStatus) {
                    elements.driversStatus.textContent = `${result.summary.success} OK, ${errors.length} erros`;
                }
                elements.progressText.textContent = 'Alguns drivers falharam';
                showAlert('Instalação parcial', `Alguns drivers não puderam ser instalados:<br><br>${errors.map(e => e.name).join('<br>')}`);
            } else {
                if (elements.driversStatus) {
                    elements.driversStatus.textContent = 'Já instalados';
                }
                elements.progressText.textContent = 'Pronto para jogar';
                showToast('Drivers instalados!');
            }
            if (elements.btnInstallDrivers) {
                elements.btnInstallDrivers.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>';
            }
        }
    } catch (error) {
        console.error('Erro ao instalar drivers:', error);
        if (elements.driversStatus) {
            elements.driversStatus.textContent = 'Erro na instalação';
        }
        if (elements.btnInstallDrivers) {
            elements.btnInstallDrivers.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>';
        }
        elements.progressText.textContent = 'Erro ao instalar drivers';
        showAlert('Erro', 'Ocorreu um erro ao instalar os drivers.');
    }

    if (elements.btnInstallDrivers) {
        elements.btnInstallDrivers.disabled = false;
    }

    isInstallingDrivers = false;
    updatePlayButton();
}

// Listener para progresso de instalação de drivers
ipcRenderer.on('driver-install-progress', (event, data) => {
    const { current, total, name, percent } = data;
    // Atualizar na sidebar (se visível)
    if (elements.driversStatus) {
        elements.driversStatus.textContent = `Instalando ${name}... (${current}/${total})`;
    }
    // Atualizar na barra de progresso principal
    elements.progressText.textContent = `Instalando ${name}... (${current}/${total})`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressFill.style.width = `${percent}%`;
});

// Prompt para instalar drivers após primeira instalação do jogo
async function promptDriverInstallation() {
    const driversInfo = await ipcRenderer.invoke('check-drivers-available');

    // Só pergunta se drivers não foram instalados ainda e estão disponíveis
    if (driversInfo.installed || !driversInfo.available) return;

    const install = await showConfirm(
        'Instalar Drivers?',
        'Para garantir o funcionamento do jogo, recomendamos instalar os drivers necessários (DirectX e Visual C++).<br><br>Isso pode demorar alguns minutos.<br><br>Deseja instalar agora?'
    );

    if (install) {
        // skipConfirm=true porque já confirmou acima
        await installDrivers(true);
    }
}

// ==========================================
// Discord Rich Presence Helper
// ==========================================
function updateDiscordRPC(state, details, discordUrl = null) {
    ipcRenderer.invoke('update-discord-presence', state, details, discordUrl);
}

// ==========================================
// Sub Navigation & Mods System
// ==========================================
let currentPage = 'home';
let modsData = [];
let installedMods = [];
let currentMod = null;
let activeDownloads = new Set(); // Controle de downloads ativos
let modsLoaded = false; // Flag para controlar se os mods já foram carregados

// Gerenciamento de notificações
const downloadNotifications = {
    container: null,
    messageCounter: 0,

    init() {
        this.container = document.getElementById('downloadNotifications');
    },

    // Adicionar notificação de download de mod
    add(modId, modName) {
        if (!this.container) return;

        const notification = document.createElement('div');
        notification.className = 'download-item';
        notification.dataset.modId = modId;
        notification.dataset.modName = modName;
        notification.innerHTML = `
            <div class="download-info">
                <span class="download-name">
                    <i class="bi bi-arrow-repeat spin"></i> Instalando ${modName}
                </span>
            </div>
        `;

        this.container.appendChild(notification);
    },

    // Atualizar status de download
    updateStatus(modId, status, errorMessage = null) {
        const notification = this.container?.querySelector(`[data-mod-id="${modId}"]`);
        if (!notification) return;

        const nameEl = notification.querySelector('.download-name');
        const modName = notification.dataset.modName;

        if (status === 'downloading') {
            nameEl.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> Instalando ${modName}`;
        } else if (status === 'success') {
            nameEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> ${modName} Instalado`;
            nameEl.style.color = 'var(--accent-green)';
            setTimeout(() => this.remove(modId), 2500);
        } else if (status === 'error') {
            // Usar mensagem de erro personalizada se fornecida
            const message = errorMessage || `Erro ao instalar ${modName}`;
            nameEl.innerHTML = `<i class="bi bi-x-circle-fill"></i> ${message}`;
            nameEl.style.color = 'var(--accent-red)';
            setTimeout(() => this.remove(modId), 5000); // Mais tempo para ler a mensagem
        }
    },

    // Mostrar mensagem geral (erro, aviso, info, success)
    showMessage(type, message, duration = null) {
        if (!this.container) return;

        // Duração padrão baseada no tipo (erros precisam de mais tempo)
        if (duration === null) {
            duration = type === 'error' ? 5000 : 3000;
        }

        const id = `msg-${this.messageCounter++}`;
        const icons = {
            error: 'x-circle-fill',
            warning: 'exclamation-triangle-fill',
            info: 'info-circle-fill',
            success: 'check-circle-fill'
        };

        const colors = {
            error: 'var(--accent-red)',
            warning: '#f5a623',
            info: 'var(--text-primary)',
            success: 'var(--accent-green)'
        };

        const notification = document.createElement('div');
        notification.className = 'download-item';
        notification.dataset.modId = id;
        notification.innerHTML = `
            <div class="download-info">
                <span class="download-name" style="color: ${colors[type]}">
                    <i class="bi bi-${icons[type] || 'info-circle-fill'}"></i> ${message}
                </span>
            </div>
        `;

        this.container.appendChild(notification);
        setTimeout(() => this.remove(id), duration);
    },

    remove(modId) {
        const notification = this.container?.querySelector(`[data-mod-id="${modId}"]`);
        if (!notification) return;

        notification.classList.add('removing');
        setTimeout(() => notification.remove(), 300);
    }
};

// Flag para garantir que listeners sejam adicionados apenas uma vez
let navigationInitialized = false;

// Inicializar navegação
function initSubNavigation() {
    if (navigationInitialized) {
        console.log('initSubNavigation já foi inicializado, pulando...');
        return;
    }

    console.log('initSubNavigation() chamado');
    navigationInitialized = true;

    // Botões da página principal
    elements.btnStore?.addEventListener('click', () => {
        navigateTo('store');
    });

    elements.btnMods?.addEventListener('click', () => {
        navigateTo('mods');
    });

    // Botão de voltar na sub-nav
    elements.btnSubNavBack?.addEventListener('click', () => {
        navigateTo('home');
    });

    // Botão de voltar na página de mods (legado)
    elements.btnNavBack?.addEventListener('click', () => {
        navigateTo('home');
    });

    // Botões de navegação na página de mods
    elements.modsNavBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            navigateTo(page);
        });
    });
}

// Navegar para página
function navigateTo(page) {
    currentPage = page;

    // Atualizar botões ativos na página de mods
    elements.modsNavBtns?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Controlar background e footer
    const bgImage = document.getElementById('bgImage');
    const bgContainer = document.querySelector('.background');
    const footer = document.querySelector('.footer');

    // Mostrar/esconder conteúdo
    if (page === 'home') {
        elements.mainContent.style.display = '';
        elements.modsPage.style.display = 'none';
        // Ocultar seta de voltar
        if (elements.btnSubNavBack) elements.btnSubNavBack.style.display = 'none';
        // Restaurar background original e mostrar footer
        if (bgContainer) {
            bgContainer.style.backgroundColor = '';
            if (bgImage) bgImage.style.display = '';
        }
        if (footer) footer.style.display = '';
    } else if (page === 'store') {
        // Abrir loja externa
        ipcRenderer.send('open-external', appConfig.storeUrl || 'https://horizonte-rp.com/comprar_hzcoins');
    } else if (page === 'mods') {
        elements.mainContent.style.display = 'none';
        elements.modsPage.style.display = 'block';
        // Mostrar seta de voltar
        if (elements.btnSubNavBack) elements.btnSubNavBack.style.display = 'flex';
        // Mudar background para cor sólida e esconder footer
        if (bgContainer) {
            bgContainer.style.backgroundColor = '#1a1a1a';
            if (bgImage) bgImage.style.display = 'none';
        }
        if (footer) footer.style.display = 'none';
        // Carregar mods apenas na primeira vez
        if (!modsLoaded) {
            modsLoaded = true;
            loadMods();
        }
    }
}

// Função para abrir a página de mods (pode ser chamada externamente)
function openModsPage() {
    navigateTo('mods');
}

// Carregar mods da API
async function loadMods() {
    try {
        const result = await ipcRenderer.invoke('fetch-mods');
        if (result.success) {
            // Filtrar mods pela categoria do servidor selecionada
            modsData = result.mods.filter(mod => mod.gameCategory === selectedCategory);
            installedMods = await ipcRenderer.invoke('get-installed-mods', selectedCategory);
            renderMods();
        }
    } catch (error) {
        console.error('Erro ao carregar mods:', error);
    }
}

// Renderizar mods
// updateSection: 'all' = atualiza tudo, 'popular' = só populares, 'allMods' = só todos os mods
function renderMods(updateSection = 'all') {
    const searchTerm = elements.modsSearch ? elements.modsSearch.value.toLowerCase() : '';
    const selectedCategory = elements.modsCategoryFilter ? elements.modsCategoryFilter.value : 'all';

    // Função de busca
    const matchesSearch = (mod) => {
        if (!searchTerm) return true;
        return mod.name.toLowerCase().includes(searchTerm) ||
               mod.author.toLowerCase().includes(searchTerm) ||
               mod.description.toLowerCase().includes(searchTerm);
    };

    // Renderizar populares (borda laranja) - só se updateSection for 'all' ou 'popular'
    if (updateSection === 'all' || updateSection === 'popular') {
        const popularMods = modsData.filter(mod => mod.popular && matchesSearch(mod));
        if (elements.modsPopular) {
            elements.modsPopular.innerHTML = popularMods.map(mod => createModCard(mod, false)).join('');
        }
    }

    // Renderizar todos os mods (borda branca) - só se updateSection for 'all' ou 'allMods'
    // Exclui mods populares para evitar duplicação
    if (updateSection === 'all' || updateSection === 'allMods') {
        let allMods = modsData.filter(mod => !mod.popular && matchesSearch(mod));
        if (selectedCategory !== 'all') {
            const categoryMap = {
                'cars': ['cars', 'carros'],
                'motorcycles': ['motorcycles', 'motos'],
                'trucks': ['trucks', 'caminhoes'],
                'weapons': ['weapons', 'armas'],
                'graphics': ['graphics', 'graficos'],
                'skins': ['skins'],
                'sounds': ['sounds', 'sons'],
                'maps': ['maps', 'mapas'],
                'hud': ['hud']
            };
            const validCategories = categoryMap[selectedCategory] || [selectedCategory];
            allMods = allMods.filter(mod => validCategories.includes(mod.category));
        }
        if (elements.modsAll) {
            elements.modsAll.innerHTML = allMods.map(mod => createModCard(mod, true)).join('');
        }
    }
    // Event listeners são gerenciados por event delegation em initModsEvents()
}

// Criar card de mod
function createModCard(mod, whiteBorder = false) {
    const isInstalled = installedMods.includes(mod.id);
    const hasDependencies = mod.dependencies && mod.dependencies.length > 0;
    const missingDependencies = hasDependencies ?
        mod.dependencies.filter(dep => !installedMods.includes(dep)) : [];

    return `
        <div class="mod-card ${isInstalled ? 'installed' : ''} ${whiteBorder ? 'white-border' : ''} ${mod.popular ? 'popular' : ''}" data-mod-id="${mod.id}">
            <div class="mod-card-image">
                <img src="${mod.image}" alt="${mod.name}" onerror="this.src='assets/images/mod-placeholder.png'">
            </div>
            <div class="mod-card-info">
                <h4 class="mod-card-title">${mod.name}</h4>
                <p class="mod-card-author">Autor: <span>${mod.author}</span></p>
                <p class="mod-card-desc">${mod.description}</p>
                ${missingDependencies.length > 0 ? `
                    <p class="mod-requirement-warning">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        Requer: ${missingDependencies.join(', ')}
                    </p>
                ` : ''}
                <div class="mod-card-footer">
                    <button class="mod-card-details">
                        Mais detalhes <i class="bi bi-chevron-down"></i>
                    </button>
                    ${isInstalled ? `
                        <div class="mod-actions-installed">
                            <button class="mod-btn-reinstall" data-mod-id="${mod.id}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg> Reinstalar
                            </button>
                            <button class="mod-btn-uninstall" data-mod-id="${mod.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    ` : `
                        <button class="mod-btn-install" data-mod-id="${mod.id}">
                            <i class="bi bi-download"></i> Instalar
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Abrir modal de detalhes do mod
function openModModal(mod) {
    currentMod = mod;

    elements.modModalImage.src = mod.image;
    elements.modModalTitle.textContent = mod.name;
    elements.modModalAuthor.textContent = mod.author;
    elements.modModalDesc.textContent = mod.fullDescription || mod.description;

    // Dependências
    if (mod.dependencies && mod.dependencies.length > 0) {
        elements.modModalRequirements.style.display = 'block';
        elements.modModalRequirements.innerHTML = `
            <h4><i class="bi bi-exclamation-triangle-fill"></i> Dependências</h4>
            <ul>
                ${mod.dependencies.map(dep => {
                    const isInstalled = installedMods.includes(dep);
                    return `<li class="${isInstalled ? 'installed' : 'missing'}">
                        <i class="bi bi-${isInstalled ? 'check-circle-fill' : 'x-circle-fill'}"></i>
                        ${dep}
                    </li>`;
                }).join('')}
            </ul>
        `;
    } else {
        elements.modModalRequirements.style.display = 'none';
    }

    // Botões de ação
    const isInstalled = installedMods.includes(mod.id);

    if (isInstalled) {
        elements.modModalActions.innerHTML = `
            <button class="mod-btn-reinstall" data-action="reinstall">
                <i class="bi bi-arrow-clockwise"></i> Reinstalar
            </button>
            <button class="mod-btn-uninstall" data-action="uninstall">
                <i class="bi bi-trash"></i>
            </button>
        `;
    } else {
        elements.modModalActions.innerHTML = `
            <button class="mod-btn-install" data-action="install">
                <i class="bi bi-download"></i> Instalar
            </button>
        `;
    }

    elements.modModalOverlay.style.display = 'flex';
}

// Fechar modal
function closeModModal() {
    elements.modModalOverlay.style.display = 'none';
    currentMod = null;
}

// Atualizar botões de um mod específico
function updateModButtons(modId) {
    const isInstalled = installedMods.includes(modId);
    const mod = modsData.find(m => m.id === modId);
    if (!mod) return;

    // Atualizar todos os cards com este mod
    document.querySelectorAll(`.mod-card[data-mod-id="${modId}"]`).forEach(card => {
        const footer = card.querySelector('.mod-card-footer');
        if (!footer) return;

        // Atualizar aviso de dependência
        updateDependencyWarning(card, mod);

        // Substituir botões
        if (isInstalled) {
            footer.innerHTML = `
                <button class="mod-card-details">
                    Mais detalhes <i class="bi bi-chevron-down"></i>
                </button>
                <div class="mod-actions-installed">
                    <button class="mod-btn-reinstall" data-mod-id="${modId}">
                        <i class="bi bi-arrow-clockwise"></i> Reinstalar
                    </button>
                    <button class="mod-btn-uninstall" data-mod-id="${modId}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
        } else {
            footer.innerHTML = `
                <button class="mod-card-details">
                    Mais detalhes <i class="bi bi-chevron-down"></i>
                </button>
                <button class="mod-btn-install" data-mod-id="${modId}">
                    <i class="bi bi-download"></i> Instalar
                </button>
            `;
        }
        // Event listeners são gerenciados por event delegation em initModsEvents()
    });

    // Atualizar avisos de dependência em outros mods que dependem deste
    updateDependentModsWarnings(modId);
}

// Atualizar aviso de dependência de um card
function updateDependencyWarning(card, mod) {
    const warningEl = card.querySelector('.mod-requirement-warning');
    const hasDependencies = mod.dependencies && mod.dependencies.length > 0;
    const missingDependencies = hasDependencies ?
        mod.dependencies.filter(dep => !installedMods.includes(dep)) : [];

    if (missingDependencies.length > 0) {
        // Precisa mostrar aviso
        if (warningEl) {
            // Atualizar texto existente
            warningEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> Requer: ${missingDependencies.join(', ')}`;
        } else {
            // Criar novo aviso
            const descEl = card.querySelector('.mod-card-desc');
            if (descEl) {
                const warning = document.createElement('p');
                warning.className = 'mod-requirement-warning';
                warning.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> Requer: ${missingDependencies.join(', ')}`;
                descEl.after(warning);
            }
        }
    } else {
        // Remover aviso se existir
        if (warningEl) {
            warningEl.remove();
        }
    }
}

// Atualizar avisos de mods que dependem de um mod específico
function updateDependentModsWarnings(installedModId) {
    // Encontrar todos os mods que dependem do mod instalado
    modsData.forEach(mod => {
        if (mod.dependencies && mod.dependencies.includes(installedModId)) {
            // Este mod depende do mod que foi instalado/desinstalado
            document.querySelectorAll(`.mod-card[data-mod-id="${mod.id}"]`).forEach(card => {
                updateDependencyWarning(card, mod);
            });
        }
    });
}

// Instalar mod
async function installMod(mod) {
    if (!mod) return;

    // Verificar se já está sendo baixado
    if (activeDownloads.has(mod.id)) {
        downloadNotifications.showMessage('warning', `${mod.name} já está sendo instalado`);
        return;
    }

    // Verificar se o jogo está instalado e se a pasta está configurada
    if (!gameState.installed || !gameState.gamePath) {
        downloadNotifications.showMessage('error', 'Instale o jogo primeiro ou configure a pasta do jogo nas configurações.', 4000);
        return;
    }

    // Verificar dependências
    if (mod.dependencies && mod.dependencies.length > 0) {
        const missingDeps = mod.dependencies.filter(dep => !installedMods.includes(dep));
        if (missingDeps.length > 0) {
            // Buscar nomes dos mods faltando
            const missingModNames = missingDeps.map(depId => {
                const depMod = modsData.find(m => m.id === depId);
                return depMod ? depMod.name : depId;
            });

            downloadNotifications.showMessage('warning', `${mod.name}: Instale primeiro ${missingModNames.join(', ')}`, 4000);
            return;
        }
    }

    // Adicionar à lista de downloads ativos
    activeDownloads.add(mod.id);

    // Adicionar notificação
    downloadNotifications.add(mod.id, mod.name);

    // Atualizar botões para estado "installing"
    document.querySelectorAll(`[data-mod-id="${mod.id}"]`).forEach(btn => {
        if (btn.classList.contains('mod-btn-install')) {
            btn.classList.add('installing');
            btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Instalando...';
            btn.disabled = true;
        }
    });

    try {
        const result = await ipcRenderer.invoke('install-mod', {
            mod: mod,
            category: selectedCategory,
            gamePath: gameState.gamePath
        });

        if (result.success) {
            // Sucesso
            downloadNotifications.updateStatus(mod.id, 'success');

            // Adicionar apenas se não estiver instalado (evitar duplicatas)
            if (!installedMods.includes(mod.id)) {
                installedMods.push(mod.id);
            }

            // Atualizar apenas os botões deste mod específico
            updateModButtons(mod.id);

            // Atualizar modal se estiver aberto
            if (currentMod && currentMod.id === mod.id) {
                openModModal(mod);
            }
        } else {
            // Mostrar mensagem de erro amigável
            downloadNotifications.updateStatus(mod.id, 'error', result.error || 'Erro ao instalar mod');
        }
    } catch (error) {
        downloadNotifications.updateStatus(mod.id, 'error', 'Erro inesperado ao instalar mod');
        console.error(error);
    } finally {
        // Remover da lista de downloads ativos
        activeDownloads.delete(mod.id);

        // Restaurar botões
        document.querySelectorAll(`[data-mod-id="${mod.id}"]`).forEach(btn => {
            if (btn.classList.contains('mod-btn-install')) {
                btn.classList.remove('installing');
                btn.disabled = false;
            }
        });
    }
}

// Desinstalar mod
async function uninstallMod(mod) {
    // Verificar se o caminho do jogo está configurado
    if (!gameState.gamePath) {
        downloadNotifications.showMessage('error', 'Pasta do jogo não configurada. Configure nas configurações.');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('uninstall-mod', {
            modId: mod.id,
            category: selectedCategory,
            gamePath: gameState.gamePath
        });

        if (result.success) {
            // Remover do array de mods instalados
            const index = installedMods.indexOf(mod.id);
            if (index > -1) {
                installedMods.splice(index, 1);
            }

            // Atualizar apenas os botões deste mod específico
            updateModButtons(mod.id);

            // Atualizar modal se estiver aberto
            if (currentMod && currentMod.id === mod.id) {
                openModModal(mod);
            }

            downloadNotifications.showMessage('success', `${mod.name} Desinstalado`);
        } else {
            // Mostrar mensagem de erro amigável
            downloadNotifications.showMessage('error', result.error || `Erro ao desinstalar ${mod.name}`);
        }
    } catch (error) {
        downloadNotifications.showMessage('error', 'Erro inesperado ao desinstalar mod');
        console.error(error);
    }
}

// Inicializar eventos de mods
function initModsEvents() {
    // Pesquisa
    elements.modsSearch?.addEventListener('input', () => {
        renderMods();
    });

    // Filtro de categoria - só atualiza "Todos os mods", não afeta populares
    elements.modsCategoryFilter?.addEventListener('change', () => {
        renderMods('allMods');
    });

    // Event delegation para botões dos cards de mods (evita duplicação de listeners)
    const handleModCardClick = (e) => {
        const card = e.target.closest('.mod-card');
        if (!card) return;

        const modId = card.dataset.modId;
        const mod = modsData.find(m => m.id === modId);
        if (!mod) return;

        // Verificar qual botão foi clicado
        if (e.target.closest('.mod-card-details')) {
            e.stopPropagation();
            openModModal(mod);
        } else if (e.target.closest('.mod-btn-install')) {
            e.stopPropagation();
            installMod(mod);
        } else if (e.target.closest('.mod-btn-reinstall')) {
            e.stopPropagation();
            installMod(mod);
        } else if (e.target.closest('.mod-btn-uninstall')) {
            e.stopPropagation();
            uninstallMod(mod);
        }
    };

    // Aplicar event delegation nos containers de mods
    elements.modsPopular?.addEventListener('click', handleModCardClick);
    elements.modsAll?.addEventListener('click', handleModCardClick);

    // Event delegation para botões do modal (evita duplicação de listeners)
    elements.modModalActions?.addEventListener('click', (e) => {
        const button = e.target.closest('[data-action]');
        if (!button || !currentMod) return;

        const action = button.dataset.action;
        if (action === 'install' || action === 'reinstall') {
            installMod(currentMod);
        } else if (action === 'uninstall') {
            uninstallMod(currentMod);
        }
    });

    // Fechar modal
    elements.modModalClose?.addEventListener('click', closeModModal);
    elements.modModalOverlay?.addEventListener('click', (e) => {
        if (e.target === elements.modModalOverlay) {
            closeModModal();
        }
    });
}

// ==========================================
// Iniciar
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    init();
    initSubNavigation();
    initModsEvents();
    downloadNotifications.init();

    // Handler global para links externos (abre no navegador do sistema)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.external-link');
        if (link) {
            e.preventDefault();
            const url = link.dataset.url;
            if (url) {
                shell.openExternal(url);
            }
        }
    });
});
