# Horizonte Launcher - Auth API

Sistema de autenticação por HWID para controle de acesso ao servidor.

## Instalação

### 1. Configurar Banco de Dados

```sql
-- Execute o schema.sql no seu MySQL/MariaDB
mysql -u root -p < auth/schema.sql
```

### 2. Configurar Conexão

Edite `auth/db.php`:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'horizonte_launcher');
define('DB_USER', 'seu_usuario');
define('DB_PASS', 'sua_senha');

// IMPORTANTE: Use a mesma chave no launcher (authService.js)
define('SECRET_KEY', 'horizonte-launcher-secret-2024');
```

### 3. Configurar Chave de Admin

Edite `auth/admin-ban.php`:

```php
define('ADMIN_KEY', 'sua-chave-secreta-de-admin-aqui');
```

### 4. Upload para o Servidor

Faça upload da pasta `auth/` para:
```
http://horizontegames.com/api/auth/
```

---

## Endpoints

### POST `/auth/check-ban.php`
Verifica se um HWID está banido.

**Request:**
```json
{
  "hwid": "hash_sha256_do_hwid",
  "signature": "assinatura_hmac",
  "timestamp": 1732718975000
}
```

**Response (não banido):**
```json
{
  "banned": false
}
```

**Response (banido):**
```json
{
  "banned": true,
  "reason": "Uso de cheats",
  "bannedBy": "Admin",
  "createdAt": "2025-01-15 10:30:00",
  "expiresAt": "2025-02-15 10:30:00"
}
```

---

### POST `/auth/register-device.php`
Registra/vincula um HWID a uma conta.

**Request:**
```json
{
  "username": "NickDoJogador",
  "device": {
    "hwid": "hash_sha256_do_hwid",
    "isVM": false,
    "manufacturer": "Gigabyte Technology Co., Ltd.",
    "signature": "assinatura_hmac",
    "timestamp": 1732718975000
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Dispositivo registrado com sucesso"
}
```

---

### POST `/auth/request-token.php`
Gera token de sessão para conectar ao servidor.

**Request:**
```json
{
  "username": "NickDoJogador",
  "serverId": "1",
  "device": {
    "hwid": "hash_sha256_do_hwid",
    "isVM": false,
    "manufacturer": "Gigabyte"
  }
}
```

**Response:**
```json
{
  "success": true,
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "expiresIn": 300,
  "expiresAt": "2025-01-15 10:35:00"
}
```

---

### POST `/auth/validate-token.php`
Valida token (chamado pelo servidor SAMP).

**Request:**
```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "username": "NickDoJogador",
  "ip": "192.168.1.100"
}
```

**Response:**
```json
{
  "valid": true,
  "hwid": "hash_sha256_do_hwid",
  "username": "NickDoJogador",
  "serverId": "1",
  "launcherIp": "192.168.1.100",
  "device": {
    "manufacturer": "Gigabyte",
    "isVM": false,
    "firstSeen": "2025-01-10 08:00:00"
  }
}
```

---

### POST `/auth/admin-ban.php`
Gerencia banimentos (requer adminKey).

#### Banir HWID:
```json
{
  "adminKey": "sua-chave-secreta-de-admin-aqui",
  "action": "ban",
  "hwid": "hash_do_hwid",
  "reason": "Uso de cheats",
  "bannedBy": "Admin",
  "days": 30
}
```

Ou por username:
```json
{
  "adminKey": "sua-chave-secreta-de-admin-aqui",
  "action": "ban",
  "username": "NickDoJogador",
  "reason": "Uso de cheats",
  "days": null
}
```
> `days: null` = ban permanente

#### Desbanir:
```json
{
  "adminKey": "sua-chave-secreta-de-admin-aqui",
  "action": "unban",
  "hwid": "hash_do_hwid"
}
```

#### Listar bans ativos:
```json
{
  "adminKey": "sua-chave-secreta-de-admin-aqui",
  "action": "list"
}
```

#### Buscar info de jogador:
```json
{
  "adminKey": "sua-chave-secreta-de-admin-aqui",
  "action": "info",
  "username": "NickDoJogador"
}
```

---

## Fluxo de Autenticação

```
┌─────────────┐                              ┌─────────────┐
│   LAUNCHER  │                              │     API     │
└─────────────┘                              └─────────────┘
       │                                            │
       │  1. Coleta HWID + Detecta VM               │
       │                                            │
       │  2. POST /check-ban.php                    │
       │ ────────────────────────────────────────►  │
       │                                            │
       │  3. { banned: false }                      │
       │ ◄────────────────────────────────────────  │
       │                                            │
       │  4. POST /request-token.php                │
       │ ────────────────────────────────────────►  │
       │                                            │
       │  5. { token: "abc123..." }                 │
       │ ◄────────────────────────────────────────  │
       │                                            │
       │  6. Conecta ao SAMP com token na senha     │
       │                                            │
       ▼                                            │
┌─────────────┐                                     │
│   SA-MP     │                                     │
│   SERVER    │                                     │
└─────────────┘                                     │
       │                                            │
       │  7. POST /validate-token.php               │
       │ ────────────────────────────────────────►  │
       │                                            │
       │  8. { valid: true, hwid: "..." }           │
       │ ◄────────────────────────────────────────  │
       │                                            │
       │  9. Permite/Bloqueia conexão               │
       ▼                                            │
```

---

## Integração com Servidor SAMP (PAWN)

Exemplo de como validar o token no servidor SAMP:

```pawn
#include <a_http>

public OnPlayerConnect(playerid)
{
    // Obtém a senha que o jogador usou (onde está o token)
    new token[64];
    GetPlayerPassword(playerid, token, sizeof(token));

    if(strlen(token) == 0)
    {
        // Jogador não usou launcher
        SendClientMessage(playerid, COLOR_RED, "Use o Horizonte Launcher para conectar!");
        Kick(playerid);
        return 1;
    }

    // Valida token via HTTP
    new request[256];
    format(request, sizeof(request),
        "{\"token\":\"%s\",\"username\":\"%s\",\"ip\":\"%s\"}",
        token, GetPlayerNameEx(playerid), GetPlayerIpEx(playerid));

    HTTP(playerid, HTTP_POST, "horizontegames.com/api/auth/validate-token.php", request, "OnTokenValidated");
    return 1;
}

forward OnTokenValidated(playerid, response_code, data[]);
public OnTokenValidated(playerid, response_code, data[])
{
    if(response_code != 200)
    {
        SendClientMessage(playerid, COLOR_RED, "Erro ao validar launcher. Tente novamente.");
        Kick(playerid);
        return 1;
    }

    // Parse JSON response
    // Se valid == true, permite jogar
    // Se valid == false, kick com mensagem

    return 1;
}
```

---

## Tabelas do Banco

| Tabela | Descrição |
|--------|-----------|
| `player_devices` | HWIDs vinculados a cada jogador |
| `hwid_bans` | Banimentos por HWID |
| `session_tokens` | Tokens de sessão temporários |
| `auth_logs` | Log de todas as atividades |

---

## Manutenção

### Limpar tokens expirados (cron diário):
```sql
CALL cleanup_expired_tokens();
```

### Limpar logs antigos (cron semanal):
```sql
CALL cleanup_old_logs(30);  -- Remove logs com mais de 30 dias
```

### Views úteis:
```sql
-- Jogadores com múltiplos HWIDs (possível multi-conta)
SELECT * FROM v_multi_hwid_players;

-- HWIDs compartilhados entre contas
SELECT * FROM v_shared_hwid;

-- Bans ativos
SELECT * FROM v_active_bans;
```
