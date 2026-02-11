<?php
/**
 * Admin Auth API - Autenticação para painel admin do launcher
 *
 * POST: { "username": "...", "password": "..." }
 * Retorna: { "success": true, "token": "..." } ou { "success": false, "error": "..." }
 *
 * IMPORTANTE: Altere as credenciais abaixo no seu servidor!
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../config/db.php';

// ==========================================
// CREDENCIAIS ADMIN - ALTERE NO SEU SERVIDOR!
// ==========================================
// Para gerar um hash seguro, execute no PHP:
// echo password_hash('sua_senha_aqui', PASSWORD_BCRYPT);
//
// Depois substitua o valor de ADMIN_PASSWORD_HASH abaixo.
// ==========================================
define('ADMIN_USERNAME', 'admin');
define('ADMIN_PASSWORD_HASH', password_hash('@Lk4t10p#', PASSWORD_BCRYPT));
// ^^^ ATENÇÃO: Em produção, substitua por um hash fixo gerado previamente!
// Exemplo: define('ADMIN_PASSWORD_HASH', '$2y$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Usuário e senha são obrigatórios']);
    exit;
}

// Rate limiting simples por IP (máx 5 tentativas por minuto)
$pdo = getDB();
if ($pdo) {
    try {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $attempts = $pdo->prepare("
            SELECT COUNT(*) as c FROM auth_logs
            WHERE type = 'admin_login_fail'
              AND ip_address = ?
              AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        ");
        $attempts->execute([$ip]);
        $count = $attempts->fetch()['c'];

        if ($count >= 5) {
            http_response_code(429);
            echo json_encode(['success' => false, 'error' => 'Muitas tentativas. Aguarde 1 minuto.']);
            exit;
        }
    } catch (Exception $e) {
        // Se falhar o rate limit, continua sem ele
    }
}

// Validar credenciais
$valid = false;

// Primeiro: tentar validar contra tabela admin_users (se existir)
if ($pdo) {
    try {
        $stmt = $pdo->prepare("SELECT id, username, password_hash FROM admin_users WHERE username = ? AND active = 1 LIMIT 1");
        $stmt->execute([$username]);
        $adminUser = $stmt->fetch();

        if ($adminUser && password_verify($password, $adminUser['password_hash'])) {
            $valid = true;
        }
    } catch (Exception $e) {
        // Tabela admin_users não existe, usar fallback
    }
}

// Fallback: validar contra constantes definidas acima
if (!$valid) {
    if ($username === ADMIN_USERNAME && password_verify($password, ADMIN_PASSWORD_HASH)) {
        $valid = true;
    }
}

if ($valid) {
    // Gerar token de sessão (válido por 24h)
    $token = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

    // Salvar token na sessão (se tabela existir)
    if ($pdo) {
        try {
            // Criar tabela se não existir
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    token VARCHAR(128) NOT NULL UNIQUE,
                    username VARCHAR(100) NOT NULL,
                    ip_address VARCHAR(45),
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_token (token),
                    INDEX idx_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Limpar tokens expirados
            $pdo->exec("DELETE FROM admin_sessions WHERE expires_at < NOW()");

            // Inserir novo token
            $stmt = $pdo->prepare("INSERT INTO admin_sessions (token, username, ip_address, expires_at) VALUES (?, ?, ?, ?)");
            $stmt->execute([$token, $username, $_SERVER['REMOTE_ADDR'] ?? 'unknown', $expiresAt]);

            // Log de sucesso
            logActivity('admin_login_ok', '', ['username' => $username]);
        } catch (Exception $e) {
            // Se falhar, o token ainda funciona em memória
        }
    }

    echo json_encode([
        'success' => true,
        'token' => $token,
        'username' => $username,
        'expires_at' => $expiresAt
    ]);
} else {
    // Log de falha
    if ($pdo) {
        logActivity('admin_login_fail', '', ['username' => $username]);
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Usuário ou senha incorretos']);
}
