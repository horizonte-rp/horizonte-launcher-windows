# Horizonte Auth - Módulo SA-MP

Módulo de autenticação para validar jogadores que conectam via Horizonte Launcher.

**Método:** Validação por IP (não usa senha do servidor)

## Como Funciona

```
┌──────────────┐                    ┌─────────┐                    ┌──────────────┐
│   LAUNCHER   │                    │   API   │                    │  SA-MP SERVER│
└──────────────┘                    └─────────┘                    └──────────────┘
       │                                 │                                │
       │  1. Jogador clica "Jogar"       │                                │
       │                                 │                                │
       │  2. POST /request-token.php     │                                │
       │  (registra IP + HWID)           │                                │
       │ ───────────────────────────────►│                                │
       │                                 │                                │
       │  3. Conecta no SA-MP            │                                │
       │  (sem senha, conexão normal)    │                                │
       │ ────────────────────────────────────────────────────────────────►│
       │                                 │                                │
       │                                 │  4. POST /validate-session.php │
       │                                 │  (IP + username)               │
       │                                 │◄─────────────────────────────── │
       │                                 │                                │
       │                                 │  5. { valid: true, hwid: ... } │
       │                                 │ ───────────────────────────────►│
       │                                 │                                │
       │                                 │                     6. Permite │
       │                                 │                        ou Kick │
```

## Instalação

1. Copie `horizonte_auth.pwn` para `pawno/include/`
2. Renomeie para `horizonte_auth.inc`
3. Adicione no topo do seu gamemode:

```pawn
#include <horizonte_auth>
```

4. Faça upload de `validate-session.php` para sua API

## Configuração

Edite as definições no início do arquivo `horizonte_auth.inc`:

```pawn
// URL da sua API
#define HORIZONTE_API_URL       "http://horizontegames.com/api/auth"

// true = Fail-Open (se API cair, permite jogar)
// false = Fail-Closed (se API cair, não permite)
#define HORIZONTE_ALLOW_NO_SESSION      true
```

## Uso no Gamemode

### Verificar se jogador está validado

```pawn
public OnPlayerSpawn(playerid) {
    if (!IsPlayerValidated(playerid)) {
        SendClientMessage(playerid, -1, "Aguarde a validação...");
        return 0;
    }
    return 1;
}
```

### Obter HWID do jogador

```pawn
CMD:meuhwid(playerid) {
    new hwid[65];
    if (GetPlayerHWID(playerid, hwid)) {
        new msg[128];
        format(msg, sizeof(msg), "Seu HWID: %s", hwid);
        SendClientMessage(playerid, -1, msg);
    }
    return 1;
}
```

### Callbacks disponíveis

```pawn
// Chamado quando jogador é validado com sucesso
public OnPlayerAuthValidated(playerid, const hwid[], bool:isVM, const manufacturer[]) {
    new msg[128];
    format(msg, sizeof(msg), "[AUTH] Jogador %d validado. HWID: %.16s...", playerid, hwid);
    print(msg);

    if (isVM) {
        // Jogador está usando VM (você decide o que fazer)
        SendClientMessage(playerid, 0xFFAA00FF, "Aviso: Detectamos que você está usando VM.");
    }

    return 1;
}

// Chamado quando jogador falha na validação
public OnPlayerAuthFailed(playerid, reason) {
    new name[MAX_PLAYER_NAME];
    GetPlayerName(playerid, name, sizeof(name));

    switch (reason) {
        case AUTH_FAIL_NO_SESSION:
            printf("[AUTH] %s tentou conectar sem sessão válida", name);
        case AUTH_FAIL_BANNED:
            printf("[AUTH] %s está banido por HWID", name);
        case AUTH_FAIL_VM_DETECTED:
            printf("[AUTH] %s bloqueado por VM", name);
        case AUTH_FAIL_API_ERROR:
            printf("[AUTH] Erro de API ao validar %s", name);
        case AUTH_FAIL_TIMEOUT:
            printf("[AUTH] Timeout ao validar %s", name);
    }

    return 1;
}
```

## Exemplo Completo

```pawn
#include <a_samp>
#include <horizonte_auth>

main() {
    print("Servidor com Horizonte Auth carregado!");
}

public OnGameModeInit() {
    SetGameModeText("Horizonte RP");
    return 1;
}

public OnPlayerConnect(playerid) {
    // Este callback só é chamado APÓS a validação bem sucedida
    // (o módulo faz hook e só repassa se validou)

    new name[MAX_PLAYER_NAME];
    GetPlayerName(playerid, name, sizeof(name));

    new msg[128];
    format(msg, sizeof(msg), "%s entrou no servidor (via Launcher)", name);
    SendClientMessageToAll(-1, msg);

    return 1;
}

public OnPlayerAuthValidated(playerid, const hwid[], bool:isVM, const manufacturer[]) {
    // Log no console
    new name[MAX_PLAYER_NAME];
    GetPlayerName(playerid, name, sizeof(name));
    printf("[HORIZONTE] %s validado | HWID: %s | VM: %s", name, hwid, isVM ? "Sim" : "Não");

    return 1;
}

public OnPlayerAuthFailed(playerid, reason) {
    // Logar tentativas de bypass
    new name[MAX_PLAYER_NAME], ip[16];
    GetPlayerName(playerid, name, sizeof(name));
    GetPlayerIp(playerid, ip, sizeof(ip));

    printf("[HORIZONTE] FALHA: %s (%s) - Razão: %d", name, ip, reason);

    return 1;
}
```

## Vantagens da Validação por IP

| Característica | Validação por Token | Validação por IP |
|----------------|---------------------|------------------|
| Usa senha do servidor (-z) | ✅ Sim | ❌ Não |
| Conflito com senha do servidor | ⚠️ Possível | ✅ Nenhum |
| Complexidade | Média | Baixa |
| Segurança | Alta | Alta |

## Notas Importantes

1. **O módulo faz hook no OnPlayerConnect** - seu callback só é chamado após validação
2. **Não bloqueie o jogador antes da validação** - use `IsPlayerValidated()`
3. **Fail-Open vs Fail-Closed** - Configure `HORIZONTE_ALLOW_NO_SESSION` conforme sua preferência
4. **HWID é único por PC** - Use para detectar multi-contas
5. **Servidor pode ter senha** - A validação por IP não interfere com senhas do servidor

## Arquivos da API

Certifique-se de ter estes arquivos na sua API:

- `db.php` - Conexão com banco
- `request-token.php` - Registra sessão (usado pelo launcher)
- `validate-session.php` - Valida sessão por IP (usado pelo servidor)
- `check-ban.php` - Verifica banimentos
- `admin-ban.php` - Gerencia banimentos
