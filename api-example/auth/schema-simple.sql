-- =========================================================================
-- HORIZONTE LAUNCHER - AUTH DATABASE SCHEMA (VERSÃO SIMPLIFICADA)
-- =========================================================================
-- Use esta versão no phpMyAdmin (sem procedures)
-- =========================================================================

-- TABELA: player_devices
CREATE TABLE IF NOT EXISTS player_devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    hwid VARCHAR(64) NOT NULL,
    manufacturer VARCHAR(128) DEFAULT NULL,
    is_vm TINYINT(1) DEFAULT 0,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at DATETIME NOT NULL,
    last_seen DATETIME DEFAULT NULL,
    INDEX idx_username (username),
    INDEX idx_hwid (hwid),
    INDEX idx_last_seen (last_seen),
    UNIQUE KEY unique_user_hwid (username, hwid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: hwid_bans
CREATE TABLE IF NOT EXISTS hwid_bans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hwid VARCHAR(64) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    banned_by VARCHAR(32) DEFAULT 'Sistema',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL,
    INDEX idx_hwid (hwid),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: session_tokens
CREATE TABLE IF NOT EXISTS session_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(64) NOT NULL,
    hwid VARCHAR(64) NOT NULL,
    username VARCHAR(32) NOT NULL,
    server_id VARCHAR(32) DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    is_valid TINYINT(1) DEFAULT 1,
    is_used TINYINT(1) DEFAULT 0,
    used_at DATETIME DEFAULT NULL,
    used_ip VARCHAR(45) DEFAULT NULL,
    UNIQUE KEY unique_token (token),
    INDEX idx_hwid (hwid),
    INDEX idx_expires (expires_at),
    INDEX idx_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TABELA: auth_logs
CREATE TABLE IF NOT EXISTS auth_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    hwid VARCHAR(64) DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    data JSON DEFAULT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_type (type),
    INDEX idx_hwid (hwid),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
