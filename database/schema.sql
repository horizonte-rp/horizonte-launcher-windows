-- =========================================================================
-- HORIZONTE LAUNCHER - DATABASE SCHEMA COMPLETO
-- =========================================================================
-- Execute este SQL no seu banco de dados MySQL/MariaDB para criar TODAS as
-- tabelas necessárias para o sistema completo do launcher
-- =========================================================================

-- =========================================================================
-- SEÇÃO 1: TABELAS DE AUTENTICAÇÃO E HWID
-- =========================================================================

-- TABELA: player_devices
-- Armazena os dispositivos (HWIDs) vinculados a cada jogador
CREATE TABLE IF NOT EXISTS `player_devices` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(32) NOT NULL,              -- Nick do jogador
    `hwid` VARCHAR(64) NOT NULL,                  -- Hash SHA-256 do HWID
    `manufacturer` VARCHAR(128) DEFAULT NULL,     -- Fabricante da placa-mãe
    `is_vm` TINYINT(1) DEFAULT 0,                -- Se foi detectado como VM
    `ip_address` VARCHAR(45) DEFAULT NULL,        -- Último IP usado
    `created_at` DATETIME NOT NULL,               -- Quando foi registrado
    `last_seen` DATETIME DEFAULT NULL,            -- Última vez que usou este HWID

    INDEX `idx_username` (`username`),
    INDEX `idx_hwid` (`hwid`),
    INDEX `idx_last_seen` (`last_seen`),
    UNIQUE KEY `unique_user_hwid` (`username`, `hwid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: hwid_bans
-- Armazena banimentos por HWID
CREATE TABLE IF NOT EXISTS `hwid_bans` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `hwid` VARCHAR(64) NOT NULL,                  -- Hash SHA-256 do HWID banido
    `reason` VARCHAR(255) NOT NULL,               -- Motivo do ban
    `banned_by` VARCHAR(32) DEFAULT 'Sistema',    -- Quem aplicou o ban
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expires_at` DATETIME DEFAULT NULL,           -- NULL = permanente

    INDEX `idx_hwid` (`hwid`),
    INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: session_tokens
-- Armazena tokens de sessão temporários para conexão ao servidor
CREATE TABLE IF NOT EXISTS `session_tokens` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `token` VARCHAR(64) NOT NULL,                 -- Token único
    `hwid` VARCHAR(64) NOT NULL,                  -- HWID que solicitou
    `username` VARCHAR(32) NOT NULL,              -- Nick do jogador
    `server_id` VARCHAR(32) DEFAULT NULL,         -- ID do servidor alvo
    `ip_address` VARCHAR(45) DEFAULT NULL,        -- IP que solicitou o token
    `created_at` DATETIME NOT NULL,               -- Quando foi criado
    `expires_at` DATETIME NOT NULL,               -- Quando expira
    `is_valid` TINYINT(1) DEFAULT 1,              -- Se ainda é válido
    `is_used` TINYINT(1) DEFAULT 0,               -- Se já foi usado
    `used_at` DATETIME DEFAULT NULL,              -- Quando foi usado
    `used_ip` VARCHAR(45) DEFAULT NULL,           -- IP que usou

    UNIQUE KEY `unique_token` (`token`),
    INDEX `idx_hwid` (`hwid`),
    INDEX `idx_expires` (`expires_at`),
    INDEX `idx_valid` (`is_valid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: auth_logs
-- Log de todas as atividades de autenticação (para auditoria)
CREATE TABLE IF NOT EXISTS `auth_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `type` VARCHAR(50) NOT NULL,                  -- Tipo de atividade
    `hwid` VARCHAR(64) DEFAULT NULL,              -- HWID relacionado
    `ip_address` VARCHAR(45) DEFAULT NULL,        -- IP da requisição
    `data` JSON DEFAULT NULL,                     -- Dados adicionais em JSON
    `created_at` DATETIME NOT NULL,

    INDEX `idx_type` (`type`),
    INDEX `idx_hwid` (`hwid`),
    INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- SEÇÃO 2: TABELAS DE NOTIFICAÇÕES
-- =========================================================================

-- TABELA: notifications
-- Armazena notificações criadas pelo admin
CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `icon` VARCHAR(500) NULL DEFAULT NULL,
    `silent` TINYINT(1) NOT NULL DEFAULT 0,
    `action_type` ENUM('none', 'open_url', 'navigate', 'play') DEFAULT 'none',
    `action_value` VARCHAR(500) NULL DEFAULT NULL,
    `target_type` ENUM('all', 'specific_hwid', 'specific_users') DEFAULT 'all',
    `target_hwids` TEXT NULL DEFAULT NULL COMMENT 'JSON array de HWIDs alvo',
    `start_date` DATETIME NOT NULL,
    `end_date` DATETIME NULL DEFAULT NULL,
    `active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_by` VARCHAR(100) NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_active` (`active`),
    KEY `idx_dates` (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABELA: notification_deliveries
-- Rastreia quem já recebeu cada notificação (anti-spam)
CREATE TABLE IF NOT EXISTS `notification_deliveries` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `notification_id` INT(11) UNSIGNED NOT NULL,
    `hwid` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(100) NOT NULL,
    `delivered_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_delivery` (`notification_id`, `hwid`, `session_id`),
    KEY `idx_notification` (`notification_id`),
    KEY `idx_hwid` (`hwid`),
    CONSTRAINT `fk_notification_delivery` FOREIGN KEY (`notification_id`)
        REFERENCES `notifications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================================
-- SEÇÃO 3: TABELAS DE SESSÕES (HEARTBEAT)
-- =========================================================================

-- TABELA: launcher_sessions
-- Rastreia sessões ativas do launcher (heartbeat)
CREATE TABLE IF NOT EXISTS `launcher_sessions` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `session_id` VARCHAR(100) NOT NULL,
    `hwid` VARCHAR(64) NOT NULL,
    `hwid_components` TEXT NULL DEFAULT NULL COMMENT 'JSON dos componentes',
    `manufacturer` VARCHAR(255) NULL DEFAULT NULL,
    `is_vm` TINYINT(1) NOT NULL DEFAULT 0,
    `vm_confidence` INT(11) NOT NULL DEFAULT 0,
    `platform` VARCHAR(50) NOT NULL,
    `arch` VARCHAR(20) NOT NULL,
    `launcher_version` VARCHAR(20) NOT NULL,
    `first_seen` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_heartbeat` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `status` ENUM('active', 'idle', 'offline') DEFAULT 'active',

    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_session` (`session_id`),
    KEY `idx_hwid` (`hwid`),
    KEY `idx_last_heartbeat` (`last_heartbeat`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================================
-- SEÇÃO 4: PROCEDURES (STORED PROCEDURES)
-- =========================================================================

-- Procedure: ban_hwid
-- Bane um HWID por X dias (ou permanentemente)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `ban_hwid`(
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

    INSERT INTO `hwid_bans` (`hwid`, `reason`, `banned_by`, `created_at`, `expires_at`)
    VALUES (p_hwid, p_reason, p_banned_by, NOW(), v_expires);

    -- Invalida todos os tokens deste HWID
    UPDATE `session_tokens` SET `is_valid` = 0 WHERE `hwid` = p_hwid;
END //
DELIMITER ;

-- Procedure: unban_hwid
-- Remove ban de um HWID
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `unban_hwid`(IN p_hwid VARCHAR(64))
BEGIN
    DELETE FROM `hwid_bans` WHERE `hwid` = p_hwid;
END //
DELIMITER ;

-- Procedure: cleanup_expired_tokens
-- Limpa tokens expirados (executar via cron diariamente)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `cleanup_expired_tokens`()
BEGIN
    DELETE FROM `session_tokens`
    WHERE `expires_at` < NOW()
      AND `created_at` < DATE_SUB(NOW(), INTERVAL 1 DAY);
END //
DELIMITER ;

-- Procedure: cleanup_old_logs
-- Limpa logs antigos (executar via cron semanalmente)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `cleanup_old_logs`(IN p_days INT)
BEGIN
    DELETE FROM `auth_logs`
    WHERE `created_at` < DATE_SUB(NOW(), INTERVAL p_days DAY);
END //
DELIMITER ;

-- Procedure: cleanup_old_sessions
-- Marca sessões antigas como offline e deleta muito antigas
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `cleanup_old_sessions`()
BEGIN
    -- Marcar como offline sessões sem heartbeat há mais de 1 hora
    UPDATE `launcher_sessions`
    SET `status` = 'offline'
    WHERE `last_heartbeat` < DATE_SUB(NOW(), INTERVAL 1 HOUR)
      AND `status` != 'offline';

    -- Deletar sessões muito antigas (> 7 dias)
    DELETE FROM `launcher_sessions`
    WHERE `last_heartbeat` < DATE_SUB(NOW(), INTERVAL 7 DAY);
END //
DELIMITER ;

-- =========================================================================
-- SEÇÃO 5: VIEWS (VISUALIZAÇÕES)
-- =========================================================================

-- View: v_multi_hwid_players
-- Jogadores com múltiplos HWIDs (possível multi-conta)
CREATE OR REPLACE VIEW `v_multi_hwid_players` AS
SELECT
    `username`,
    COUNT(DISTINCT `hwid`) as `hwid_count`,
    GROUP_CONCAT(DISTINCT SUBSTRING(`hwid`, 1, 16)) as `hwids_preview`
FROM `player_devices`
GROUP BY `username`
HAVING `hwid_count` > 1
ORDER BY `hwid_count` DESC;

-- View: v_shared_hwid
-- HWIDs com múltiplas contas (possível compartilhamento)
CREATE OR REPLACE VIEW `v_shared_hwid` AS
SELECT
    `hwid`,
    COUNT(DISTINCT `username`) as `account_count`,
    GROUP_CONCAT(DISTINCT `username`) as `usernames`
FROM `player_devices`
GROUP BY `hwid`
HAVING `account_count` > 1
ORDER BY `account_count` DESC;

-- View: v_active_bans
-- Bans ativos no momento
CREATE OR REPLACE VIEW `v_active_bans` AS
SELECT
    hb.*,
    (SELECT COUNT(*) FROM `player_devices` pd WHERE pd.`hwid` = hb.`hwid`) as `affected_devices`,
    (SELECT GROUP_CONCAT(DISTINCT pd.`username`) FROM `player_devices` pd WHERE pd.`hwid` = hb.`hwid`) as `affected_users`
FROM `hwid_bans` hb
WHERE hb.`expires_at` IS NULL OR hb.`expires_at` > NOW()
ORDER BY hb.`created_at` DESC;

-- View: active_launcher_sessions
-- Sessões ativas do launcher (últimos 5 minutos)
CREATE OR REPLACE VIEW `active_launcher_sessions` AS
SELECT
    s.*,
    TIMESTAMPDIFF(SECOND, s.`last_heartbeat`, NOW()) AS `seconds_since_heartbeat`,
    d.`manufacturer` AS `device_manufacturer`
FROM `launcher_sessions` s
LEFT JOIN `player_devices` d ON s.`hwid` = d.`hwid`
WHERE s.`last_heartbeat` >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
ORDER BY s.`last_heartbeat` DESC;

-- =========================================================================
-- SEÇÃO 6: EVENTOS AUTOMÁTICOS (CRON JOBS)
-- =========================================================================

-- Evento: cleanup_sessions_event
-- Limpa sessões antigas a cada 1 hora
CREATE EVENT IF NOT EXISTS `cleanup_sessions_event`
ON SCHEDULE EVERY 1 HOUR
DO CALL `cleanup_old_sessions`();

-- Evento: cleanup_tokens_event
-- Limpa tokens expirados a cada 6 horas
CREATE EVENT IF NOT EXISTS `cleanup_tokens_event`
ON SCHEDULE EVERY 6 HOUR
DO CALL `cleanup_expired_tokens`();

-- Evento: cleanup_logs_event
-- Limpa logs com mais de 90 dias, uma vez por semana
CREATE EVENT IF NOT EXISTS `cleanup_logs_event`
ON SCHEDULE EVERY 1 WEEK
DO CALL `cleanup_old_logs`(90);

-- =========================================================================
-- FINALIZADO!
-- =========================================================================
-- Todas as tabelas, procedures, views e eventos foram criados.
-- Você pode verificar com:
--   SHOW TABLES;
--   SHOW PROCEDURE STATUS WHERE Db = DATABASE();
--   SHOW EVENTS;
-- =========================================================================
