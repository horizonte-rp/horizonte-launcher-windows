-- ==================================================
-- Tabelas para Sistema de Notificações e Sessões
-- ==================================================

-- Tabela de notificações
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

-- Tabela de entregas de notificações (rastrear quem já recebeu)
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
  CONSTRAINT `fk_notification_delivery` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tabela de sessões ativas (heartbeat)
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

-- View para sessões ativas (últimos 5 minutos)
CREATE OR REPLACE VIEW `active_launcher_sessions` AS
SELECT
  s.*,
  TIMESTAMPDIFF(SECOND, s.last_heartbeat, NOW()) AS seconds_since_heartbeat,
  d.manufacturer AS device_manufacturer
FROM `launcher_sessions` s
LEFT JOIN `player_devices` d ON s.hwid = d.hwid
WHERE s.last_heartbeat >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
ORDER BY s.last_heartbeat DESC;

-- Procedure para limpar sessões antigas (> 1 hora)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `cleanup_old_sessions`()
BEGIN
  UPDATE `launcher_sessions`
  SET `status` = 'offline'
  WHERE `last_heartbeat` < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    AND `status` != 'offline';

  -- Opcional: deletar sessões muito antigas (> 7 dias)
  DELETE FROM `launcher_sessions`
  WHERE `last_heartbeat` < DATE_SUB(NOW(), INTERVAL 7 DAY);
END//
DELIMITER ;

-- =============================================
-- EVENTO: Limpeza Automática de Sessões
-- =============================================
-- Executa a procedure cleanup_old_sessions() a cada 1 hora
-- Remove sessões inativas e antigas automaticamente

CREATE EVENT IF NOT EXISTS `cleanup_sessions_event`
ON SCHEDULE EVERY 1 HOUR
DO CALL cleanup_old_sessions();
