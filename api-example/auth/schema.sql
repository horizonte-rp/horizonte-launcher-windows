-- =========================================================================
-- HORIZONTE LAUNCHER - AUTH DATABASE SCHEMA
-- =========================================================================
-- Execute este SQL no seu banco de dados MySQL/MariaDB para criar as tabelas
-- necessárias para o sistema de autenticação por HWID
-- =========================================================================

-- Criar banco de dados (se necessário)
-- CREATE DATABASE IF NOT EXISTS horizonte_launcher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE horizonte_launcher;

-- =========================================================================
-- TABELA: player_devices
-- Armazena os dispositivos (HWIDs) vinculados a cada jogador
-- =========================================================================
CREATE TABLE IF NOT EXISTS player_devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,              -- Nick do jogador
    hwid VARCHAR(64) NOT NULL,                  -- Hash SHA-256 do HWID
    manufacturer VARCHAR(128) DEFAULT NULL,     -- Fabricante da placa-mãe
    is_vm TINYINT(1) DEFAULT 0,                -- Se foi detectado como VM
    ip_address VARCHAR(45) DEFAULT NULL,        -- Último IP usado
    created_at DATETIME NOT NULL,               -- Quando foi registrado
    last_seen DATETIME DEFAULT NULL,            -- Última vez que usou este HWID

    INDEX idx_username (username),
    INDEX idx_hwid (hwid),
    INDEX idx_last_seen (last_seen),
    UNIQUE KEY unique_user_hwid (username, hwid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- TABELA: hwid_bans
-- Armazena banimentos por HWID
-- =========================================================================
CREATE TABLE IF NOT EXISTS hwid_bans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hwid VARCHAR(64) NOT NULL,                  -- Hash SHA-256 do HWID banido
    reason VARCHAR(255) NOT NULL,               -- Motivo do ban
    banned_by VARCHAR(32) DEFAULT 'Sistema',    -- Quem aplicou o ban
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL,           -- NULL = permanente

    INDEX idx_hwid (hwid),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- TABELA: session_tokens
-- Armazena tokens de sessão temporários para conexão ao servidor
-- =========================================================================
CREATE TABLE IF NOT EXISTS session_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(64) NOT NULL,                 -- Token único
    hwid VARCHAR(64) NOT NULL,                  -- HWID que solicitou
    username VARCHAR(32) NOT NULL,              -- Nick do jogador
    server_id VARCHAR(32) DEFAULT NULL,         -- ID do servidor alvo
    ip_address VARCHAR(45) DEFAULT NULL,        -- IP que solicitou o token
    created_at DATETIME NOT NULL,               -- Quando foi criado
    expires_at DATETIME NOT NULL,               -- Quando expira
    is_valid TINYINT(1) DEFAULT 1,              -- Se ainda é válido
    is_used TINYINT(1) DEFAULT 0,               -- Se já foi usado
    used_at DATETIME DEFAULT NULL,              -- Quando foi usado
    used_ip VARCHAR(45) DEFAULT NULL,           -- IP que usou

    UNIQUE KEY unique_token (token),
    INDEX idx_hwid (hwid),
    INDEX idx_expires (expires_at),
    INDEX idx_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- TABELA: auth_logs
-- Log de todas as atividades de autenticação (para auditoria)
-- =========================================================================
CREATE TABLE IF NOT EXISTS auth_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,                  -- Tipo de atividade
    hwid VARCHAR(64) DEFAULT NULL,              -- HWID relacionado
    ip_address VARCHAR(45) DEFAULT NULL,        -- IP da requisição
    data JSON DEFAULT NULL,                     -- Dados adicionais em JSON
    created_at DATETIME NOT NULL,

    INDEX idx_type (type),
    INDEX idx_hwid (hwid),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- PROCEDURES ÚTEIS
-- =========================================================================

-- Procedure para banir HWID
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS ban_hwid(
    IN p_hwid VARCHAR(64),
    IN p_reason VARCHAR(255),
    IN p_banned_by VARCHAR(32),
    IN p_days INT  -- NULL ou 0 = permanente
)
BEGIN
    DECLARE v_expires DATETIME DEFAULT NULL;

    IF p_days IS NOT NULL AND p_days > 0 THEN
        SET v_expires = DATE_ADD(NOW(), INTERVAL p_days DAY);
    END IF;

    INSERT INTO hwid_bans (hwid, reason, banned_by, created_at, expires_at)
    VALUES (p_hwid, p_reason, p_banned_by, NOW(), v_expires);

    -- Invalida todos os tokens deste HWID
    UPDATE session_tokens SET is_valid = 0 WHERE hwid = p_hwid;
END //
DELIMITER ;

-- Procedure para remover ban
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS unban_hwid(IN p_hwid VARCHAR(64))
BEGIN
    DELETE FROM hwid_bans WHERE hwid = p_hwid;
END //
DELIMITER ;

-- Procedure para limpar tokens expirados (execute periodicamente via cron)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_expired_tokens()
BEGIN
    DELETE FROM session_tokens WHERE expires_at < NOW() AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
END //
DELIMITER ;

-- Procedure para limpar logs antigos (execute periodicamente via cron)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_old_logs(IN p_days INT)
BEGIN
    DELETE FROM auth_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL p_days DAY);
END //
DELIMITER ;

-- =========================================================================
-- VIEWS ÚTEIS
-- =========================================================================

-- View: Jogadores com múltiplos HWIDs (possível multi-conta)
CREATE OR REPLACE VIEW v_multi_hwid_players AS
SELECT
    username,
    COUNT(DISTINCT hwid) as hwid_count,
    GROUP_CONCAT(DISTINCT SUBSTRING(hwid, 1, 16)) as hwids_preview
FROM player_devices
GROUP BY username
HAVING hwid_count > 1
ORDER BY hwid_count DESC;

-- View: HWIDs com múltiplas contas (possível compartilhamento)
CREATE OR REPLACE VIEW v_shared_hwid AS
SELECT
    hwid,
    COUNT(DISTINCT username) as account_count,
    GROUP_CONCAT(DISTINCT username) as usernames
FROM player_devices
GROUP BY hwid
HAVING account_count > 1
ORDER BY account_count DESC;

-- View: Bans ativos
CREATE OR REPLACE VIEW v_active_bans AS
SELECT
    hb.*,
    (SELECT COUNT(*) FROM player_devices pd WHERE pd.hwid = hb.hwid) as affected_devices,
    (SELECT GROUP_CONCAT(DISTINCT pd.username) FROM player_devices pd WHERE pd.hwid = hb.hwid) as affected_users
FROM hwid_bans hb
WHERE hb.expires_at IS NULL OR hb.expires_at > NOW()
ORDER BY hb.created_at DESC;

-- =========================================================================
-- DADOS DE EXEMPLO (OPCIONAL)
-- =========================================================================

-- Exemplo de ban (descomente para testar)
-- CALL ban_hwid('hwid_hash_aqui', 'Uso de cheats', 'Admin', 30);  -- 30 dias
-- CALL ban_hwid('hwid_hash_aqui', 'Ban permanente por hack', 'Admin', NULL);  -- Permanente

-- =========================================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE (em tabelas grandes)
-- =========================================================================

-- CREATE INDEX idx_logs_hwid_type ON auth_logs(hwid, type);
-- CREATE INDEX idx_devices_hwid_username ON player_devices(hwid, username);
