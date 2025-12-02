/*
 * =========================================================================
 *  HORIZONTE LAUNCHER - AUTH MODULE (Validação por IP)
 *  Módulo de autenticação para servidor SA-MP
 * =========================================================================
 *
 *  INSTALAÇÃO:
 *  1. Copie este arquivo para a pasta 'pawno/include/'
 *  2. Renomeie para 'horizonte_auth.inc'
 *  3. No seu gamemode, adicione: #include <horizonte_auth>
 *  4. Configure a URL da API abaixo
 *  5. Compile e teste
 *
 *  COMO FUNCIONA:
 *  - Jogador abre o launcher e clica em "Jogar"
 *  - Launcher registra o IP do jogador na API
 *  - Jogador conecta no servidor SA-MP
 *  - Servidor pergunta pra API: "esse IP tem sessão válida?"
 *  - Se sim, permite. Se não, kick.
 *
 * =========================================================================
 */

#if defined _horizonte_auth_included
    #endinput
#endif
#define _horizonte_auth_included

#include <YSI_Coding\y_hooks>

// =========================================================================
// CONFIGURAÇÕES - EDITE AQUI
// =========================================================================

// URL da API de autenticação (sem barra no final)
#define HORIZONTE_API_URL       "horizontegames.com/api/auth"


// Permitir jogadores sem sessão válida? (true = permite, false = kick)
// Use true para Fail-Open (se API cair, permite jogar)
// Use false para Fail-Closed (se API cair, não permite)
#define HORIZONTE_ALLOW_NO_SESSION      true

// Tempo máximo para validar sessão (em ms)
#define HORIZONTE_TIMEOUT       10000

// Mensagem de ban (usada no comando /banserial)
#define MSG_BANNED              "ERRO: Você está banido: %s"

// Chave secreta para endpoints admin (DEVE ser igual a API)
#define HORIZONTE_ADMIN_KEY     "HqW5Rxj81jaMt69y31qSXnhrtKIfA6"

// =========================================================================
// VARIÁVEIS INTERNAS
// =========================================================================

static bool:g_PlayerValidated[MAX_PLAYERS];
static g_PlayerHWID[MAX_PLAYERS][65];
static g_ValidationTimer[MAX_PLAYERS];

// =========================================================================
// CALLBACKS PÚBLICOS (para o gamemode usar)
// =========================================================================

// Chamado quando jogador é validado com sucesso
forward OnPlayerAuthValidated(playerid, const hwid[], bool:isVM, const manufacturer[]);

// Chamado quando jogador falha na validação
forward OnPlayerAuthFailed(playerid, reason);

// Razões de falha
enum {
    AUTH_FAIL_NO_SESSION = 0,
    AUTH_FAIL_BANNED,
    AUTH_FAIL_VM_DETECTED,
    AUTH_FAIL_API_ERROR,
    AUTH_FAIL_TIMEOUT
}

// =========================================================================
// FUNÇÕES PÚBLICAS
// =========================================================================

/**
 * Verifica se o jogador foi validado
 * @param playerid ID do jogador
 * @return true se validado, false se não
 */
stock bool:IsPlayerValidated(playerid) {
    if (playerid < 0 || playerid >= MAX_PLAYERS) return false;
    return g_PlayerValidated[playerid];
}

/**
 * Obtém o HWID do jogador (após validação)
 * @param playerid ID do jogador
 * @param hwid Array para armazenar o HWID
 * @param len Tamanho do array
 * @return true se sucesso, false se não validado
 */
stock bool:GetPlayerHWID(playerid, hwid[], len = sizeof(hwid)) {
    if (!IsPlayerValidated(playerid)) return false;
    strcat((hwid[0] = EOS, hwid), g_PlayerHWID[playerid], len);
    return true;
}

// =========================================================================
// HOOKS DE CONEXÃO
// =========================================================================

hook OnPlayerConnect(playerid) {
    // Resetar estado
    g_PlayerValidated[playerid] = false;
    g_PlayerHWID[playerid][0] = EOS;
    g_ValidationTimer[playerid] = 0;

    // Validar sessão via API (por IP)
    ValidatePlayerSession(playerid);

    // Timer de timeout
    g_ValidationTimer[playerid] = SetTimerEx("OnValidationTimeout", HORIZONTE_TIMEOUT, false, "i", playerid);

    return 1;
}

hook OnPlayerDisconnect(playerid, reason) {
    // Limpar timer se existir
    if (g_ValidationTimer[playerid]) {
        KillTimer(g_ValidationTimer[playerid]);
        g_ValidationTimer[playerid] = 0;
    }

    // Limpar dados
    g_PlayerValidated[playerid] = false;
    g_PlayerHWID[playerid][0] = EOS;

    return 1;
}

// =========================================================================
// FUNÇÕES INTERNAS
// =========================================================================

static ValidatePlayerSession(playerid) {
    new name[MAX_PLAYER_NAME], ip[16];
    GetPlayerName(playerid, name, sizeof(name));
    GetPlayerIp(playerid, ip, sizeof(ip));

    // Monta o JSON do request (só precisa IP e username)
    new request[256];
    format(request, sizeof(request),
        "{\"username\":\"%s\",\"ip\":\"%s\"}",
        name, ip
    );

    // Envia request HTTP para validate-session.php
    new url[128];
    format(url, sizeof(url), "%s/validate-session.php", HORIZONTE_API_URL);

    HTTP(playerid, HTTP_POST, url, request, "OnSessionValidationResponse");
}

forward OnSessionValidationResponse(playerid, response_code, data[]);
public OnSessionValidationResponse(playerid, response_code, data[]) {
    // Cancela timer de timeout
    if (g_ValidationTimer[playerid]) {
        KillTimer(g_ValidationTimer[playerid]);
        g_ValidationTimer[playerid] = 0;
    }

    // Verifica se jogador ainda está conectado
    if (!IsPlayerConnected(playerid)) return 0;

    // Erro HTTP
    if (response_code != 200) {
        printf("[HORIZONTE] Erro HTTP %d ao validar %s", response_code, PlayerName(playerid));
        #if HORIZONTE_ALLOW_NO_SESSION == true
            // Fail-open: permite jogar mesmo com erro
            g_PlayerValidated[playerid] = true;

            if (funcidx("OnPlayerAuthValidated") != -1) {
                CallLocalFunction("OnPlayerAuthValidated", "isbs", playerid, "unknown", false, "unknown");
            }
        #else
            // Fail-closed: não permite
            Kickar(playerid);

            if (funcidx("OnPlayerAuthFailed") != -1) {
                CallLocalFunction("OnPlayerAuthFailed", "ii", playerid, AUTH_FAIL_API_ERROR);
            }
        #endif
        return 0;
    }

    // Parse da resposta JSON (simplificado)
    new bool:valid = (strfind(data, "\"valid\":true") != -1);

    if (!valid) {
        // Identifica o erro
        new reason = AUTH_FAIL_NO_SESSION;

        if (strfind(data, "banido") != -1 || strfind(data, "banned") != -1) {
            reason = AUTH_FAIL_BANNED;
            printf("[HORIZONTE] %s BANIDO - Conexão recusada", PlayerName(playerid));
        }
        else if (strfind(data, "VM") != -1 || strfind(data, "virtual") != -1) {
            reason = AUTH_FAIL_VM_DETECTED;
            printf("[HORIZONTE] %s bloqueado - VM detectada", PlayerName(playerid));
        }
        else {
            printf("[HORIZONTE] %s sem sessao valida - Use o Launcher", PlayerName(playerid));
        }

        Kickar(playerid);

        if (funcidx("OnPlayerAuthFailed") != -1) {
            CallLocalFunction("OnPlayerAuthFailed", "ii", playerid, reason);
        }
        return 0;
    }

    // Validação bem sucedida!
    g_PlayerValidated[playerid] = true;

    // Extrai HWID da resposta
    new hwid_start = strfind(data, "\"hwid\":\"");
    if (hwid_start != -1) {
        hwid_start += 8; // Pula "hwid":"
        new hwid_end = strfind(data, "\"", false, hwid_start);
        if (hwid_end != -1) {
            strmid(g_PlayerHWID[playerid], data, hwid_start, hwid_end, sizeof(g_PlayerHWID[]));
        }
    }

    // Verifica se é VM
    new bool:isVM = (strfind(data, "\"isVM\":true") != -1);

    // Log de sucesso no console
    printf("[HORIZONTE] %s validado com sucesso | HWID: %.16s...", PlayerName(playerid), g_PlayerHWID[playerid]);

    // Callback para o gamemode
    if (funcidx("OnPlayerAuthValidated") != -1) {
        CallLocalFunction("OnPlayerAuthValidated", "isbs", playerid, g_PlayerHWID[playerid], isVM, "");
    }

    return 1;
}

forward OnValidationTimeout(playerid);
public OnValidationTimeout(playerid) {
    g_ValidationTimer[playerid] = 0;

    if (!IsPlayerConnected(playerid)) return 0;
    if (g_PlayerValidated[playerid]) return 0; // Já validou

    #if HORIZONTE_ALLOW_NO_SESSION == true
        // Timeout - permite jogar (fail-open)
        g_PlayerValidated[playerid] = true;
    #else
        // Timeout - kick (fail-closed)
        Kickar(playerid);

        if (funcidx("OnPlayerAuthFailed") != -1) {
            CallLocalFunction("OnPlayerAuthFailed", "ii", playerid, AUTH_FAIL_TIMEOUT);
        }
    #endif

    return 1;
}

// =========================================================================
// NOTA: y_hooks gerencia automaticamente os hooks de callbacks
// Não é necessário ALS manual quando usando y_hooks
// =========================================================================

// =========================================================================
// COMANDOS ZCMD - GERENCIAMENTO DE BANS POR HWID
// =========================================================================

// Variáveis para armazenar quem executou o comando (para callback HTTP)
static g_BanCommandSender = INVALID_PLAYER_ID;
static g_UnbanCommandSender = INVALID_PLAYER_ID;

/**
 * CMD:banserial - Bane PERMANENTEMENTE um jogador online pelo seu HWID
 * Uso: /banserial [id] [motivo]
 */
CMD:banserial(playerid, const params[]) {
    if (pInfo[playerid][Admin] < 5) return SendClientMessage(playerid, COR_ERRO, "ERRO: Comando Invalido");

    new targetid, reason[128];
    if (sscanf(params, "us[128]", targetid, reason)) {
        SendClientMessage(playerid, COR_ERRO, "ERRO: Use /banserial [id] [motivo] - Ban permanente");
        return 1;
    }

    if (!IsPlayerConnected(targetid)) return SendClientMessage(playerid, COR_ERRO, "ERRO: Jogador não conectado.");
    if (!IsPlayerValidated(targetid)) return SendClientMessage(playerid, COR_ERRO, "ERRO: Jogador ainda não foi validado (sem HWID).");

    new hwid[65];
    GetPlayerHWID(targetid, hwid);

    if (strlen(hwid) < 10) return SendClientMessage(playerid, COR_ERRO, "ERRO: HWID inválido ou não disponível.");

    // Monta request para API (permanente)
    new request[612], url[128];
    format(request, sizeof(request),
        "{\"action\":\"ban\",\"adminKey\":\"%s\",\"hwid\":\"%s\",\"reason\":\"%s\",\"days\":null,\"bannedBy\":\"%s\",\"username\":\"%s\"}",
        HORIZONTE_ADMIN_KEY, hwid, reason, PlayerName(playerid), PlayerName(targetid)
    );
    format(url, sizeof(url), "%s/admin-ban.php", HORIZONTE_API_URL);

    g_BanCommandSender = playerid;
    HTTP(playerid, HTTP_POST, url, request, "OnBanSerialResponse");

    // Kick o jogador banido
    new msg[144];
    format(msg, sizeof(msg), MSG_BANNED, reason);
    SendClientMessage(targetid, COR_ERRO, msg);
    Kickar(targetid);

    // Log no console
    printf("[HORIZONTE] ADMIN %s baniu HWID de %s PERMANENTE | Motivo: %s", PlayerName(playerid), PlayerName(targetid), reason);

    // Mensagem para o admin
    format(msg, sizeof(msg), "ADMIN: Banindo HWID de %s PERMANENTE... Motivo: %s", PlayerName(targetid), reason);
    SendClientMessage(playerid, COR_XP, msg);

    return 1;
}

/**
 * CMD:tempbanserial - Bane TEMPORARIAMENTE um jogador online pelo seu HWID
 * Uso: /tempbanserial [id] [dias] [motivo]
 */
CMD:tempbanserial(playerid, const params[]) {
    if (pInfo[playerid][Admin] < 5) return SendClientMessage(playerid, COR_ERRO, "ERRO: Comando Invalido");

    new targetid, days, reason[128];
    if (sscanf(params, "uds[128]", targetid, days, reason)) {
        SendClientMessage(playerid, COR_ERRO, "ERRO: /tempbanserial [id] [dias] [motivo]");
        return 1;
    }

    if (days < 1) return SendClientMessage(playerid, COR_ERRO, "ERRO: Dias deve ser maior que 0. Use /banserial para ban permanente.");
    if (!IsPlayerConnected(targetid)) return SendClientMessage(playerid, COR_ERRO, "ERRO: Jogador não conectado.");
    if (!IsPlayerValidated(targetid)) return SendClientMessage(playerid, COR_ERRO, "ERRO: Jogador ainda não foi validado (sem HWID).");

    new hwid[65];
    GetPlayerHWID(targetid, hwid);

    if (strlen(hwid) < 10) return SendClientMessage(playerid, COR_ERRO, "ERRO: HWID inválido ou não disponível.");

    // Monta request para API (temporário)
    new request[612], url[128];
    format(request, sizeof(request),
        "{\"action\":\"ban\",\"adminKey\":\"%s\",\"hwid\":\"%s\",\"reason\":\"%s\",\"days\":%d,\"bannedBy\":\"%s\",\"username\":\"%s\"}",
        HORIZONTE_ADMIN_KEY, hwid, reason, days, PlayerName(playerid), PlayerName(targetid)
    );
    format(url, sizeof(url), "%s/admin-ban.php", HORIZONTE_API_URL);

    g_BanCommandSender = playerid;
    HTTP(playerid, HTTP_POST, url, request, "OnBanSerialResponse");

    // Kick o jogador banido
    new msg[144];
    format(msg, sizeof(msg), MSG_BANNED, reason);
    SendClientMessage(targetid, COR_ERRO, msg);
    Kickar(targetid);

    // Log no console
    printf("[HORIZONTE] ADMIN %s baniu HWID de %s por %d dias | Motivo: %s", PlayerName(playerid), PlayerName(targetid), days, reason);

    // Mensagem para o admin
    format(msg, sizeof(msg), "ADMIN: Banindo HWID de %s por %d dias... Motivo: %s", PlayerName(targetid), days, reason);
    SendClientMessage(playerid, COR_XP, msg);

    return 1;
}

forward OnBanSerialResponse(playerid, response_code, data[]);
public OnBanSerialResponse(playerid, response_code, data[]) {
    if (g_BanCommandSender == INVALID_PLAYER_ID) return 0;
    if (!IsPlayerConnected(g_BanCommandSender)) {
        g_BanCommandSender = INVALID_PLAYER_ID;
        return 0;
    }

    if (response_code == 200 && strfind(data, "\"success\":true") != -1) {
        SendClientMessage(g_BanCommandSender, COR_XP, "ADMIN: HWID banido com sucesso na API!");
    } else {
        SendClientMessage(g_BanCommandSender, COR_ERRO, "ERRO: Jogador kickado, mas houve erro ao registrar ban na API.");
        printf("[HORIZONTE] Erro ao banir na API: %d - %.100s", response_code, data);
    }

    g_BanCommandSender = INVALID_PLAYER_ID;
    return 1;
}

/**
 * CMD:unbanserial - Desbane um HWID
 * Uso: /unbanserial [hwid]
 */
CMD:unbanserial(playerid, const params[]) {
    if (pInfo[playerid][Admin] < 5) return SendClientMessage(playerid, COR_ERRO, "ERRO: Comando Invalido");

    new hwid[65];
    if (sscanf(params, "s[65]", hwid)) {
        SendClientMessage(playerid, COR_ERRO, "ERRO: Digite /unbanserial [hwid]");
        return 1;
    }

    if (strlen(hwid) < 10) return SendClientMessage(playerid, COR_ERRO, "ERRO: HWID inválido (muito curto).");

    // Monta request para API
    new request[356], url[128];
    format(request, sizeof(request),
        "{\"action\":\"unban\",\"adminKey\":\"%s\",\"hwid\":\"%s\",\"bannedBy\":\"%s\"}",
        HORIZONTE_ADMIN_KEY, hwid, PlayerName(playerid)
    );
    format(url, sizeof(url), "%s/admin-ban.php", HORIZONTE_API_URL);

    g_UnbanCommandSender = playerid;
    HTTP(playerid, HTTP_POST, url, request, "OnUnbanSerialResponse");

    printf("[HORIZONTE] ADMIN %s desbanindo HWID: %.16s...", PlayerName(playerid), hwid);
    SendClientMessage(playerid, -1, "INFO: Processando desbanimento...");

    return 1;
}

forward OnUnbanSerialResponse(playerid, response_code, data[]);
public OnUnbanSerialResponse(playerid, response_code, data[]) {
    if (g_UnbanCommandSender == INVALID_PLAYER_ID) return 0;
    if (!IsPlayerConnected(g_UnbanCommandSender)) {
        g_UnbanCommandSender = INVALID_PLAYER_ID;
        return 0;
    }

    if (response_code == 200 && strfind(data, "\"success\":true") != -1) {
        SendClientMessage(g_UnbanCommandSender, COR_XP, "ADMIN: HWID desbanido com sucesso!");
    } else if (strfind(data, "not found") != -1 || strfind(data, "nao encontrado") != -1) {
        SendClientMessage(g_UnbanCommandSender, -1, "INFO: HWID não estava banido.");
    } else {
        SendClientMessage(g_UnbanCommandSender, COR_ERRO, "ERRO: Falha ao desbanir. Verifique o console.");
        printf("[HORIZONTE] Erro ao desbanir: %d - %.100s", response_code, data);
    }

    g_UnbanCommandSender = INVALID_PLAYER_ID;
    return 1;
}

/**
 * CMD:checkserial - Verifica o HWID de um jogador online
 * Uso: /checkserial [id]
 */
CMD:checkserial(playerid, const params[]) {
    if (pInfo[playerid][Admin] < 5) return SendClientMessage(playerid, COR_ERRO, "ERRO: Comando Invalido");

    new targetid;
    if (sscanf(params, "u", targetid)) {
        SendClientMessage(playerid, -1, "INFO: Digite /Checkserial [id]");
        return 1;
    }

    if (!IsPlayerConnected(targetid)) return SendClientMessage(playerid, COR_ERRO, "ERRO: Jogador não conectado.");

    if (!IsPlayerValidated(targetid)) {
        new msg[128];
        format(msg, sizeof(msg), "INFO: %s ainda não foi validado (aguardando API).", PlayerName(targetid));
        SendClientMessage(playerid, -1, msg);
        return 1;
    }

    new hwid[65], msg[144];
    GetPlayerHWID(targetid, hwid);

    format(msg, sizeof(msg), "ADMIN: HWID de %s: %s", PlayerName(targetid), hwid);
    SendClientMessage(playerid, COR_XP, msg);

    return 1;
}

/**
 * CMD:myserial - Mostra seu próprio HWID
 * Uso: /myserial
 */
CMD:myserial(playerid, const params[]) {
    #pragma unused params

    if (!IsPlayerValidated(playerid)) return SendClientMessage(playerid, -1, "INFO: Aguarde a validação...");

    new hwid[65], msg[128];
    GetPlayerHWID(playerid, hwid);

    format(msg, sizeof(msg), "INFO: Seu HWID: %s", hwid);
    SendClientMessage(playerid, -1, msg);

    return 1;
}
