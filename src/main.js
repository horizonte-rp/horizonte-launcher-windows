const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const SampQuery = require('./samp-query');
const yauzl = require('yauzl');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configurar logging para o autoUpdater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Configurações do autoUpdater
autoUpdater.autoDownload = false; // Não baixar automaticamente - depende do forceUpdate
autoUpdater.autoInstallOnAppQuit = false;

// Definir nome do app para Task Manager e barra de tarefas
app.name = 'Horizonte Launcher';
app.setName('Horizonte Launcher');

// ==========================================
// Custom Protocol Handler (horizonte://)
// ==========================================
const PROTOCOL_NAME = 'horizonte';

// Registrar o protocol handler
if (process.defaultApp) {
    // Em desenvolvimento, precisa passar o caminho do script
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    // Em produção
    app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

// Single instance lock - evita múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Outra instância já está rodando, fechar esta
    app.quit();
} else {
    // Esta é a instância principal
    app.on('second-instance', (event, commandLine) => {
        // Focar na janela existente
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.show();
        }
    });
}

// Configuração - inicializar depois
let store;
let appConfig;
let remoteConfig;
let mainWindow;
let tray = null;
let isQuitting = false;

// URL da API remota
const API_URL = 'http://horizontegames.com/api/config.php';

// Estado do download
let downloadState = {
    isDownloading: false,
    isExtracting: false,
    isPaused: false,
    downloaded: 0,
    total: 0,
    tempFilePath: null,
    request: null,
    category: null,  // Qual categoria está sendo baixada
    // Velocidade de download
    lastDownloaded: 0,
    lastSpeedUpdate: 0,
    speed: 0
};

// Validar se o arquivo ZIP é válido (não corrompido ou HTML)
function validateZipFile(filePath) {
    return new Promise((resolve) => {
        try {
            // Ler os primeiros bytes do arquivo
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(4);
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            // ZIP signature: PK (0x50 0x4B)
            const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;

            // HTML signature: <!DO ou <htm ou <HTM
            const isHtml = (buffer[0] === 0x3C && buffer[1] === 0x21) || // <!
                          (buffer[0] === 0x3C && (buffer[1] === 0x68 || buffer[1] === 0x48)); // <h ou <H

            if (isHtml) {
                resolve({ valid: false, error: 'Arquivo corrompido (contém HTML). O download será reiniciado.' });
            } else if (!isZip) {
                resolve({ valid: false, error: 'Arquivo ZIP inválido. O download será reiniciado.' });
            } else {
                resolve({ valid: true });
            }
        } catch (err) {
            resolve({ valid: false, error: 'Erro ao validar arquivo: ' + err.message });
        }
    });
}

// Traduzir mensagens de erro técnicas para mensagens amigáveis
function translateError(error) {
    const errorMessage = error?.message || error || '';
    const errorLower = errorMessage.toLowerCase();

    if (errorLower.includes('enotfound') || errorLower.includes('getaddrinfo')) {
        return 'Sem conexão com a internet. Verifique sua rede.';
    }
    if (errorLower.includes('econnrefused')) {
        return 'Servidor indisponível. Tente novamente mais tarde.';
    }
    if (errorLower.includes('econnreset') || errorLower.includes('socket hang up')) {
        return 'Conexão perdida. Verifique sua internet e tente novamente.';
    }
    if (errorLower.includes('etimedout') || errorLower.includes('timeout')) {
        return 'Conexão lenta. Verifique sua internet e tente novamente.';
    }
    if (errorLower.includes('enospc')) {
        return 'Espaço em disco insuficiente.';
    }
    if (errorLower.includes('eperm') || errorLower.includes('eacces')) {
        return 'Sem permissão para acessar a pasta. Execute como administrador.';
    }
    if (errorLower.includes('network') || errorLower.includes('internet')) {
        return 'Erro de rede. Verifique sua conexão.';
    }

    return errorMessage;
}

// Carregar configurações do config.json (fallback local)
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        appConfig = JSON.parse(configData);
    } catch (error) {
        appConfig = {
            categories: {},
            social: {},
            news: []
        };
    }
}

// Função auxiliar para fazer requisições HTTP
async function httpRequest(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const http = require('http');
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, { timeout }, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });

        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Buscar servers, news e mods de uma categoria específica dos novos endpoints
async function fetchContentData(category) {
    const baseUrl = 'http://horizontegames.com/api/content';
    const result = {
        servers: [],
        news: [],
        mods: []
    };

    // Fazer todas as requisições em paralelo
    const promises = [
        httpRequest(`${baseUrl}/servers.php?category=${category}`, 3000)
            .then(data => {
                if (data && Array.isArray(data.servers)) {
                    result.servers = data.servers;
                }
            })
            .catch(error => console.log(`[fetchContentData] Erro ao buscar servers de ${category}:`, error.message)),

        httpRequest(`${baseUrl}/news.php?category=${category}`, 3000)
            .then(data => {
                if (data && Array.isArray(data.news)) {
                    result.news = data.news;
                }
            })
            .catch(error => console.log(`[fetchContentData] Erro ao buscar news de ${category}:`, error.message))
    ];

    // Buscar mods apenas para RP (uma vez só)
    if (category === 'rp') {
        promises.push(
            httpRequest(`${baseUrl}/mods.php`, 3000)
                .then(data => {
                    if (data && Array.isArray(data.mods)) {
                        result.mods = data.mods;
                    }
                })
                .catch(error => console.log(`[fetchContentData] Erro ao buscar mods:`, error.message))
        );
    }

    // Aguardar todas as requisições em paralelo
    await Promise.all(promises);

    return result;
}

// Buscar configurações remotas da API
async function fetchRemoteConfig() {
    try {
        // 1. Buscar configurações gerais do config.php
        const config = await httpRequest(API_URL, 5000);

        if (!config) {
            return null;
        }

        // 2. Buscar conteúdo dinâmico (servers, news, mods) para todas as categorias EM PARALELO
        const categories = ['rp', 'dm', 'dayz'];

        // Fazer todas as requisições de categorias em paralelo
        const contentResults = await Promise.all(
            categories.map(category =>
                fetchContentData(category).catch(error => {
                    console.log(`[fetchRemoteConfig] Erro ao buscar conteúdo de ${category}:`, error.message);
                    return { servers: [], news: [], mods: [] };
                })
            )
        );

        // 3. Processar resultados
        let allMods = [];
        contentResults.forEach((contentData, index) => {
            const category = categories[index];

            if (config.categories && config.categories[category]) {
                // Se a API retornou servers, usar eles
                if (contentData.servers.length > 0) {
                    config.categories[category].servers = contentData.servers;
                }

                // Se a API retornou news, usar elas
                if (contentData.news.length > 0) {
                    config.categories[category].news = contentData.news;
                }
            }

            // Coletar mods
            if (contentData.mods.length > 0) {
                allMods = allMods.concat(contentData.mods);
            }
        });

        // 4. Se conseguimos buscar mods da API, substituir os do config.php
        if (allMods.length > 0) {
            config.mods = allMods;
        }

        return config;
    } catch (error) {
        console.log('[fetchRemoteConfig] Erro ao buscar configuração remota:', error.message);
        return null;
    }
}

// Buscar configuração atual (usa cache se já carregada, senão busca da API)
async function fetchConfig() {
    if (remoteConfig) {
        return remoteConfig;
    }
    remoteConfig = await fetchRemoteConfig();
    return remoteConfig;
}

// Criar ícone na bandeja do sistema
function createTray() {
    try {
        // Caminho do ícone (usando o ícone .ico do launcher)
        const iconPath = path.join(__dirname, 'assets/images/icone32x32.png');

        console.log('[Tray] Criando ícone da bandeja:', iconPath);

        // Criar tray icon
        tray = new Tray(iconPath);

        // Tooltip ao passar mouse
        tray.setToolTip('Horizonte Launcher');

        // Menu de contexto (clique direito)
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Abrir Launcher',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            {
                label: 'Sair',
                click: () => {
                    isQuitting = true;
                    stopNotificationSystem();
                    app.quit();
                }
            }
        ]);

        tray.setContextMenu(contextMenu);

        // Clique simples no ícone: mostrar/ocultar janela
        tray.on('click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        });

        console.log('[Tray] Ícone da bandeja criado com sucesso');
    } catch (error) {
        console.error('[Tray] Erro ao criar ícone da bandeja:', error);
    }
}

function createWindow() {
    // Carregar configurações
    loadConfig();

    // Inicializar store
    const Store = require('electron-store');
    store = new Store();

    mainWindow = new BrowserWindow({
        title: 'Horizonte Launcher',
        width: 1366,
        height: 768,
        minWidth: 1200,
        minHeight: 700,
        frame: false,
        transparent: false,
        backgroundColor: '#0f0f16',
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'assets/images/logo.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Abrir DevTools em desenvolvimento
    // mainWindow.webContents.openDevTools();

    // Desabilitar DevTools em produção (segurança)
    if (app.isPackaged) {
        // Bloquear atalhos de teclado que abrem DevTools
        mainWindow.webContents.on('before-input-event', (event, input) => {
            // Bloquear F12
            if (input.key === 'F12') {
                event.preventDefault();
            }
            // Bloquear Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
            if (input.control && input.shift && ['I', 'i', 'J', 'j', 'C', 'c'].includes(input.key)) {
                event.preventDefault();
            }
            // Bloquear Ctrl+U (view source)
            if (input.control && ['U', 'u'].includes(input.key)) {
                event.preventDefault();
            }
        });

        // Fallback: fechar imediatamente se abrir por outro meio
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow.webContents.closeDevTools();
        });
    }

    // Interceptar fechamento da janela (X)
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            // Apenas minimizar na bandeja se não estiver saindo
            event.preventDefault();
            mainWindow.hide();
        }
        // Se isQuitting = true, deixa fechar normalmente
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Definir AppUserModelId ANTES do ready para garantir que funcione
if (process.platform === 'win32') {
    app.setAppUserModelId('Horizonte Launcher');
}

app.whenReady().then(() => {
    // Reforçar o AppUserModelId após o ready também
    if (process.platform === 'win32') {
        app.setAppUserModelId('Horizonte Launcher');
    }
    createWindow();
    createTray();

    // Iniciar sistema de notificações e heartbeat
    startNotificationSystem();

    // Verificar atualizações instantaneamente
    log.info('[AutoUpdater] Verificando atualizações...');
    autoUpdater.checkForUpdates().catch(err => {
        log.error('[AutoUpdater] Erro ao verificar atualizações:', err);
    });

    // Verificar atualizações a cada hora
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
            log.error('[AutoUpdater] Erro ao verificar atualizações:', err);
        });
    }, 3600000);
});

app.on('window-all-closed', () => {
    // Não fazer nada - app continua rodando em background com tray
    // Só fecha quando clicar em "Sair" no menu da bandeja
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ==========================================
// IPC Handlers
// ==========================================

// Minimizar janela
ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
});

// Fechar janela
ipcMain.on('close-window', () => {
    app.quit();
});

// ==========================================
// AutoUpdater Event Handlers
// ==========================================

// Variável para controlar se o update foi baixado
let updateDownloaded = false;

autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Verificando atualizações...');
});

autoUpdater.on('update-available', async (info) => {
    log.info('[AutoUpdater] Atualização disponível:', info.version);

    // Buscar config remota para verificar forceUpdate
    try {
        const config = remoteConfig || await fetchRemoteConfig();
        const forceUpdate = config && config.forceUpdate;

        if (forceUpdate) {
            // forceUpdate = true: baixar e instalar automaticamente
            log.info('[AutoUpdater] ForceUpdate ativo - iniciando download automático...');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-available', {
                    version: info.version,
                    releaseDate: info.releaseDate,
                    forceUpdate: true
                });
            }
            autoUpdater.downloadUpdate();
        } else {
            // forceUpdate = false: apenas notificar, não baixar
            log.info('[AutoUpdater] ForceUpdate desativado - apenas mostrando ícone de atualização');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-available-optional', {
                    version: info.version,
                    releaseDate: info.releaseDate,
                    forceUpdate: false
                });
            }
        }
    } catch (error) {
        log.error('[AutoUpdater] Erro ao verificar forceUpdate:', error);
        // Em caso de erro, notificar como opcional
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available-optional', {
                version: info.version,
                releaseDate: info.releaseDate,
                forceUpdate: false
            });
        }
    }
});

autoUpdater.on('update-not-available', () => {
    log.info('[AutoUpdater] Nenhuma atualização disponível');
});

autoUpdater.on('download-progress', (progress) => {
    log.info(`[AutoUpdater] Download: ${Math.round(progress.percent)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-download-progress', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('[AutoUpdater] Atualização baixada:', info.version);
    updateDownloaded = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version,
            releaseDate: info.releaseDate
        });
    }
});

autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Erro:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', err.message);
    }
});

// IPC Handler para instalar atualização
ipcMain.on('install-update', () => {
    log.info('[AutoUpdater] Instalando atualização...');
    autoUpdater.quitAndInstall(true, true);
});

// IPC Handler para iniciar download da atualização (quando usuário clica no ícone)
ipcMain.on('start-update-download', () => {
    log.info('[AutoUpdater] Usuário solicitou download da atualização...');
    autoUpdater.downloadUpdate();
});

// IPC Handler para verificar se há update baixado
ipcMain.handle('check-update-downloaded', () => {
    return updateDownloaded;
});

// Obter configuração completa do aplicativo
ipcMain.handle('get-app-config', () => {
    return appConfig;
});

// Buscar configuração remota da API (com cache-first)
ipcMain.handle('fetch-remote-config', async () => {
    try {
        // 1. Verificar se há cache disponível
        const cachedConfig = store ? store.get('remoteConfigCache') : null;
        const cacheTimestamp = store ? store.get('remoteConfigCacheTimestamp') : null;

        // Se houver cache válido (menos de 1 hora), retornar imediatamente
        const cacheMaxAge = 60 * 60 * 1000; // 1 hora em ms
        const isCacheValid = cachedConfig && cacheTimestamp && (Date.now() - cacheTimestamp < cacheMaxAge);

        // 2. Se cache válido, retornar imediatamente e buscar em background
        if (isCacheValid) {
            // Retornar cache imediatamente (sem delay!)
            remoteConfig = cachedConfig;
            appConfig = { ...appConfig, ...remoteConfig };

            // Buscar nova config em background (não bloqueia)
            fetchRemoteConfig().then(freshConfig => {
                if (freshConfig) {
                    remoteConfig = freshConfig;
                    appConfig = { ...appConfig, ...freshConfig };
                    // Salvar no cache
                    if (store) {
                        store.set('remoteConfigCache', freshConfig);
                        store.set('remoteConfigCacheTimestamp', Date.now());
                    }
                    // Notificar renderer que tem config nova (opcional)
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('config-updated', freshConfig);
                    }
                }
            }).catch(err => {
                console.log('[fetch-remote-config] Erro ao atualizar cache em background:', err.message);
            });

            return { success: true, config: cachedConfig, fromCache: true };
        }

        // 3. Sem cache válido, buscar da API (primeira vez ou cache expirado)
        remoteConfig = await fetchRemoteConfig();
        if (remoteConfig) {
            // Salvar no cache
            if (store) {
                store.set('remoteConfigCache', remoteConfig);
                store.set('remoteConfigCacheTimestamp', Date.now());
            }
            // Mesclar config remota com local (remota tem prioridade)
            appConfig = { ...appConfig, ...remoteConfig };
            return { success: true, config: remoteConfig, fromCache: false };
        }

        // 4. Falha: retornar cache antigo se existir (fallback)
        if (cachedConfig) {
            remoteConfig = cachedConfig;
            appConfig = { ...appConfig, ...cachedConfig };
            return { success: true, config: cachedConfig, fromCache: true, stale: true };
        }

        return { success: false, error: 'Falha ao buscar configuração' };
    } catch (error) {
        // Em caso de erro, tentar retornar cache mesmo expirado
        const cachedConfig = store ? store.get('remoteConfigCache') : null;
        if (cachedConfig) {
            remoteConfig = cachedConfig;
            appConfig = { ...appConfig, ...cachedConfig };
            return { success: true, config: cachedConfig, fromCache: true, stale: true };
        }
        return { success: false, error: error.message };
    }
});

// Verificar atualização disponível
ipcMain.handle('check-update', async () => {
    try {
        const config = remoteConfig || await fetchRemoteConfig();
        if (!config) {
            return { hasUpdate: false };
        }

        const currentVersion = app.getVersion();
        const remoteVersion = config.version || '1.0.0';

        // Comparar versões
        const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;

        return {
            hasUpdate,
            currentVersion,
            newVersion: remoteVersion,
            updateUrl: config.updateUrl || '',
            forceUpdate: config.forceUpdate || false,
            maintenance: config.maintenance || ''
        };
    } catch (error) {
        return { hasUpdate: false, error: error.message };
    }
});

// Obter versão do launcher (do package.json)
ipcMain.handle('get-launcher-version', () => {
    return app.getVersion();
});

// Comparar versões (retorna 1 se v1 > v2, -1 se v1 < v2, 0 se iguais)
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

// Obter configuração do usuário
ipcMain.handle('get-user-config', () => {
    return {
        nickname: store.get('nickname', ''),
        selectedCategory: store.get('selectedCategory', 'rp'),
        selectedServer: store.get('selectedServer', 0),
        selectedServerPerCategory: store.get('selectedServerPerCategory', { rp: 0, dm: 0, dayz: 0 }),
        gtaPath: store.get('gtaPath', '')
    };
});

// Salvar configuração do usuário
ipcMain.on('save-user-config', (event, config) => {
    if (config.nickname !== undefined) store.set('nickname', config.nickname);
    if (config.selectedCategory !== undefined) store.set('selectedCategory', config.selectedCategory);
    if (config.selectedServer !== undefined) store.set('selectedServer', config.selectedServer);
    if (config.selectedServerPerCategory !== undefined) store.set('selectedServerPerCategory', config.selectedServerPerCategory);
    if (config.gtaPath !== undefined) store.set('gtaPath', config.gtaPath);
});

// Abrir link externo ou pasta
ipcMain.on('open-external', (event, pathOrUrl) => {
    if (fs.existsSync(pathOrUrl)) {
        shell.openPath(pathOrUrl);
    } else if (pathOrUrl && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://'))) {
        shell.openExternal(pathOrUrl);
    }
});

// ==========================================
// Mods System
// ==========================================

// Buscar mods da API
ipcMain.handle('fetch-mods', async () => {
    try {
        // Tentar buscar do endpoint de mods primeiro
        const MODS_API_URL = 'http://horizontegames.com/api/content/mods.php';

        try {
            const modsData = await httpRequest(MODS_API_URL, 5000);
            if (modsData && Array.isArray(modsData.mods) && modsData.mods.length > 0) {
                return { success: true, mods: modsData.mods };
            }
        } catch (error) {
            console.log('[fetch-mods] Erro ao buscar do endpoint de mods, tentando config.php:', error.message);
        }

        // Fallback: buscar do config.php (se o endpoint de mods falhar)
        try {
            const config = await httpRequest(API_URL, 5000);
            if (config && Array.isArray(config.mods) && config.mods.length > 0) {
                return { success: true, mods: config.mods };
            }
        } catch (error) {
            console.log('[fetch-mods] Erro ao buscar do config.php:', error.message);
        }

        // Se tudo falhar, retornar mods padrão
        return { success: true, mods: getDefaultMods() };
    } catch (error) {
        console.log('[fetch-mods] Erro geral:', error.message);
        return { success: true, mods: getDefaultMods() };
    }
});

// Mods padrão (fallback)
function getDefaultMods() {
    return [
        // ========== CARROS ==========
        {
            id: 'infernus-hd',
            name: 'Infernus HD',
            author: 'GTAMods Team',
            description: 'Textura em alta definição para o Infernus, um dos carros mais icônicos do GTA SA.',
            fullDescription: 'Este mod substitui as texturas originais do Infernus por versões em alta definição, com detalhes realistas de pintura, reflexos e interior do veículo.',
            image: 'https://i.imgur.com/YQH8e2m.jpg',
            category: 'cars',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/infernus-hd.zip',
            requirements: []
        },
        {
            id: 'sultan-rs-tunado',
            name: 'Sultan RS Tunado',
            author: 'BrazilMods',
            description: 'Sultan RS com visual tunado estilo brasileiro, rodas aro 20 e som automotivo.',
            fullDescription: 'Mod completo do Sultan RS com visual brasileiro: rodas cromadas aro 20, suspensão rebaixada, som automotivo e pintura personalizada.',
            image: 'https://i.imgur.com/Kv5q8Ld.jpg',
            category: 'cars',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/sultan-rs.zip',
            requirements: []
        },
        {
            id: 'elegy-drift',
            name: 'Elegy Drift Edition',
            author: 'DriftKing',
            description: 'Elegy preparado para drift com aerodinâmica agressiva e motor turbo.',
            fullDescription: 'Versão especial do Elegy para drift, com body kit completo, asa traseira ajustável e motor preparado para manobras.',
            image: 'https://i.imgur.com/QwE5rT1.jpg',
            category: 'cars',
            popular: false,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/elegy-drift.zip',
            requirements: []
        },
        // ========== MOTOS ==========
        {
            id: 'pcx-160',
            name: 'Honda PCX 160',
            author: 'BRBikes',
            description: 'Honda PCX 160 com visual realista e detalhes em HD.',
            fullDescription: 'Scooter Honda PCX 160 fielmente reproduzida, com painel digital, faróis LED e acabamento premium.',
            image: 'https://i.imgur.com/9XqPkMn.jpg',
            category: 'motorcycles',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/pcx-160.zip',
            requirements: []
        },
        {
            id: 'cg-160-titan',
            name: 'Honda CG 160 Titan',
            author: 'BRBikes',
            description: 'Honda CG 160 Titan, a moto mais popular do Brasil.',
            fullDescription: 'A clássica Honda CG 160 Titan fielmente reproduzida, ideal para roleplay de entregador ou dia a dia.',
            image: 'https://i.imgur.com/Lp3sKjR.jpg',
            category: 'motorcycles',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/cg-160.zip',
            requirements: []
        },
        // ========== CAMINHÕES ==========
        {
            id: 'scania-r620',
            name: 'Scania R620 Highline',
            author: 'TruckBR',
            description: 'Scania R620 cavalo mecânico com pintura personalizada.',
            fullDescription: 'Caminhão Scania R620 Highline com interior detalhado, painel funcional e várias opções de pintura.',
            image: 'https://i.imgur.com/HjK8sNm.jpg',
            category: 'trucks',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/scania-r620.zip',
            requirements: []
        },
        // ========== ARMAS ==========
        {
            id: 'ak47-tactical',
            name: 'AK-47 Tactical',
            author: 'WeaponMods',
            description: 'AK-47 com visual tático moderno, mira holográfica e grip.',
            fullDescription: 'Versão modernizada da AK-47 com trilhos picatinny, mira holográfica, grip frontal e coronha ajustável.',
            image: 'https://i.imgur.com/Vn8wLpQ.jpg',
            category: 'weapons',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/ak47-tactical.zip',
            requirements: []
        },
        {
            id: 'deagle-gold',
            name: 'Desert Eagle Gold',
            author: 'GunModsBR',
            description: 'Desert Eagle com acabamento dourado e detalhes em HD.',
            fullDescription: 'Desert Eagle .50 AE com acabamento banhado a ouro, cabo em madeira nobre e gravações personalizadas.',
            image: 'https://i.imgur.com/X2mNpKj.jpg',
            category: 'weapons',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/deagle-gold.zip',
            requirements: []
        },
        // ========== GRÁFICOS ==========
        {
            id: 'enb-realistic',
            name: 'ENB Series Realistic',
            author: 'GraphicsMaster',
            description: 'Pacote gráfico ENB com iluminação realista e sombras dinâmicas.',
            fullDescription: 'ENB Series completo com iluminação HDR, sombras suaves, reflexos em tempo real e efeitos de pós-processamento.',
            image: 'https://i.imgur.com/Bp4wRkL.jpg',
            category: 'graphics',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/enb-realistic.zip',
            requirements: []
        },
        // ========== SKINS ==========
        {
            id: 'skin-policia-pmerj',
            name: 'Farda PMERJ',
            author: 'SkinsBR',
            description: 'Farda completa da Polícia Militar do Rio de Janeiro.',
            fullDescription: 'Skin de policial militar do RJ com farda operacional, colete balístico e equipamentos.',
            image: 'https://i.imgur.com/Qw5rT8n.jpg',
            category: 'skins',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/skin-pmerj.zip',
            requirements: []
        },
        // ========== SONS ==========
        {
            id: 'som-motor-realista',
            name: 'Sons de Motor Realistas',
            author: 'AudioMods',
            description: 'Pack de sons realistas para motores de carros e motos.',
            fullDescription: 'Substitui os sons originais dos veículos por gravações reais de motores, incluindo aceleração, desaceleração e marcha lenta.',
            image: 'https://i.imgur.com/Mn9sKlR.jpg',
            category: 'sounds',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/som-motor.zip',
            requirements: []
        },
        // ========== MAPAS ==========
        {
            id: 'mapa-favela-rio',
            name: 'Favela do Rio',
            author: 'MapasBR',
            description: 'Mapa de favela carioca com becos, vielas e construções típicas.',
            fullDescription: 'Mapa detalhado de uma favela do Rio de Janeiro, com becos estreitos, barracos, lajes e ambiente autêntico para roleplay.',
            image: 'https://i.imgur.com/Lp8wNkR.jpg',
            category: 'maps',
            popular: true,
            downloadUrl: 'http://horizontegames.com/api/downloads/mods/mapa-favela.zip',
            requirements: []
        }
    ];
}

// Obter mods instalados
ipcMain.handle('get-installed-mods', async (event, category) => {
    try {
        const Store = require('electron-store');
        const modsStore = new Store({ name: 'installed-mods' });
        const mods = modsStore.get(`${category}.mods`, []);
        // Retornar apenas os IDs para compatibilidade com o frontend
        return mods.map(mod => typeof mod === 'string' ? mod : mod.id);
    } catch (error) {
        return [];
    }
});

// Instalar mod
ipcMain.handle('install-mod', async (event, { mod, category, gamePath }) => {
    const https = require('https');
    const http = require('http');
    const path = require('path');
    const Store = require('electron-store');

    try {
        if (!gamePath || !fs.existsSync(gamePath)) {
            return { success: false, error: 'Pasta do jogo não encontrada' };
        }

        const tempDir = path.join(app.getPath('temp'), 'horizonte-mods');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const zipPath = path.join(tempDir, `${mod.id}.zip`);

        // Baixar o mod
        await new Promise((resolve, reject) => {
            const protocol = mod.downloadUrl.startsWith('https') ? https : http;
            const file = fs.createWriteStream(zipPath);
            let downloadedBytes = 0;

            const handleResponse = (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Seguir redirecionamento
                    const redirectUrl = response.headers.location;
                    const redirectProtocol = redirectUrl.startsWith('https') ? https : http;

                    file.close();
                    if (fs.existsSync(zipPath)) {
                        fs.unlinkSync(zipPath);
                    }

                    redirectProtocol.get(redirectUrl, (res) => {
                        handleResponse(res);
                    }).on('error', reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(zipPath);
                    return reject(new Error(`Status de download inválido: ${response.statusCode}`));
                }

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();

                    // Verificar se o arquivo foi baixado
                    if (downloadedBytes === 0) {
                        fs.unlinkSync(zipPath);
                        return reject(new Error('Arquivo baixado está vazio'));
                    }

                    // Verificar se o arquivo existe e tem tamanho válido
                    const stats = fs.statSync(zipPath);

                    if (stats.size === 0) {
                        fs.unlinkSync(zipPath);
                        return reject(new Error('Arquivo ZIP está vazio'));
                    }

                    resolve();
                });

                file.on('error', (err) => {
                    file.close();
                    fs.unlinkSync(zipPath);
                    reject(err);
                });
            };

            protocol.get(mod.downloadUrl, handleResponse).on('error', (err) => {
                file.close();
                if (fs.existsSync(zipPath)) {
                    fs.unlinkSync(zipPath);
                }
                reject(err);
            });
        });

        // Extrair o mod para a pasta do jogo e registrar arquivos
        const installedFiles = [];
        await new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) return reject(err);

                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    const destPath = path.join(gamePath, entry.fileName);

                    if (/\/$/.test(entry.fileName)) {
                        // Diretório - criar mas NÃO registrar (registramos apenas arquivos)
                        fs.mkdirSync(destPath, { recursive: true });
                        zipfile.readEntry();
                    } else {
                        // Arquivo
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });

                        // Verificar se o arquivo existe e está em uso
                        if (fs.existsSync(destPath)) {
                            try {
                                // Tentar abrir o arquivo para escrita para verificar se está em uso
                                const fd = fs.openSync(destPath, 'r+');
                                fs.closeSync(fd);
                            } catch (checkErr) {
                                if (checkErr.code === 'EBUSY' || checkErr.code === 'EPERM') {
                                    const busyError = new Error('Arquivo em uso');
                                    busyError.code = 'EBUSY';
                                    busyError.friendlyMessage = 'Não foi possível instalar o mod porque alguns arquivos estão em uso. Feche o jogo e tente novamente.';
                                    return reject(busyError);
                                }
                            }
                        }

                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) return reject(err);

                            try {
                                const writeStream = fs.createWriteStream(destPath);

                                writeStream.on('error', (writeErr) => {
                                    // Erro ao escrever arquivo (pode estar em uso)
                                    if (writeErr.code === 'EBUSY' || writeErr.code === 'EPERM') {
                                        writeErr.friendlyMessage = 'Não foi possível instalar o mod porque alguns arquivos estão em uso. Feche o jogo e tente novamente.';
                                    }
                                    reject(writeErr);
                                });

                                readStream.pipe(writeStream);
                                writeStream.on('close', () => {
                                    installedFiles.push(entry.fileName);
                                    zipfile.readEntry();
                                });
                            } catch (writeErr) {
                                // Erro ao criar writeStream (arquivo em uso)
                                if (writeErr.code === 'EBUSY' || writeErr.code === 'EPERM') {
                                    writeErr.friendlyMessage = 'Não foi possível instalar o mod porque alguns arquivos estão em uso. Feche o jogo e tente novamente.';
                                }
                                reject(writeErr);
                            }
                        });
                    }
                });

                zipfile.on('end', resolve);
                zipfile.on('error', reject);
            });
        });

        // Limpar arquivo temporário
        try {
            fs.unlinkSync(zipPath);
        } catch (e) {}

        // Salvar mod como instalado com lista de arquivos
        const modsStore = new Store({ name: 'installed-mods' });
        const installedMods = modsStore.get(`${category}.mods`, []);

        // Remover instalação anterior se existir
        const filteredMods = installedMods.filter(m => {
            const id = typeof m === 'string' ? m : m.id;
            return id !== mod.id;
        });

        // Adicionar nova instalação
        filteredMods.push({
            id: mod.id,
            files: installedFiles,
            installedAt: new Date().toISOString()
        });

        modsStore.set(`${category}.mods`, filteredMods);

        return { success: true };
    } catch (error) {
        console.error('Erro ao instalar mod:', error);

        // Usar mensagem amigável se existir
        if (error.friendlyMessage) {
            return {
                success: false,
                error: error.friendlyMessage,
                code: 'GAME_RUNNING'
            };
        }

        // Tratar erro de arquivo em uso (jogo aberto)
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
            return {
                success: false,
                error: 'Não foi possível instalar o mod porque alguns arquivos estão em uso. Feche o jogo e tente novamente.',
                code: 'GAME_RUNNING'
            };
        }

        // Tratar erro de conexão
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
                code: 'CONNECTION_ERROR'
            };
        }

        return { success: false, error: error.message };
    }
});

// Função auxiliar para desinstalar arquivos de um mod
async function uninstallModFiles(modId, category, gamePath, modsStore) {
    const path = require('path');
    const installedMods = modsStore.get(`${category}.mods`, []);

    // Encontrar o mod a ser desinstalado
    const modToUninstall = installedMods.find(m => {
        const id = typeof m === 'string' ? m : m.id;
        return id === modId;
    });

    if (!modToUninstall) {
        return; // Mod já não está instalado
    }

    // Deletar arquivos físicos se temos a lista
    if (modToUninstall && typeof modToUninstall === 'object' && modToUninstall.files) {
        const filesToDelete = modToUninstall.files;
        const dirsToCleanup = new Set(); // Coletar pastas para tentar limpar depois

        // Primeiro: deletar apenas os arquivos
        for (const file of filesToDelete) {
            const filePath = path.join(gamePath, file);
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    if (!stats.isDirectory()) {
                        // Deletar arquivo
                        fs.unlinkSync(filePath);

                        // Coletar TODAS as pastas no caminho (não só a pasta pai direta)
                        let currentDir = path.dirname(filePath);
                        while (currentDir !== gamePath && currentDir !== path.dirname(gamePath)) {
                            dirsToCleanup.add(currentDir);
                            currentDir = path.dirname(currentDir);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Erro ao deletar ${filePath}:`, error.message);
                // Se o arquivo está em uso, lançar erro imediatamente
                if (error.code === 'EBUSY' || error.code === 'EPERM') {
                    throw error;
                }
            }
        }

        // Segundo: tentar limpar pastas vazias (da mais profunda para a mais rasa)
        const sortedDirs = Array.from(dirsToCleanup).sort((a, b) => b.length - a.length);
        for (const dir of sortedDirs) {
            try {
                // Verificar se a pasta existe e está vazia
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    if (files.length === 0) {
                        // Pasta vazia, pode deletar
                        fs.rmdirSync(dir);
                    }
                }
            } catch (error) {
                // Ignorar erros ao limpar pastas vazias (não é crítico)
            }
        }
    }

    // Remover do registro de mods instalados
    const updatedMods = installedMods.filter(m => {
        const id = typeof m === 'string' ? m : m.id;
        return id !== modId;
    });
    modsStore.set(`${category}.mods`, updatedMods);
}

// Desinstalar mod (com verificação de dependentes)
ipcMain.handle('uninstall-mod', async (event, { modId, category, gamePath, availableMods }) => {
    const path = require('path');
    const Store = require('electron-store');

    try {
        // Validar gamePath
        if (!gamePath) {
            return {
                success: false,
                error: 'Pasta do jogo não configurada. Configure a pasta do jogo nas configurações.',
                code: 'NO_GAME_PATH'
            };
        }

        const modsStore = new Store({ name: 'installed-mods' });
        const installedMods = modsStore.get(`${category}.mods`, []);

        // Verificar se há mods que dependem deste mod
        const dependentMods = [];
        if (availableMods && Array.isArray(availableMods)) {
            for (const mod of availableMods) {
                if (mod.dependencies && Array.isArray(mod.dependencies) && mod.dependencies.includes(modId)) {
                    // Verificar se este mod dependente está instalado
                    const isInstalled = installedMods.some(m => {
                        const id = typeof m === 'string' ? m : m.id;
                        return id === mod.id;
                    });
                    if (isInstalled) {
                        dependentMods.push(mod.name);
                    }
                }
            }
        }

        // Se há mods dependentes instalados, desinstalar todos primeiro
        if (dependentMods.length > 0) {
            for (const mod of availableMods) {
                if (mod.dependencies && Array.isArray(mod.dependencies) && mod.dependencies.includes(modId)) {
                    const isInstalled = installedMods.some(m => {
                        const id = typeof m === 'string' ? m : m.id;
                        return id === mod.id;
                    });
                    if (isInstalled) {
                        await uninstallModFiles(mod.id, category, gamePath, modsStore);
                    }
                }
            }
        }

        // Agora desinstalar o mod principal
        await uninstallModFiles(modId, category, gamePath, modsStore);

        return {
            success: true,
            dependentModsRemoved: dependentMods
        };
    } catch (error) {
        console.error('Erro ao desinstalar mod:', error);

        // Tratar erro de arquivo em uso (jogo aberto)
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
            return {
                success: false,
                error: 'Não foi possível desinstalar o mod porque alguns arquivos estão em uso. Feche o jogo e tente novamente.',
                code: 'GAME_RUNNING'
            };
        }

        return { success: false, error: error.message };
    }
});

// Verificar dependências de um mod
ipcMain.handle('check-mod-dependencies', async (event, { mod, category }) => {
    try {
        if (!mod.dependencies || mod.dependencies.length === 0) {
            return { success: true, missingDependencies: [] };
        }

        const Store = require('electron-store');
        const modsStore = new Store({ name: 'installed-mods' });
        const installedMods = modsStore.get(`${category}.mods`, []);

        const missingDependencies = mod.dependencies.filter(depId => !installedMods.includes(depId));

        return {
            success: missingDependencies.length === 0,
            missingDependencies
        };
    } catch (error) {
        console.error('Erro ao verificar dependências:', error);
        return { success: false, error: error.message };
    }
});

// Limpar cache (arquivos temporários, config remota e nickname)
ipcMain.handle('clear-cache', () => {
    const result = {
        tempFiles: 0,
        nicknameCleared: false,
        remoteConfigCleared: false
    };

    try {
        // 1. Limpar arquivos temporários de download
        const config = remoteConfig || appConfig;
        const categories = Object.keys(config?.categories || {});
        categories.forEach(cat => {
            const tempPath = getTempDownloadPath(cat);
            if (tempPath && fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
                result.tempFiles++;
            }
        });

        // 2. Limpar cache de configurações remotas (forçar re-fetch)
        remoteConfig = null;
        result.remoteConfigCleared = true;

        // 3. Limpar nickname salvo
        if (store.get('nickname')) {
            store.delete('nickname');
            result.nicknameCleared = true;
        }

        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Remover pasta do jogo (para reinstalação)
ipcMain.handle('remove-game-folder', async (event, category) => {
    try {
        const gamePath = getGamePath(category);
        if (!gamePath || !fs.existsSync(gamePath)) {
            return { success: true };
        }

        // Matar processos que podem estar bloqueando arquivos
        try {
            const { execSync } = require('child_process');
            execSync('taskkill /f /im gta_sa.exe 2>nul', { windowsHide: true });
            execSync('taskkill /f /im samp.exe 2>nul', { windowsHide: true });
        } catch (e) {
            // Ignorar se não encontrar os processos
        }

        // Aguardar um pouco para liberar os arquivos
        await new Promise(resolve => setTimeout(resolve, 500));

        // Tentar remover com fs.rm primeiro
        try {
            await fs.promises.rm(gamePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
        } catch (rmError) {
            // Fallback: usar comando do Windows
            try {
                const { execSync } = require('child_process');
                execSync(`rmdir /s /q "${gamePath}"`, { windowsHide: true });
            } catch (cmdError) {
                throw rmError;
            }
        }

        // Limpar versão instalada
        store.delete(`installedVersion_${category}`);

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Query servidor SA-MP
ipcMain.handle('query-server', async (event, ip, port) => {
    try {
        const query = new SampQuery(ip, port);
        const info = await query.getInfo();

        return {
            online: info.online,
            players: info.players || 0,
            maxPlayers: info.maxPlayers || 0
        };
    } catch (error) {
        return {
            online: false,
            players: 0,
            maxPlayers: 0
        };
    }
});

// Verificar autenticação (HWID, VM, ban, token)
ipcMain.handle('verify-auth', async (event, { nickname, serverId, authApiUrl }) => {
    try {
        const authService = require('./services/authService');

        // Configura URL da API
        if (authApiUrl) {
            authService.setApiUrl(authApiUrl);
        }

        // Executa verificação completa
        const result = await authService.verifyBeforePlay(nickname, serverId);

        return result;
    } catch (error) {
        console.error('[Auth] Erro na verificação:', error);
        // Fail-Open: permite jogar se a verificação falhar
        return {
            success: false,
            canPlay: true,
            token: null,
            error: error.message
        };
    }
});

// Iniciar jogo
ipcMain.handle('launch-game', async (event, category, serverIndex, nickname, authToken = null) => {
    // Recarregar config para garantir dados atualizados
    loadConfig();

    const categoryData = appConfig.categories[category];
    if (!categoryData || !categoryData.servers || !categoryData.servers[serverIndex]) {
        return { success: false, error: 'Servidor não encontrado' };
    }

    const server = categoryData.servers[serverIndex];

    // Usar o caminho do jogo da categoria
    const gamePath = getGamePath(category);

    // Verificar se o jogo está instalado
    const sampPath = path.join(gamePath, 'samp.exe');
    const gtaExe = path.join(gamePath, 'gta_sa.exe');

    if (!fs.existsSync(gtaExe)) {
        return { success: false, error: 'Jogo não instalado. Clique em "Baixar Jogo".' };
    }

    if (!fs.existsSync(sampPath)) {
        return { success: false, error: 'SA-MP não encontrado na instalação' };
    }

    try {
        const sampPath = path.join(gamePath, 'samp.exe');

        if (!fs.existsSync(sampPath)) {
            return { success: false, error: 'samp.exe não encontrado. Reinstale o jogo.' };
        }

        // Configurar registro do Windows para o SA-MP encontrar o GTA
        const { execSync } = require('child_process');
        const gtaExePath = path.join(gamePath, 'gta_sa.exe');

        try {
            // Configurar o caminho do GTA SA no registro do SA-MP
            execSync(`reg add "HKCU\\SOFTWARE\\SAMP" /v "gta_sa_exe" /t REG_SZ /d "${gtaExePath}" /f`, { windowsHide: true });
            // Também configurar o nickname no registro
            execSync(`reg add "HKCU\\SOFTWARE\\SAMP" /v "PlayerName" /t REG_SZ /d "${nickname}" /f`, { windowsHide: true });
        } catch (regError) {
            // Ignorar erros de registro
        }

        const { spawn, exec } = require('child_process');

        // Usar sampcmd.exe (ferramenta de linha de comando do SA-MP)
        const sampcmdPath = path.join(gamePath, 'sampcmd.exe');

        if (!fs.existsSync(sampcmdPath)) {
            // Fallback para samp.exe (sem suporte a token)
            spawn(sampPath, [`${server.ip}:${server.port}`], {
                cwd: gamePath,
                detached: true,
                stdio: 'ignore',
                shell: true
            }).unref();
        } else {
            // Usar sampcmd com spawn
            const args = ['-c', '-h', server.ip, '-p', server.port.toString(), '-n', nickname];

            // TODO: Descomentar quando implementar validação de token na gamemode
            // Adicionar token como senha se disponível
            // if (authToken) {
            //     args.push('-z', authToken);
            // }

            const command = `"${sampcmdPath}" ${args.join(' ')}`;

            exec(command, {
                cwd: gamePath,
                windowsHide: false
            });
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Selecionar pasta GTA
ipcMain.handle('select-gta-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta do GTA San Andreas'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const gtaPath = result.filePaths[0];
        const gtaExe = path.join(gtaPath, 'gta_sa.exe');

        if (fs.existsSync(gtaExe)) {
            store.set('gtaPath', gtaPath);
            return { success: true, path: gtaPath };
        } else {
            return { success: false, error: 'gta_sa.exe não encontrado na pasta' };
        }
    }
    return { success: false, error: 'Cancelado' };
});

// ==========================================
// Game Download System
// ==========================================

// Obter diretório base do launcher
function getLauncherDir() {
    if (app.isPackaged) {
        const exePath = app.getPath('exe');
        return path.dirname(exePath);
    }
    return null;
}

// Obter pasta base de instalação (compartilhada entre categorias)
function getBaseGamePath() {
    // Primeiro verifica se há um caminho base salvo
    const savedBasePath = store.get('baseGamePath', null);
    if (savedBasePath) return savedBasePath;

    // Fallback: usar pasta do launcher se empacotado
    const launcherDir = getLauncherDir();
    if (launcherDir) {
        return path.join(launcherDir, 'games');
    }

    return null;
}

// Definir pasta do jogo para uma categoria específica
function setGamePath(category, gamePath) {
    store.set(`gamePath_${category}`, gamePath);
}

// Obter caminho do jogo instalado para uma categoria (pasta exata selecionada pelo usuário)
function getGamePath(category = 'rp') {
    // Primeiro tenta a pasta específica da categoria
    const categoryPath = store.get(`gamePath_${category}`);
    if (categoryPath) return categoryPath;

    // Fallback: pasta base antiga + folderName (compatibilidade)
    const basePath = getBaseGamePath();
    if (basePath) {
        const config = remoteConfig || appConfig;
        const categoryData = config?.categories?.[category];
        const folderName = categoryData?.folderName || category;
        return path.join(basePath, folderName);
    }

    return null;
}

// Obter caminho do arquivo temporário de download (mesmo diretório do jogo)
function getTempDownloadPath(category = 'rp') {
    const gamePath = getGamePath(category);
    if (!gamePath) return null;
    return path.join(gamePath, `${category}_download.zip`);
}

// Selecionar pasta do jogo para uma categoria
ipcMain.handle('select-game-folder', async (event, category = 'rp') => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta do GTA San Andreas com SA-MP instalado'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        // Salvar pasta diretamente para esta categoria
        setGamePath(category, selectedPath);
        return { success: true, path: selectedPath };
    }
    return { success: false, error: 'Cancelado' };
});

// Obter caminho do jogo salvo (para uma categoria)
ipcMain.handle('get-game-path', (event, category = 'rp') => {
    return getGamePath(category);
});

// Obter versão instalada do jogo para uma categoria
function getInstalledGameVersion(category) {
    return store.get(`gameVersion_${category}`, null);
}

// Salvar versão do jogo instalado
function setInstalledGameVersion(category, version) {
    store.set(`gameVersion_${category}`, version);
}

// Verificar se o jogo está instalado (por categoria)
ipcMain.handle('check-game-installed', (event, category = 'rp') => {
    const gamePath = getGamePath(category);
    const tempPath = getTempDownloadPath(category);

    // Se não há pasta configurada, jogo não está instalado
    if (!gamePath) {
        return {
            installed: false,
            path: null,
            partialDownload: null,
            category,
            needsUpdate: false,
            installedVersion: null,
            remoteVersion: null
        };
    }

    // Verifica se existe o arquivo gta_sa.exe na pasta do jogo
    const gtaExe = path.join(gamePath, 'gta_sa.exe');
    const sampExe = path.join(gamePath, 'samp.exe');

    const gtaExists = fs.existsSync(gtaExe);
    const sampExists = fs.existsSync(sampExe);
    const isInstalled = gtaExists || sampExists;

    // Verificar se existe download parcial
    let partialDownload = null;
    if (!isInstalled && fs.existsSync(tempPath)) {
        const stats = fs.statSync(tempPath);
        partialDownload = {
            downloaded: stats.size,
            path: tempPath
        };
    }

    // Verificar atualização de versão
    let needsUpdate = false;
    let installedVersion = null;
    let remoteVersion = null;

    if (isInstalled) {
        installedVersion = getInstalledGameVersion(category);
        const categoryData = appConfig.categories?.[category];
        remoteVersion = categoryData?.download?.version || null;

        // Se temos versão remota e versão instalada, comparar
        if (remoteVersion && installedVersion) {
            needsUpdate = compareVersions(remoteVersion, installedVersion) > 0;
        }
        // Se não temos versão instalada salva mas o jogo existe, assumir versão antiga
        else if (remoteVersion && !installedVersion) {
            // Primeiro acesso após implementação - assumir que precisa atualizar
            // Ou pode-se assumir que está atualizado: needsUpdate = false
            needsUpdate = false; // Assume que está ok, só atualiza em próximas versões
        }
    }

    return {
        installed: isInstalled,
        path: gamePath,
        partialDownload,
        category,
        needsUpdate,
        installedVersion,
        remoteVersion
    };
});

// Iniciar download do jogo
ipcMain.handle('start-game-download', async (event, category) => {
    const http = require('http');
    const https = require('https');

    // Verificar se a pasta de instalação está configurada
    const gamePath = getGamePath(category);
    if (!gamePath) {
        return { success: false, error: 'Pasta de instalação não configurada' };
    }

    // Buscar URL de download da categoria na configuração
    const categoryData = appConfig.categories?.[category];
    if (!categoryData) {
        return { success: false, error: 'Categoria não encontrada' };
    }

    const downloadInfo = categoryData.download;
    if (!downloadInfo || !downloadInfo.url) {
        return { success: false, error: 'Download não disponível para esta categoria' };
    }

    const downloadUrl = downloadInfo.url;

    if (downloadState.isDownloading && !downloadState.isPaused) {
        return { success: false, error: 'Download já em andamento' };
    }

    // Verificar conectividade antes de iniciar
    try {
        const testUrl = new URL(downloadUrl);
        await new Promise((resolve, reject) => {
            const protocol = testUrl.protocol === 'https:' ? require('https') : require('http');
            const req = protocol.get({ hostname: testUrl.hostname, timeout: 5000 }, (res) => {
                res.destroy();
                resolve();
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('timeout'));
            });
        });
    } catch (err) {
        return { success: false, error: translateError(err) };
    }

    const tempPath = getTempDownloadPath(category);

    // Criar diretório de instalação se não existir
    if (!fs.existsSync(gamePath)) {
        fs.mkdirSync(gamePath, { recursive: true });
    }

    downloadState.isDownloading = true;
    downloadState.isPaused = false;
    downloadState.isExtracting = false;
    downloadState.tempFilePath = tempPath;
    downloadState.category = category;
    downloadState.downloaded = 0;

    // Verificar se já existe download parcial no disco
    let resumeFrom = 0;
    if (fs.existsSync(tempPath)) {
        const stats = fs.statSync(tempPath);

        // Verificar se o arquivo parcial não está corrompido (HTML ao invés de ZIP)
        if (stats.size >= 4) {
            try {
                const fd = fs.openSync(tempPath, 'r');
                const buffer = Buffer.alloc(4);
                fs.readSync(fd, buffer, 0, 4, 0);
                fs.closeSync(fd);

                // Se começa com HTML, deletar e recomeçar do zero
                const isHtml = (buffer[0] === 0x3C && buffer[1] === 0x21) || // <!
                              (buffer[0] === 0x3C && (buffer[1] === 0x68 || buffer[1] === 0x48)); // <h ou <H

                if (isHtml) {
                    fs.unlinkSync(tempPath);
                    resumeFrom = 0;
                } else {
                    resumeFrom = stats.size;
                    downloadState.downloaded = resumeFrom;
                }
            } catch (e) {
                resumeFrom = stats.size;
                downloadState.downloaded = resumeFrom;
            }
        } else {
            resumeFrom = stats.size;
            downloadState.downloaded = resumeFrom;
        }
    }

    // Inicializar controle de velocidade APÓS verificar download parcial
    downloadState.lastDownloaded = downloadState.downloaded;
    downloadState.lastSpeedUpdate = Date.now();
    downloadState.speed = 0;

    return new Promise((resolve) => {
        const startDownload = (url, resumeBytes = 0) => {
            const protocol = url.startsWith('https') ? https : http;
            const headers = {};

            // Se tiver bytes já baixados, continuar de onde parou
            if (resumeBytes > 0) {
                headers['Range'] = `bytes=${resumeBytes}-`;
            }

            const request = protocol.get(url, { headers }, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    startDownload(response.headers.location, resumeBytes);
                    return;
                }

                // Verificar se servidor suporta Range
                const isPartial = response.statusCode === 206;

                let totalSize;
                if (isPartial) {
                    // Content-Range: bytes 0-999/1000
                    const contentRange = response.headers['content-range'];
                    if (contentRange) {
                        totalSize = parseInt(contentRange.split('/')[1], 10);
                    }
                } else {
                    totalSize = parseInt(response.headers['content-length'], 10);
                    // Servidor não suporta Range, recomeçar do zero
                    downloadState.downloaded = 0;
                    resumeBytes = 0;
                }

                downloadState.total = totalSize;

                // Abrir arquivo para escrita (append se resumindo)
                const writeFlags = resumeBytes > 0 && isPartial ? 'a' : 'w';
                const fileStream = fs.createWriteStream(tempPath, { flags: writeFlags });

                downloadState.request = request;

                response.on('data', (chunk) => {
                    if (downloadState.isPaused) {
                        request.destroy();
                        fileStream.end();
                        return;
                    }

                    downloadState.downloaded += chunk.length;
                    // Proteção contra NaN (se total for 0 ou undefined)
                    const percent = downloadState.total > 0
                        ? Math.min(99, Math.round((downloadState.downloaded / downloadState.total) * 100))
                        : 0;

                    // Calcular velocidade (a cada 500ms para evitar flutuações)
                    const now = Date.now();
                    if (now - downloadState.lastSpeedUpdate >= 500) {
                        const bytesDownloaded = downloadState.downloaded - downloadState.lastDownloaded;
                        const timeDiff = (now - downloadState.lastSpeedUpdate) / 1000; // em segundos
                        downloadState.speed = bytesDownloaded / timeDiff; // bytes por segundo
                        downloadState.lastDownloaded = downloadState.downloaded;
                        downloadState.lastSpeedUpdate = now;
                    }

                    // Enviar progresso para renderer
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('download-progress', {
                            downloaded: downloadState.downloaded,
                            total: downloadState.total,
                            percent,
                            category: downloadState.category,
                            speed: downloadState.speed
                        });
                    }
                });

                response.pipe(fileStream);

                fileStream.on('finish', async () => {
                    if (!downloadState.isPaused) {
                        downloadState.isDownloading = false;

                        // Validar ZIP antes de extrair
                        const validation = await validateZipFile(tempPath);
                        if (!validation.valid) {
                            // Deletar arquivo corrompido
                            try {
                                fs.unlinkSync(tempPath);
                            } catch (e) {
                                // Ignorar erro ao deletar
                            }

                            // Resetar estado
                            downloadState.isExtracting = false;
                            downloadState.category = null;
                            downloadState.downloaded = 0;
                            downloadState.total = 0;

                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('download-error', validation.error);
                            }
                            return;
                        }

                        downloadState.isExtracting = true;

                        // Obter versão do download para salvar após extração
                        const downloadVersion = downloadInfo.version || '1.0.0';

                        // Iniciar extração (passar gamePath da categoria e versão)
                        extractGame(tempPath, gamePath, category, downloadVersion).then((result) => {
                            // Resetar estado do download
                            downloadState.isExtracting = false;
                            downloadState.category = null;
                            downloadState.downloaded = 0;
                            downloadState.total = 0;

                            // Incluir categoria no resultado
                            result.category = category;

                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('download-complete', result);
                            }
                        });
                    }
                });

                fileStream.on('error', (err) => {
                    downloadState.isDownloading = false;
                    const friendlyError = translateError(err);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('download-error', friendlyError);
                    }
                });

                // Detectar perda de conexão durante o download
                response.on('close', () => {
                    if (downloadState.isDownloading && downloadState.downloaded < downloadState.total) {
                        downloadState.isDownloading = false;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('download-error', 'Conexão perdida. Verifique sua internet e tente novamente.');
                        }
                    }
                });

                resolve({ success: true, total: totalSize, resumed: resumeBytes > 0 });
            });

            request.on('error', (err) => {
                downloadState.isDownloading = false;
                const friendlyError = translateError(err);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-error', friendlyError);
                }
                resolve({ success: false, error: friendlyError });
            });

            request.setTimeout(30000, () => {
                request.destroy();
                downloadState.isDownloading = false;
                const friendlyError = 'Conexão lenta. Verifique sua internet e tente novamente.';
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-error', friendlyError);
                }
                resolve({ success: false, error: friendlyError });
            });
        };

        startDownload(downloadUrl, resumeFrom);
    });
});

// Pausar download
ipcMain.handle('pause-game-download', () => {
    if (downloadState.isDownloading && !downloadState.isPaused) {
        downloadState.isPaused = true;
        if (downloadState.request) {
            downloadState.request.destroy();
        }
        return { success: true };
    }
    return { success: false, error: 'Nenhum download em andamento' };
});

// Retomar download
ipcMain.handle('resume-game-download', async () => {
    if (downloadState.isPaused) {
        downloadState.isPaused = false;
        return ipcMain.emit('start-game-download');
    }
    return { success: false, error: 'Download não está pausado' };
});

// Cancelar download
ipcMain.handle('cancel-game-download', () => {
    if (downloadState.isDownloading || downloadState.isPaused) {
        downloadState.isDownloading = false;
        downloadState.isPaused = false;
        downloadState.isExtracting = false;
        downloadState.downloaded = 0;
        downloadState.total = 0;
        downloadState.category = null;

        if (downloadState.request) {
            downloadState.request.destroy();
        }

        // Remover arquivo temporário
        if (downloadState.tempFilePath && fs.existsSync(downloadState.tempFilePath)) {
            fs.unlinkSync(downloadState.tempFilePath);
        }

        return { success: true };
    }
    return { success: false, error: 'Nenhum download em andamento' };
});

// Obter estado atual do download
ipcMain.handle('get-download-state', () => {
    return {
        isDownloading: downloadState.isDownloading,
        isExtracting: downloadState.isExtracting,
        isPaused: downloadState.isPaused,
        category: downloadState.category,
        downloaded: downloadState.downloaded,
        total: downloadState.total,
        percent: downloadState.total > 0 ? Math.round((downloadState.downloaded / downloadState.total) * 100) : 0
    };
});

// Extrair jogo do ZIP (para pasta específica da categoria)
async function extractGame(zipPath, gamePath, category = 'rp', version = '1.0.0') {

    // Criar pasta de destino
    if (!fs.existsSync(gamePath)) {
        fs.mkdirSync(gamePath, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        // Primeiro, detectar se há uma pasta raiz comum no ZIP
        let rootFolder = null;
        let hasCommonRoot = true;

        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfileCheck) => {
            if (err) {
                resolve({ success: false, error: err.message });
                return;
            }

            const entries = [];
            zipfileCheck.readEntry();

            zipfileCheck.on('entry', (entry) => {
                entries.push(entry.fileName);

                // Verificar se todos os arquivos têm a mesma pasta raiz
                const firstSlash = entry.fileName.indexOf('/');
                if (firstSlash > 0) {
                    const thisRoot = entry.fileName.substring(0, firstSlash);
                    if (rootFolder === null) {
                        rootFolder = thisRoot;
                    } else if (rootFolder !== thisRoot) {
                        hasCommonRoot = false;
                    }
                } else if (!entry.fileName.endsWith('/')) {
                    // Arquivo na raiz do ZIP (sem pasta)
                    hasCommonRoot = false;
                }

                zipfileCheck.readEntry();
            });

            zipfileCheck.on('end', () => {
                zipfileCheck.close();

                // Agora extrair de verdade
                yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                    if (err) {
                        resolve({ success: false, error: err.message });
                        return;
                    }

                    const totalEntries = zipfile.entryCount;
                    let processedEntries = 0;

                    zipfile.readEntry();

                    zipfile.on('entry', (entry) => {
                        processedEntries++;
                        const percent = Math.round((processedEntries / totalEntries) * 100);

                        // Enviar progresso de extração
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('extract-progress', {
                                current: processedEntries,
                                total: totalEntries,
                                percent,
                                file: entry.fileName,
                                category
                            });
                        }

                        let fileName = entry.fileName;

                        // Só remover a pasta raiz se TODOS os arquivos estiverem dentro dela
                        if (hasCommonRoot && rootFolder) {
                            const prefix = rootFolder + '/';
                            if (fileName.startsWith(prefix)) {
                                fileName = fileName.substring(prefix.length);
                            }
                        }

                        // Pular se ficou vazio (era a própria pasta raiz)
                        if (!fileName) {
                            zipfile.readEntry();
                            return;
                        }

                        const fullPath = path.join(gamePath, fileName);

                        if (/\/$/.test(entry.fileName)) {
                            // É um diretório
                            if (!fs.existsSync(fullPath)) {
                                fs.mkdirSync(fullPath, { recursive: true });
                            }
                            zipfile.readEntry();
                        } else {
                            // É um arquivo
                            const dirPath = path.dirname(fullPath);
                            if (!fs.existsSync(dirPath)) {
                                fs.mkdirSync(dirPath, { recursive: true });
                            }

                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) {
                                    zipfile.readEntry();
                                    return;
                                }

                                try {
                                    // Tentar deletar arquivo existente primeiro (se estiver em uso, vai falhar)
                                    if (fs.existsSync(fullPath)) {
                                        try {
                                            fs.unlinkSync(fullPath);
                                        } catch (unlinkErr) {
                                            // Arquivo em uso - pular e continuar
                                            readStream.resume(); // Drenar o stream
                                            zipfile.readEntry();
                                            return;
                                        }
                                    }

                                    const writeStream = fs.createWriteStream(fullPath);
                                    readStream.pipe(writeStream);

                                    writeStream.on('close', () => {
                                        zipfile.readEntry();
                                    });

                                    writeStream.on('error', () => {
                                        zipfile.readEntry();
                                    });
                                } catch (writeErr) {
                                    readStream.resume(); // Drenar o stream
                                    zipfile.readEntry();
                                }
                            });
                        }
                    });

                    zipfile.on('end', () => {
                        // Salvar versão instalada
                        setInstalledGameVersion(category, version);

                        // Remover arquivo ZIP temporário
                        try {
                            fs.unlinkSync(zipPath);
                        } catch (e) {
                            // Ignorar erro ao remover ZIP
                        }

                        resolve({ success: true, path: gamePath, version });
                    });

                    zipfile.on('error', (err) => {
                        resolve({ success: false, error: err.message });
                    });
                });
            });

            zipfileCheck.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    });
}

// ==========================================
// Driver Installation System
// ==========================================

// Obter caminho da pasta de drivers
function getDriversPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'drivers');
    }
    return path.join(__dirname, '..', 'resources', 'drivers');
}

// Verificar se drivers já foram instalados
function driversInstalled() {
    return store.get('driversInstalled', false);
}

// Marcar drivers como instalados
function setDriversInstalled(value) {
    store.set('driversInstalled', value);
}

// Verificar se drivers estão disponíveis
ipcMain.handle('check-drivers-available', () => {
    const driversPath = getDriversPath();
    const exists = fs.existsSync(driversPath);
    const installed = driversInstalled();

    return {
        available: exists,
        installed: installed,
        path: driversPath
    };
});

// Instalar drivers (DirectX e Visual C++ Redistributables)
ipcMain.handle('install-drivers', async (event) => {
    const { exec } = require('child_process');
    const driversPath = getDriversPath();

    if (!fs.existsSync(driversPath)) {
        return { success: false, error: 'Pasta de drivers não encontrada' };
    }

    // Lista de drivers para instalar (em ordem)
    const drivers = [
        { name: 'DirectX', file: 'dxwebsetup.exe', args: '/Q' },
        { name: 'Visual C++ 2008', file: 'vcredist_x86.exe', args: '/q /norestart' },
        { name: 'Visual C++ 2010', file: 'vcredist_x86_2010.exe', args: '/q /norestart' },
        { name: 'Visual C++ 2013', file: 'vcredist_x86_2013.exe', args: '/q /norestart' },
        { name: 'Visual C++ 2015-2019', file: 'vcredist_x86_2015.exe', args: '/quiet /norestart' },
        { name: 'Visual C++ 2022 (x86)', file: 'vc_redist17.x86.exe', args: '/quiet /norestart' },
        { name: 'Visual C++ 2022 (x64)', file: 'vc_redist17.x64.exe', args: '/quiet /norestart' }
    ];

    const results = [];
    let currentIndex = 0;

    for (const driver of drivers) {
        const driverPath = path.join(driversPath, driver.file);

        if (!fs.existsSync(driverPath)) {
            results.push({ name: driver.name, status: 'not_found' });
            currentIndex++;
            continue;
        }

        // Enviar progresso
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('driver-install-progress', {
                current: currentIndex + 1,
                total: drivers.length,
                name: driver.name,
                percent: Math.round(((currentIndex + 1) / drivers.length) * 100)
            });
        }

        try {
            await new Promise((resolve, reject) => {
                const command = `"${driverPath}" ${driver.args}`;

                exec(command, { windowsHide: true }, (error, stdout, stderr) => {
                    if (error) {
                        // Alguns instaladores retornam código de erro mesmo quando funcionam
                        // (ex: já instalado = 1638 para VC++)
                        if (error.code === 1638 || error.code === 3010) {
                            // 1638 = já instalado, 3010 = sucesso mas precisa reiniciar
                            resolve();
                        } else {
                            reject(error);
                        }
                    } else {
                        resolve();
                    }
                });
            });

            results.push({ name: driver.name, status: 'success' });
        } catch (error) {
            results.push({ name: driver.name, status: 'error', error: error.message });
        }

        currentIndex++;
    }

    // Marcar como instalado
    setDriversInstalled(true);

    // Verificar resultados
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return {
        success: errorCount === 0,
        results,
        summary: {
            total: drivers.length,
            success: successCount,
            errors: errorCount,
            notFound: results.filter(r => r.status === 'not_found').length
        }
    };
});

// ==========================================
// Discord Rich Presence System
// ==========================================
let discordRpcClient = null;
let discordRpcConnected = false;
let discordRpcConfig = {
    howToPlayUrl: 'http://horizontegames.com/howtoplay.php',
    defaultDiscordUrl: 'https://discord.gg/hzrp'
};
// Armazena a última presença para aplicar quando conectar
let pendingDiscordPresence = null;

// Discord Application ID
const DISCORD_CLIENT_ID = '956621033178288189';

// Inicializar Discord RPC
async function initDiscordRPC() {
    // Verificar se está habilitado
    const enabled = store.get('discordRpcEnabled', true);
    if (!enabled) {
        return;
    }

    try {
        const DiscordRPC = require('discord-rpc');
        DiscordRPC.register(DISCORD_CLIENT_ID);

        discordRpcClient = new DiscordRPC.Client({ transport: 'ipc' });

        discordRpcClient.on('ready', () => {
            discordRpcConnected = true;
            // Aplicar presença pendente se existir
            if (pendingDiscordPresence) {
                updateDiscordPresence(pendingDiscordPresence.state, pendingDiscordPresence.details, pendingDiscordPresence.discordUrl);
                pendingDiscordPresence = null;
            } else {
                updateDiscordPresence();
            }
        });

        discordRpcClient.on('disconnected', () => {
            discordRpcConnected = false;
        });

        await discordRpcClient.login({ clientId: DISCORD_CLIENT_ID });
    } catch (error) {
        discordRpcConnected = false;
    }
}

// Atualizar presença no Discord
function updateDiscordPresence(state = 'No Launcher', details = 'Escolhendo servidor', discordUrl = null) {
    // Se não está conectado, armazenar para aplicar depois
    if (!discordRpcClient || !discordRpcConnected) {
        pendingDiscordPresence = { state, details, discordUrl };
        return;
    }

    try {
        discordRpcClient.setActivity({
            details: details,
            state: state,
            startTimestamp: Date.now(),
            largeImageKey: 'logo',
            largeImageText: 'Horizonte Launcher',
            buttons: [
                { label: 'Jogar', url: discordRpcConfig.howToPlayUrl },
                { label: 'Discord', url: discordUrl || discordRpcConfig.defaultDiscordUrl }
            ]
        });
    } catch (error) {
        console.error('Erro ao atualizar Discord RPC:', error);
    }
}

// Destruir Discord RPC
function destroyDiscordRPC() {
    if (discordRpcClient) {
        try {
            discordRpcClient.destroy();
        } catch (e) {
            // Ignorar erros ao destruir
        }
        discordRpcClient = null;
        discordRpcConnected = false;
    }
}

// Obter estado do Discord RPC
ipcMain.handle('get-discord-rpc-enabled', () => {
    return store.get('discordRpcEnabled', true);
});

// Atualizar presença do Discord via IPC
ipcMain.handle('update-discord-presence', (event, state, details, discordUrl) => {
    updateDiscordPresence(state, details, discordUrl);
    return { success: true };
});

// Atualizar configuração do Discord RPC (chamado quando config da API é carregada)
ipcMain.handle('set-discord-rpc-config', (event, config) => {
    if (config.howToPlayUrl) {
        discordRpcConfig.howToPlayUrl = config.howToPlayUrl;
    }
    if (config.defaultDiscordUrl) {
        discordRpcConfig.defaultDiscordUrl = config.defaultDiscordUrl;
    }
    return { success: true };
});

// Definir estado do Discord RPC
ipcMain.handle('set-discord-rpc-enabled', async (event, enabled) => {
    store.set('discordRpcEnabled', enabled);

    if (enabled) {
        await initDiscordRPC();
    } else {
        destroyDiscordRPC();
    }

    return { success: true };
});

// ==========================================
// Sistema de Notificações e Heartbeat
// ==========================================

const { Notification } = require('electron');
let heartbeatInterval = null;
let notificationCheckInterval = null;
let sessionId = null;
let shownNotifications = new Set(); // Rastrear notificações já exibidas
let cachedNotificationSoundBase64 = null; // Cache do áudio em base64 (carrega uma vez)

/**
 * Gera um ID único para a sessão
 */
function generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Baixa uma imagem de uma URL e retorna o caminho local
 */
async function downloadNotificationIcon(url) {
    return new Promise((resolve, reject) => {
        try {
            const tempDir = app.getPath('temp');
            const fileName = `notification_${Date.now()}.png`;
            const filePath = path.join(tempDir, fileName);
            const file = fs.createWriteStream(filePath);

            const client = url.startsWith('https') ? require('https') : require('http');

            client.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(filePath);
                });
            }).on('error', (err) => {
                fs.unlink(filePath, () => {});
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Reproduz o som de notificação customizado usando janela invisível
 */
function playNotificationSound() {
    try {
        // Carregar áudio em cache (apenas na primeira vez)
        if (!cachedNotificationSoundBase64) {
            const soundPath = path.join(__dirname, 'assets/sounds/notification.mp3');

            if (!fs.existsSync(soundPath)) {
                return;
            }

            const audioBuffer = fs.readFileSync(soundPath);
            cachedNotificationSoundBase64 = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
        }

        // Criar janela invisível para tocar o áudio
        const audioWindow = new BrowserWindow({
            show: false,
            width: 1,
            height: 1,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                autoplayPolicy: 'no-user-gesture-required'
            }
        });

        // HTML que toca o áudio com base64 embedado
        const audioHTML = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
                <audio id="notificationSound">
                    <source src="${cachedNotificationSoundBase64}" type="audio/mpeg">
                </audio>
                <script>
                    const audio = document.getElementById('notificationSound');
                    audio.volume = 1.0;
                    audio.play().catch(() => {});
                    audio.addEventListener('ended', () => setTimeout(() => window.close(), 100));
                    setTimeout(() => window.close(), 5000);
                </script>
            </body>
            </html>
        `;

        audioWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(audioHTML)}`);

        // Destruir janela após 6 segundos (segurança)
        setTimeout(() => {
            if (!audioWindow.isDestroyed()) {
                audioWindow.destroy();
            }
        }, 6000);

    } catch (error) {
        // Falha silenciosa - não impede notificação
    }
}

/**
 * Exibe uma notificação nativa do Windows
 */
async function showNotification(data) {
    const { title, body, icon, silent = false } = data;

    // Verificar se já foi exibida
    if (data.id && shownNotifications.has(data.id)) {
        return;
    }

    // Determinar qual ícone usar (logo padrão do launcher)
    let notificationIcon = path.join(__dirname, 'assets/images/logo.png');

    if (icon && (icon.startsWith('http://') || icon.startsWith('https://'))) {
        // Tentar baixar imagem da URL
        try {
            notificationIcon = await downloadNotificationIcon(icon);
        } catch (error) {
            // Se falhar, usa o logo local
        }
    } else if (icon) {
        // Se for um caminho local, usar diretamente
        notificationIcon = icon;
    }

    // Criar notificação sempre em modo silencioso (vamos tocar nosso próprio som)
    const notification = new Notification({
        title: title || 'Horizonte Launcher',
        body: body || '',
        icon: notificationIcon,
        silent: true, // Sempre silenciar som padrão do Windows
        timeoutType: 'default'
    });

    // Tocar som customizado do Horizonte Launcher (não bloqueia a notificação)
    try {
        playNotificationSound();
    } catch (error) {
        // Falha silenciosa
    }

    // Ação ao clicar na notificação
    notification.on('click', () => {
        // Focar na janela do launcher
        if (mainWindow) {
            // Se a janela está oculta (na bandeja), mostrar ela
            if (!mainWindow.isVisible()) {
                mainWindow.show();
            }
            // Se a janela está minimizada, restaurar
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }

        // Executar ação customizada
        if (data.action) {
            // Se é abrir URL, executar imediatamente (não depende da janela)
            if (data.action.type === 'open_url') {
                handleNotificationAction(data.action);
            } else {
                // Para outras ações (navigate, play), aguardar janela estar pronta
                setTimeout(() => {
                    handleNotificationAction(data.action);
                }, 500);
            }
        }
    });

    notification.show();

    // Marcar como exibida
    if (data.id) {
        shownNotifications.add(data.id);
    }
}

/**
 * Executa ação customizada da notificação
 */
function handleNotificationAction(action) {
    try {
        switch (action.type) {
            case 'open_url':
                let url = action.url;
                // Adicionar protocolo se não tiver
                if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                if (url) {
                    shell.openExternal(url);
                }
                break;
            case 'navigate':
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('navigate-to', action.page);
                }
                break;
            case 'play':
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('trigger-play', action.serverId);
                }
                break;
        }
    } catch (error) {
        console.error('[Notification] Erro ao executar ação:', error);
    }
}

/**
 * Busca notificações pendentes da API
 */
async function checkPendingNotifications() {
    try {
        const config = await fetchConfig();
        if (!config || !config.apiUrl) return;

        const hwid = require('./services/hwid').getHWID();
        const endpoint = `${config.apiUrl}/notifications/pending.php`;

        const response = await new Promise((resolve, reject) => {
            const url = new URL(endpoint);
            const client = url.protocol === 'https:' ? require('https') : require('http');

            const payload = JSON.stringify({
                hwid: hwid.hash,
                sessionId: sessionId
            });

            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 5000 // 5 segundos - reduzido para não travar se API estiver lenta
            };

            const req = client.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(payload);
            req.end();
        });

        if (response.success && response.notifications && response.notifications.length > 0) {
            // Exibir cada notificação pendente
            for (const notification of response.notifications) {
                await showNotification({
                    id: notification.id,
                    title: notification.title,
                    body: notification.body,
                    icon: notification.icon,
                    silent: notification.silent === true,
                    action: notification.action
                });
            }
        }
    } catch (error) {
        // Falha silenciosa - não atrapalhar usuário
    }
}

/**
 * Envia heartbeat para API (rastrear sessão ativa)
 */
async function sendHeartbeat() {
    try {
        const config = await fetchConfig();
        if (!config || !config.apiUrl) return;

        const hwid = require('./services/hwid').getHWID();
        const vmCheck = require('./services/vmDetector').detect();
        const endpoint = `${config.apiUrl}/session/heartbeat.php`;

        const payload = JSON.stringify({
            sessionId: sessionId,
            hwid: hwid.hash,
            hwidComponents: hwid.components,
            manufacturer: hwid.manufacturer,
            isVM: vmCheck.isVM,
            vmConfidence: vmCheck.confidence,
            platform: process.platform,
            arch: process.arch,
            launcherVersion: require('../package.json').version,
            timestamp: Date.now()
        });

        const url = new URL(endpoint);
        const client = url.protocol === 'https:' ? require('https') : require('http');

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000 // 5 segundos - reduzido para não travar se API estiver lenta
        };

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                // Heartbeat enviado com sucesso
            });
        });

        req.on('error', () => {
            // Falha silenciosa
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(payload);
        req.end();
    } catch (error) {
        // Falha silenciosa
    }
}

/**
 * Inicia o sistema de notificações e heartbeat
 */
function startNotificationSystem() {
    // Gerar ID da sessão
    sessionId = generateSessionId();

    // Enviar primeiro heartbeat após 1 segundo
    setTimeout(() => {
        sendHeartbeat();
    }, 1000);

    // Verificar notificações a cada 2 minutos
    notificationCheckInterval = setInterval(() => {
        checkPendingNotifications();
    }, 2 * 60 * 1000); // 2 minutos

    // Enviar heartbeat a cada 3 minutos
    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
    }, 3 * 60 * 1000); // 3 minutos

    // Verificar notificações na inicialização (após 5 segundos)
    setTimeout(() => {
        checkPendingNotifications();
    }, 5000);
}

/**
 * Para o sistema de notificações e heartbeat
 */
function stopNotificationSystem() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }

    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// IPC Handler para testar notificação (útil para debug)
ipcMain.handle('test-notification', async (_event, data) => {
    await showNotification(data);
    return { success: true };
});

// ==========================================
// Auto-Launch System (Iniciar com Windows)
// ==========================================

// Obter estado do auto-launch
ipcMain.handle('get-auto-launch-enabled', () => {
    // Se nunca foi configurado, definir como true por padrão
    const storedValue = store.get('autoLaunchEnabled');
    if (storedValue === undefined) {
        // Primeira vez - ativar por padrão
        store.set('autoLaunchEnabled', true);
        app.setLoginItemSettings({
            openAtLogin: true,
            path: app.getPath('exe')
        });
        return true;
    }
    // Retorna o valor salvo no store (fonte de verdade)
    return storedValue;
});

// Definir estado do auto-launch
ipcMain.handle('set-auto-launch-enabled', (event, enabled) => {
    store.set('autoLaunchEnabled', enabled);

    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe')
    });

    return { success: true };
});

// Inicializar Discord RPC quando o app estiver pronto
app.whenReady().then(() => {
    // Configurar auto-launch na primeira execução
    const autoLaunchConfigured = store.get('autoLaunchConfigured', false);
    if (!autoLaunchConfigured) {
        const autoLaunchEnabled = store.get('autoLaunchEnabled', true);
        app.setLoginItemSettings({
            openAtLogin: autoLaunchEnabled,
            path: app.getPath('exe')
        });
        store.set('autoLaunchConfigured', true);
    }

    // Iniciar Discord RPC
    setTimeout(() => {
        initDiscordRPC();
    }, 2000);
});