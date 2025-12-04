# 🎮 Horizonte Launcher

Sistema completo de launcher para servidores SA-MP com autenticação HWID, notificações push, painel administrativo e proteção anti-bot.

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Arquitetura](#-arquitetura)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Instalação e Configuração](#-instalação-e-configuração)
  - [1. Banco de Dados](#1-banco-de-dados)
  - [2. API Backend](#2-api-backend)
  - [3. Launcher Desktop](#3-launcher-desktop)
  - [4. Servidor SA-MP](#4-servidor-sa-mp)
- [Painel Administrativo](#-painel-administrativo)
- [Segurança](#-segurança)
- [Desenvolvimento](#-desenvolvimento)
- [Troubleshooting](#-troubleshooting)

---

## 🚀 Visão Geral

O Horizonte Launcher é uma solução completa para gerenciamento de servidores SA-MP, incluindo:

### ✨ Funcionalidades

- **Autenticação HWID**: Identificação única por hardware, prevenindo multi-contas
- **Sistema de Banimentos**: Banimento permanente ou temporário por HWID
- **Notificações Push**: Sistema de notificações em tempo real
- **Heartbeat/Sessões**: Monitoramento de sessões ativas
- **Detecção de VM**: Identificação automática de máquinas virtuais
- **Painel Admin**: Interface web completa para gerenciamento
- **CAPTCHA**: Proteção anti-bot no login administrativo
- **Cache Inteligente**: Carregamento instantâneo após primeira execução
- **Multi-Servidor**: Suporte para múltiplos servidores e categorias

### 🛠️ Tecnologias

**Frontend (Launcher):**
- Electron 33.2.1
- JavaScript ES6+
- HTML5/CSS3
- Discord Rich Presence

**Backend (API):**
- PHP 7.4+
- MySQL 8.0+
- PDO (Prepared Statements)
- Google reCAPTCHA v2

**Servidor SA-MP:**
- Pawn (SA-MP Scripting)
- Requests plugin (HTTP)

---

## 🏗️ Arquitetura

```
┌──────────────────┐
│  LAUNCHER (EXE)  │  ← Electron Desktop App
└────────┬─────────┘
         │
         ├─ Autenticação HWID
         ├─ Heartbeat (30s)
         ├─ Notificações Push
         ├─ Cache Local
         │
         ▼
┌──────────────────┐
│   API (PHP)      │  ← Backend REST API
└────────┬─────────┘
         │
         ├─ /auth/*           (Autenticação)
         ├─ /notifications/*  (Notificações)
         ├─ /session/*        (Heartbeat)
         ├─ /content/*        (Servidores/Mods/News)
         ├─ /admin/*          (Painel Admin)
         │
         ▼
┌──────────────────┐
│  MYSQL DATABASE  │  ← Banco de Dados
└────────┬─────────┘
         │
         ├─ player_devices
         ├─ hwid_bans
         ├─ session_tokens
         ├─ launcher_sessions
         ├─ notifications
         ├─ launcher_servers
         ├─ launcher_mods
         └─ launcher_news

┌──────────────────┐
│  SA-MP SERVER    │  ← Gamemode Integration
└──────────────────┘
```

---

## 📁 Estrutura do Projeto

```
horizonte-launcher-windows/
├── src/                          # Código-fonte do launcher
│   ├── main.js                   # Processo principal Electron
│   ├── index.html                # Interface principal
│   ├── js/
│   │   └── renderer.js           # Lógica da UI
│   ├── services/
│   │   ├── authService.js        # Autenticação HWID
│   │   └── vmDetector.js         # Detecção de VM
│   ├── samp-query.js             # Query de status do servidor
│   └── css/                      # Estilos
│
├── api/                          # Backend PHP
│   ├── config/
│   │   └── db.php                # Configuração do banco
│   ├── auth/
│   │   ├── check-ban.php         # Verificar banimento
│   │   ├── register-device.php   # Registrar dispositivo
│   │   ├── request-token.php     # Solicitar token
│   │   ├── validate-session.php  # Validar sessão (SAMP)
│   │   └── admin-ban.php         # Gerenciar bans (API admin)
│   ├── notifications/
│   │   └── pending.php           # Endpoint de notificações
│   ├── session/
│   │   └── heartbeat.php         # Endpoint de heartbeat
│   ├── content/
│   │   ├── servers.php           # Lista de servidores
│   │   ├── mods.php              # Lista de mods
│   │   └── news.php              # Lista de notícias
│   └── admin/                    # Painel administrativo
│       ├── index.php             # Dashboard
│       ├── login.php             # Login (com CAPTCHA)
│       ├── logout.php            # Logout
│       ├── notifications.php     # Gerenciar notificações
│       ├── sessions.php          # Sessões ativas
│       ├── devices.php           # Dispositivos registrados
│       ├── bans.php              # Gerenciar banimentos
│       ├── servers.php           # Gerenciar servidores
│       ├── mods.php              # Gerenciar mods
│       └── news.php              # Gerenciar notícias
│
├── database/                     # Scripts SQL
│   ├── schema.sql                # Tabelas principais
│   ├── notifications_tables.sql  # Tabelas de notificações
│   └── content_tables.sql        # Tabelas de conteúdo
│
├── samp-server/                  # Integração SA-MP
│   └── horizonte_auth.pwn        # Módulo de autenticação
│
├── package.json                  # Dependências Node.js
└── README.md                     # Este arquivo

```

---

## ⚙️ Instalação e Configuração

### 1. Banco de Dados

#### 1.1. Criar Banco de Dados

```sql
CREATE DATABASE horizonte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 1.2. Executar Scripts SQL

Execute os scripts na seguinte ordem:

```bash
# 1. Tabelas principais (autenticação, HWID, bans)
mysql -u root -p horizonte < database/schema.sql

# 2. Tabelas de notificações e sessões
mysql -u root -p horizonte < database/notifications_tables.sql

# 3. Tabelas de conteúdo (servidores, mods, notícias)
mysql -u root -p horizonte < database/content_tables.sql
```

#### 1.3. Verificar Instalação

```sql
USE horizonte;
SHOW TABLES;
-- Deve mostrar: player_devices, hwid_bans, session_tokens, auth_logs,
--                notifications, notification_deliveries, launcher_sessions,
--                launcher_servers, launcher_mods, launcher_news
```

---

### 2. API Backend

#### 2.1. Configurar Banco de Dados

Edite `api/config/db.php` (linhas 7-10):

```php
define('DB_HOST', 'localhost');          // Host do banco
define('DB_NAME', 'horizonte');          // Nome do banco
define('DB_USER', 'seu_usuario');        // Usuário MySQL
define('DB_PASS', 'sua_senha');          // Senha MySQL
```

#### 2.2. Configurar Chaves Secretas

Edite `api/config/db.php` (linhas 13-16):

```php
// Chave secreta para validar assinaturas (DEVE ser igual ao launcher)
define('SECRET_KEY', 'horizonte-launcher-secret-2024');

// Chave secreta para endpoints admin (DEVE ser igual ao servidor SA-MP)
define('ADMIN_API_KEY', 'SUA_CHAVE_SECRETA_AQUI');
```

⚠️ **IMPORTANTE:**
- `SECRET_KEY`: Deve ser a mesma usada no launcher (`authService.js`)
- `ADMIN_API_KEY`: Deve ser a mesma configurada no servidor SA-MP

#### 2.3. Configurar Senha Admin

Edite `api/admin/index.php` (linhas 10-11):

```php
$ADMIN_USERNAME = 'admin';
$ADMIN_PASSWORD = '@horizonte@rp@';  // ALTERE ESTA SENHA!
```

#### 2.4. Configurar Google reCAPTCHA

1. **Obter chaves**: https://www.google.com/recaptcha/admin
2. **Tipo**: reCAPTCHA v2 → "Caixa de seleção 'Não sou um robô'"
3. **Domínios**: Adicione seu domínio + `localhost` (para testes)

Edite `api/admin/login.php` (linha 129):

```html
<div class="g-recaptcha" data-sitekey="SUA_SITE_KEY_AQUI"></div>
```

Edite `api/admin/index.php` (linha 15):

```php
$RECAPTCHA_SECRET_KEY = 'SUA_SECRET_KEY_AQUI';
```

#### 2.5. Upload para Servidor

Suba **TODA a pasta `api/`** para `horizontegames.com/api/`

**Permissões recomendadas:**

```bash
chmod 755 api/
chmod 755 api/config/ api/auth/ api/notifications/ api/session/ api/admin/ api/content/
chmod 644 api/**/*.php
```

#### 2.6. URLs Finais

Após upload, você terá:

- **Painel Admin**: `https://horizontegames.com/api/admin/`
- **Autenticação**: `https://horizontegames.com/api/auth/`
- **Notificações**: `https://horizontegames.com/api/notifications/`
- **Sessões**: `https://horizontegames.com/api/session/`

---

### 3. Launcher Desktop

#### 3.1. Instalar Dependências

```bash
npm install
```

#### 3.2. Configurar URL da API

Edite `src/main.js` (linha 16):

```javascript
const API_URL = 'https://horizontegames.com/api/';
```

Edite `src/services/authService.js` (linha 3):

```javascript
const API_URL = 'https://horizontegames.com/api/auth';
```

#### 3.3. Configurar Chave Secreta

Edite `src/services/authService.js` (linha 4):

```javascript
const SECRET_KEY = 'horizonte-launcher-secret-2024';  // Mesma da API!
```

#### 3.4. Desenvolvimento

```bash
npm start
```

#### 3.5. Build de Produção

```bash
npm run build
```

O instalador será gerado em `dist/Horizonte Launcher Setup.exe`

---

### 4. Servidor SA-MP

#### 4.1. Instalar Módulo

1. Copie `samp-server/horizonte_auth.pwn` para `pawno/include/`
2. Renomeie para `horizonte_auth.inc`
3. Adicione no topo do seu gamemode:

```pawn
#include <horizonte_auth>
```

#### 4.2. Configurar

Edite as definições no início do arquivo `horizonte_auth.inc`:

```pawn
// URL da sua API
#define HORIZONTE_API_URL       "http://horizontegames.com/api/auth"

// Chave secreta para endpoints admin (mesma do config/db.php)
#define HORIZONTE_ADMIN_KEY     "SUA_CHAVE_SECRETA_AQUI"

// Comportamento se API falhar
// true = Fail-Open (permite jogar se API cair)
// false = Fail-Closed (não permite se API cair)
#define HORIZONTE_ALLOW_NO_SESSION      true
```

#### 4.3. Usar no Gamemode

**Verificar se jogador está validado:**

```pawn
public OnPlayerSpawn(playerid) {
    if (!IsPlayerValidated(playerid)) {
        SendClientMessage(playerid, -1, "Aguarde a validação...");
        return 0;
    }
    return 1;
}
```

**Obter HWID do jogador:**

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

**Comandos Admin (já incluídos):**

```pawn
/banserial [id] [motivo]          // Banir HWID permanentemente
/tempbanserial [id] [dias] [motivo] // Banir HWID temporariamente
/unbanserial [id]                 // Desbanir HWID
```

**Callbacks disponíveis:**

```pawn
// Chamado quando jogador é validado
public OnPlayerAuthValidated(playerid, const hwid[], bool:isVM, const manufacturer[]) {
    // Seu código aqui
    return 1;
}

// Chamado quando jogador falha na validação
public OnPlayerAuthFailed(playerid, reason) {
    // reason: AUTH_FAIL_NO_SESSION, AUTH_FAIL_BANNED, etc.
    return 1;
}
```

---

## 🔐 Painel Administrativo

Acesse: `https://horizontegames.com/api/admin/`

### Funcionalidades

#### 📊 Dashboard
- Total de sessões ativas
- Total de dispositivos registrados
- Notificações ativas
- Notificações enviadas hoje
- Versões do launcher em uso
- VMs detectadas nas últimas 24h

#### 📢 Notificações
- Criar notificações push
- Notificações silenciosas ou com som
- Ações ao clicar (abrir URL, navegar, executar)
- Segmentação por HWID específico
- Agendamento (data início/fim)
- Anti-spam (uma vez por sessão)

#### 👥 Sessões Ativas
- Lista de launchers online (últimos 5 minutos)
- Informações: HWID, plataforma, versão, último heartbeat
- Detecção de VM

#### 💻 Dispositivos
- Todos os dispositivos registrados
- Busca por: usuário, HWID, fabricante, IP
- Histórico de registros e último acesso

#### 🚫 Banimentos
- Banir/desbanir por HWID
- Banimentos permanentes ou temporários
- Motivo e responsável pelo ban
- Busca e filtros
- Visualização de bans expirados

#### 🎮 Servidores
- CRUD completo de servidores
- Categorias: RP, DM, DayZ
- IP, porta, max players, Discord
- Ordem de exibição
- Ativar/desativar

#### 📦 Mods
- CRUD completo de mods
- Download automático
- Ordem de exibição
- Ativar/desativar

#### 📰 Notícias
- CRUD completo de notícias
- Imagem, título, link
- Ordem de exibição
- Ativar/desativar

---

## 🔒 Segurança

### Implementações de Segurança

✅ **Autenticação HWID**
- Hash SHA-256 dos componentes de hardware
- Impossível falsificar sem acesso físico

✅ **Google reCAPTCHA v2**
- Proteção anti-bot no login admin
- Verificação server-side

✅ **IP Whitelisting**
- Endpoints admin só aceitam IPs autorizados
- Editável em `api/auth/admin-ban.php`

✅ **Prepared Statements (PDO)**
- Proteção contra SQL Injection
- Validação de entrada

✅ **Token de Sessão**
- Tokens únicos e temporários
- Expiração automática (5 minutos)
- Invalidação após uso

✅ **Detecção de VM**
- Identificação de máquinas virtuais
- VirtualBox, VMware, Hyper-V, QEMU

✅ **Rate Limiting**
- Anti-spam no heartbeat
- Cooldown de 30 segundos

### Recomendações Adicionais

⚠️ **Produção:**
1. Use HTTPS (SSL/TLS) - **OBRIGATÓRIO**
2. Altere TODAS as senhas padrão
3. Configure firewall no servidor
4. Mantenha PHP e MySQL atualizados
5. Monitore logs regularmente
6. Faça backups do banco de dados
7. Considere 2FA no painel admin

---

## 💻 Desenvolvimento

### Estrutura do Código

**Launcher (Electron):**
- `main.js`: Processo principal, IPC, janela
- `renderer.js`: Lógica da UI, interação com usuário
- `authService.js`: HWID, assinatura, requisições
- `vmDetector.js`: Detecção de ambiente virtualizado

**API (PHP):**
- `db.php`: Conexão PDO, funções auxiliares
- `auth/*`: Autenticação, registro, validação
- `notifications/*`: Sistema de notificações
- `session/*`: Heartbeat e sessões
- `admin/*`: Painel administrativo

### Cache System

O launcher implementa cache-first strategy:

1. **Primeira execução**: Faz requisições HTTP, salva no cache
2. **Execuções seguintes**: Lê do cache (instantâneo), atualiza em background
3. **Validade**: 1 hora
4. **Biblioteca**: electron-store

### Discord Rich Presence

Configurado em `src/main.js`:

- Client ID: `YOUR_DISCORD_APPLICATION_ID`
- Status: "Escolhendo Servidor", "Conectado", "Navegando"

---

## 🐛 Troubleshooting

### Erro: "Database connection failed"

✅ Verifique credenciais em `api/config/db.php`
✅ Confirme que os SQLs foram executados
✅ Verifique permissões do usuário MySQL

### Erro: "CAPTCHA inválido"

✅ Certifique-se de usar reCAPTCHA v2 (checkbox)
✅ Verifique Site Key em `login.php`
✅ Verifique Secret Key em `index.php`
✅ Domínio está registrado no Google reCAPTCHA?

### Notificações não aparecem

✅ Verifique URL da API no launcher
✅ Confirme que a notificação está ativa
✅ Verifique período (start_date, end_date)
✅ Teste o endpoint diretamente: `GET /api/notifications/pending.php?hwid=test`

### SA-MP não valida jogadores

✅ Verifique `HORIZONTE_API_URL` no .inc
✅ Confirme que `validate-session.php` existe
✅ Teste o endpoint diretamente (Postman)
✅ Verifique logs do servidor SA-MP

### Erro 404 no painel admin

✅ Confirme que a pasta `api/` foi enviada
✅ Verifique estrutura de arquivos no servidor
✅ Permissões corretas? (755 para pastas, 644 para PHP)

### Launcher não inicia

✅ Instale dependências: `npm install`
✅ Verifique logs: DevTools (Ctrl+Shift+I)
✅ Teste em modo dev: `npm start`

---

## 📊 Fluxo de Autenticação

```
┌──────────────┐                    ┌─────────┐                    ┌──────────────┐
│   LAUNCHER   │                    │   API   │                    │  SA-MP SERVER│
└──────────────┘                    └─────────┘                    └──────────────┘
       │                                 │                                │
       │  1. Gera HWID (SHA-256)         │                                │
       │                                 │                                │
       │  2. POST /register-device.php   │                                │
       │  (hwid, username, manufacturer) │                                │
       │ ───────────────────────────────►│                                │
       │                                 │  Salva em player_devices       │
       │  3. { success: true }           │                                │
       │◄─────────────────────────────────│                                │
       │                                 │                                │
       │  4. POST /check-ban.php         │                                │
       │  (hwid)                         │                                │
       │ ───────────────────────────────►│                                │
       │                                 │  Verifica hwid_bans            │
       │  5. { banned: false }           │                                │
       │◄─────────────────────────────────│                                │
       │                                 │                                │
       │  6. Jogador clica "Jogar"       │                                │
       │                                 │                                │
       │  7. POST /request-token.php     │                                │
       │  (hwid, username, server_id, ip)│                                │
       │ ───────────────────────────────►│                                │
       │                                 │  Cria token temporário         │
       │  8. { token: "abc123..." }      │  Registra IP + HWID            │
       │◄─────────────────────────────────│                                │
       │                                 │                                │
       │  9. Conecta via samp://         │                                │
       │ ────────────────────────────────────────────────────────────────►│
       │                                 │                                │
       │                                 │  10. POST /validate-session.php│
       │                                 │  (username, ip)                │
       │                                 │◄─────────────────────────────── │
       │                                 │                                │
       │                                 │  Busca sessão por IP           │
       │                                 │  Valida token                  │
       │                                 │                                │
       │                                 │  11. { valid: true, hwid, ... }│
       │                                 │ ───────────────────────────────►│
       │                                 │                                │
       │                                 │                    Permite spawn│
       │                                 │                    ou Kick      │
```

---

## 📝 Licença

Projeto desenvolvido para o Horizonte Roleplay.

**© 2024 Horizonte Roleplay. Todos os direitos reservados.**

---

## 🤝 Suporte

Para problemas ou dúvidas, verifique:
1. Logs de erro do PHP (`error_log`)
2. Logs do MySQL
3. Console do navegador (F12)
4. DevTools do Electron (Ctrl+Shift+I)
5. Logs do servidor SA-MP (`server_log.txt`)

**Desenvolvido com ❤️ para a comunidade SA-MP**
