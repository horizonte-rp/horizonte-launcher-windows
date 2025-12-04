<?php
/**
 * Validate Token Endpoint
 * Valida um token de sessão (chamado pelo servidor SAMP quando jogador conecta)
 *
 * POST /auth/validate-token.php
 * Body: { token, username, ip }
 *
 * Retorna informações do jogador se token válido
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido', 'valid' => false], 405);
}

$data = getRequestData();

// Validação dos campos obrigatórios
if (empty($data['token'])) {
    jsonResponse(['error' => 'Token não fornecido', 'valid' => false], 400);
}

$token = trim($data['token']);
$username = $data['username'] ?? null;
$playerIp = $data['ip'] ?? null;

$pdo = getDB();
if (!$pdo) {
    jsonResponse(['error' => 'Erro interno', 'valid' => false], 500);
}

try {
    // Busca token válido
    $stmt = $pdo->prepare("
        SELECT id, hwid, username, server_id, ip_address, expires_at, is_used
        FROM session_tokens
        WHERE token = ?
          AND is_valid = 1
          AND expires_at > NOW()
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $tokenData = $stmt->fetch();

    if (!$tokenData) {
        logActivity('invalid_token', 'unknown', ['token' => substr($token, 0, 8) . '...']);
        jsonResponse([
            'valid' => false,
            'error' => 'Token inválido ou expirado'
        ]);
    }

    // Verifica se token já foi usado
    if ($tokenData['is_used']) {
        logActivity('token_reuse_attempt', $tokenData['hwid'], ['token' => substr($token, 0, 8) . '...']);
        jsonResponse([
            'valid' => false,
            'error' => 'Token já foi utilizado'
        ]);
    }

    // Verifica se username confere (se fornecido)
    if ($username && strtolower($tokenData['username']) !== strtolower($username)) {
        logActivity('token_username_mismatch', $tokenData['hwid'], [
            'expected' => $tokenData['username'],
            'received' => $username
        ]);
        jsonResponse([
            'valid' => false,
            'error' => 'Username não confere'
        ]);
    }

    // PROTEÇÃO: Verifica se o IP que está conectando é o mesmo que solicitou o token
    if ($playerIp && $tokenData['ip_address']) {
        if ($playerIp !== $tokenData['ip_address']) {
            logActivity('token_ip_mismatch', $tokenData['hwid'], [
                'launcher_ip' => $tokenData['ip_address'],
                'connecting_ip' => $playerIp,
                'username' => $tokenData['username']
            ]);
            jsonResponse([
                'valid' => false,
                'error' => 'IP não confere com o launcher'
            ]);
        }
    }

    // Marca token como usado
    $stmt = $pdo->prepare("
        UPDATE session_tokens
        SET is_used = 1, used_at = NOW(), used_ip = ?
        WHERE id = ?
    ");
    $stmt->execute([$playerIp ?? 'unknown', $tokenData['id']]);

    // Busca informações adicionais do dispositivo
    $stmt = $pdo->prepare("
        SELECT manufacturer, is_vm, created_at as first_seen
        FROM player_devices
        WHERE hwid = ?
        ORDER BY last_seen DESC
        LIMIT 1
    ");
    $stmt->execute([$tokenData['hwid']]);
    $deviceInfo = $stmt->fetch();

    logActivity('token_validated', $tokenData['hwid'], [
        'username' => $tokenData['username'],
        'serverId' => $tokenData['server_id']
    ]);

    jsonResponse([
        'valid' => true,
        'hwid' => $tokenData['hwid'],
        'username' => $tokenData['username'],
        'serverId' => $tokenData['server_id'],
        'launcherIp' => $tokenData['ip_address'],
        'device' => $deviceInfo ? [
            'manufacturer' => $deviceInfo['manufacturer'],
            'isVM' => (bool)$deviceInfo['is_vm'],
            'firstSeen' => $deviceInfo['first_seen']
        ] : null
    ]);

} catch (Exception $e) {
    error_log("Erro ao validar token: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'valid' => false], 500);
}
?>
