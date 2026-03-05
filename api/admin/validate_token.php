<?php
/**
 * Middleware de validacao de token admin
 *
 * Aceita autenticacao por:
 * 1. Authorization: Bearer <token> (token de sessao do login)
 * 2. X-Admin-Key header (para SA-MP server e sistemas legados)
 */

require_once __DIR__ . '/../config/db.php';

function validateAdminAccess() {
    // 1. Tentar Bearer token primeiro (launcher)
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = $matches[1];
        return validateSessionToken($token);
    }

    // 2. Fallback: X-Admin-Key (SA-MP server apenas)
    $adminKey = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    if (!empty($adminKey) && $adminKey === ADMIN_API_KEY) {
        return ['valid' => true, 'method' => 'api_key', 'username' => 'samp_server'];
    }

    return ['valid' => false, 'error' => 'Acesso negado'];
}

function validateSessionToken($token) {
    $pdo = getDB();
    if (!$pdo) {
        return ['valid' => false, 'error' => 'Erro de conexao com banco'];
    }

    try {
        $stmt = $pdo->prepare("
            SELECT token, username, ip_address, expires_at
            FROM admin_sessions
            WHERE token = ? AND expires_at > NOW()
            LIMIT 1
        ");
        $stmt->execute([$token]);
        $session = $stmt->fetch();

        if (!$session) {
            return ['valid' => false, 'error' => 'Token invalido ou expirado'];
        }

        return [
            'valid' => true,
            'method' => 'token',
            'username' => $session['username']
        ];
    } catch (Exception $e) {
        return ['valid' => false, 'error' => 'Erro ao validar token'];
    }
}

/**
 * Exige autenticacao admin - retorna 403 se nao autenticado
 */
function requireAdminAuth() {
    $result = validateAdminAccess();
    if (!$result['valid']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => $result['error']]);
        exit;
    }
    return $result;
}
