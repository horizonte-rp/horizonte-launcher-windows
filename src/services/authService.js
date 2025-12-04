/**
 * Auth Service
 * Serviço de autenticação que integra HWID e detecção de VM
 * Comunica com a API do servidor para validação e controle de acesso
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const hwidService = require('./hwid');
const vmDetector = require('./vmDetector');

class AuthService {
    constructor() {
        // Configuração da API (será sobrescrita pelo config remoto)
        this.apiBaseUrl = 'http://horizontegames.com/api/auth';

        // Chave secreta para assinatura (deve ser a mesma no servidor)
        // Em produção, isso deveria vir de uma variável de ambiente ou config segura
        this.secretKey = 'horizonte-launcher-secret-2024';

        // Cache do token de sessão
        this.sessionToken = null;
        this.sessionExpiry = null;

        // Cache dos dados do dispositivo
        this.deviceData = null;
    }

    /**
     * Define a URL base da API
     * @param {string} url - URL da API de autenticação
     */
    setApiUrl(url) {
        this.apiBaseUrl = url;
    }

    /**
     * Gera assinatura HMAC para os dados
     * @param {Object} data - Dados a serem assinados
     * @returns {string} - Assinatura HMAC-SHA256
     */
    generateSignature(data) {
        const payload = JSON.stringify(data);
        return crypto.createHmac('sha256', this.secretKey)
            .update(payload)
            .digest('hex');
    }

    /**
     * Verifica se a assinatura é válida
     * @param {Object} data - Dados originais
     * @param {string} signature - Assinatura a verificar
     * @returns {boolean}
     */
    verifySignature(data, signature) {
        const expectedSignature = this.generateSignature(data);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Faz requisição HTTP/HTTPS para a API
     * @param {string} endpoint - Endpoint da API
     * @param {Object} data - Dados a enviar
     * @returns {Promise<Object>} - Resposta da API
     */
    async request(endpoint, data) {
        return new Promise((resolve, reject) => {
            // Garante que a URL base termina com /
            const baseUrl = this.apiBaseUrl.endsWith('/') ? this.apiBaseUrl : this.apiBaseUrl + '/';
            // Remove / inicial do endpoint se existir
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
            const fullUrl = baseUrl + cleanEndpoint;

            const url = new URL(fullUrl);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;

            const payload = JSON.stringify(data);

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'X-Launcher-Version': require('../../package.json').version || '1.0.0',
                    'X-Request-Timestamp': Date.now().toString()
                },
                timeout: 15000
            };

            const req = client.request(options, (res) => {
                let body = '';

                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        resolve(response);
                    } catch (error) {
                        console.error('[AuthService] Erro ao parsear JSON:', body.slice(0, 500));
                        reject(new Error('Resposta inválida do servidor'));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[AuthService] Erro na requisição:', error.message);
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout na conexão com o servidor'));
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Coleta dados do dispositivo (HWID + VM)
     * @returns {Object} - Dados do dispositivo
     */
    collectDeviceData() {
        // Se já tem dados cacheados, apenas atualiza timestamp e assinatura
        if (this.deviceData) {
            this.deviceData.timestamp = Date.now();
            this.deviceData.signature = this.generateSignature({
                hwid: this.deviceData.hwid,
                timestamp: this.deviceData.timestamp
            });
            return this.deviceData;
        }

        const hwid = hwidService.getHWID();
        const vmCheck = vmDetector.detect();

        this.deviceData = {
            hwid: hwid.hash,
            hwidComponents: hwid.components,
            manufacturer: hwid.manufacturer,
            isVM: vmCheck.isVM,
            vmConfidence: vmCheck.confidence,
            vmReasons: vmCheck.reasons,
            platform: process.platform,
            arch: process.arch,
            timestamp: Date.now()
        };

        // Gera assinatura dos dados
        this.deviceData.signature = this.generateSignature({
            hwid: this.deviceData.hwid,
            timestamp: this.deviceData.timestamp
        });

        return this.deviceData;
    }

    /**
     * Registra o dispositivo no servidor (vincular HWID à conta)
     * @param {string} username - Nome de usuário
     * @param {string} password - Senha (opcional, para verificação)
     * @returns {Promise<Object>} - Resultado do registro
     */
    async registerDevice(username, password = null) {
        const deviceData = this.collectDeviceData();

        const payload = {
            action: 'register_device',
            username: username,
            password: password, // Pode ser hash ou null
            device: deviceData
        };

        try {
            const response = await this.request('/register-device.php', payload);

            if (!response.success) {
                console.error('[AuthService] Falha no registro:', response.error);
            }

            return response;
        } catch (error) {
            console.error('[AuthService] Erro ao registrar dispositivo:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'CONNECTION_ERROR'
            };
        }
    }

    /**
     * Verifica se o HWID está banido
     * @returns {Promise<Object>} - Status do ban
     */
    async checkBan() {
        const deviceData = this.collectDeviceData();

        const payload = {
            action: 'check_ban',
            hwid: deviceData.hwid,
            signature: deviceData.signature,
            timestamp: deviceData.timestamp
        };

        try {
            const response = await this.request('/check-ban.php', payload);

            return response;
        } catch (error) {
            console.error('[AuthService] Erro ao verificar ban:', error.message);
            // Em caso de erro, permite jogar (fail-open)
            return {
                banned: false,
                error: error.message
            };
        }
    }

    /**
     * Solicita token de sessão para conectar ao servidor
     * @param {string} username - Nickname do jogador
     * @param {string} serverId - ID do servidor
     * @returns {Promise<Object>} - Token de sessão
     */
    async requestSessionToken(username, serverId) {
        const deviceData = this.collectDeviceData();

        // Verifica se é VM
        if (deviceData.isVM) {
            // Pode bloquear ou apenas avisar
            // return { success: false, error: 'Máquinas virtuais não são permitidas', code: 'VM_DETECTED' };
        }

        const payload = {
            action: 'request_token',
            username: username,
            serverId: serverId,
            device: deviceData
        };

        try {
            const response = await this.request('/request-token.php', payload);

            if (response.success && response.token) {
                this.sessionToken = response.token;
                this.sessionExpiry = Date.now() + (response.expiresIn || 300) * 1000; // Default 5 min
            }

            return response;
        } catch (error) {
            console.error('[AuthService] Erro ao solicitar token:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'CONNECTION_ERROR'
            };
        }
    }

    /**
     * Verifica se tem token válido
     * @returns {boolean}
     */
    hasValidToken() {
        return this.sessionToken && this.sessionExpiry && Date.now() < this.sessionExpiry;
    }

    /**
     * Obtém o token atual (para enviar na senha do SAMP)
     * @returns {string|null}
     */
    getToken() {
        if (this.hasValidToken()) {
            return this.sessionToken;
        }
        return null;
    }

    /**
     * Invalida o token atual
     */
    clearToken() {
        this.sessionToken = null;
        this.sessionExpiry = null;
    }

    /**
     * Limpa cache do dispositivo (força nova coleta)
     */
    clearDeviceCache() {
        this.deviceData = null;
        hwidService.clearCache();
    }

    /**
     * Verifica launcher antes de jogar (workflow completo)
     * @param {string} username - Nickname
     * @param {string} serverId - ID do servidor
     * @returns {Promise<Object>} - Resultado da verificação
     */
    async verifyBeforePlay(username, serverId) {
        // 1. Coleta dados do dispositivo
        const deviceData = this.collectDeviceData();

        // 2. Verifica se é VM (opcional: bloquear)
        if (deviceData.isVM) {
            return {
                success: false,
                canPlay: false,
                error: 'Máquinas virtuais não são permitidas para jogar.',
                code: 'VM_DETECTED',
                vmReasons: deviceData.vmReasons
            };
        }

        // 3. Verifica banimento
        const banCheck = await this.checkBan();
        if (banCheck.banned) {
            return {
                success: false,
                canPlay: false,
                error: `Você está banido: ${banCheck.reason}`,
                code: 'HWID_BANNED',
                banInfo: {
                    reason: banCheck.reason,
                    expiresAt: banCheck.expiresAt,
                    bannedBy: banCheck.bannedBy
                }
            };
        }

        // 4. Solicita token de sessão
        const tokenResult = await this.requestSessionToken(username, serverId);
        if (!tokenResult.success) {
            // Verifica se é um erro que deve bloquear o jogo
            const blockingCodes = ['HWID_BANNED', 'VM_BLOCKED', 'VM_DETECTED'];
            const shouldBlock = blockingCodes.includes(tokenResult.code);

            return {
                success: false,
                canPlay: !shouldBlock, // Só permite jogar se não for erro de ban/VM
                error: tokenResult.error,
                code: tokenResult.code,
                token: null
            };
        }

        // 5. Sucesso!
        return {
            success: true,
            canPlay: true,
            token: tokenResult.token,
            expiresIn: tokenResult.expiresIn,
            message: 'Verificação concluída com sucesso'
        };
    }

    /**
     * Obtém resumo do status de autenticação
     * @returns {Object}
     */
    getStatus() {
        return {
            hasDeviceData: !!this.deviceData,
            hwid: this.deviceData?.hwid ? this.deviceData.hwid.slice(0, 16) + '...' : null,
            isVM: this.deviceData?.isVM || false,
            hasToken: this.hasValidToken(),
            tokenExpiry: this.sessionExpiry ? new Date(this.sessionExpiry).toISOString() : null
        };
    }
}

// Exporta instância única (singleton)
module.exports = new AuthService();
