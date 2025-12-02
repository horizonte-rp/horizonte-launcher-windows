<?php
/**
 * Request Token Endpoint
 * Gera um token de sessão para o jogador conectar ao servidor
 * O token é enviado na senha do SA-MP e validado pelo servidor de jogo
 *
 * POST /auth/request-token.php
 * Body: { username, serverId, device: { hwid, signature, timestamp, isVM, ... } }
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido', 'success' => false], 405);
}

$data = getRequestData();

// Validação dos campos obrigatórios
// Nota: usa !isset para serverId porque empty(0) é true em PHP
if (empty($data['username']) || !isset($data['serverId']) || empty($data['device']['hwid'])) {
    jsonResponse(['error' => 'Dados incompletos', 'success' => false], 400);
}

$username = trim($data['username']);
$serverId = $data['serverId'];
$device = $data['device'];
$hwid = $device['hwid'];
$isVM = $device['isVM'] ?? false;

// Bloqueia VMs
if ($isVM) {
    logActivity('vm_token_blocked', $hwid, ['username' => $username, 'serverId' => $serverId]);
    jsonResponse([
        'error' => 'Máquinas virtuais não são permitidas',
        'success' => false,
        'code' => 'VM_BLOCKED'
    ], 403);
}

$pdo = getDB();
if (!$pdo) {
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}

try {
    // Verifica se HWID está banido
    $stmt = $pdo->prepare("
        SELECT reason FROM hwid_bans
        WHERE hwid = ? AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    ");
    $stmt->execute([$hwid]);
    $ban = $stmt->fetch();

    if ($ban) {
        logActivity('token_banned_hwid', $hwid, ['username' => $username]);
        jsonResponse([
            'error' => 'Este dispositivo está banido: ' . $ban['reason'],
            'success' => false,
            'code' => 'HWID_BANNED'
        ], 403);
    }

    // Invalida tokens anteriores deste HWID (opcional)
    $stmt = $pdo->prepare("
        UPDATE session_tokens
        SET is_valid = 0
        WHERE hwid = ? AND is_valid = 1
    ");
    $stmt->execute([$hwid]);

    // Gera novo token
    $token = generateToken(16); // 32 caracteres hex
    $expiresIn = 300; // 5 minutos
    $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

    // Salva token no banco
    $stmt = $pdo->prepare("
        INSERT INTO session_tokens (token, hwid, username, server_id, ip_address, expires_at, created_at, is_valid)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
    ");
    $stmt->execute([
        $token,
        $hwid,
        $username,
        $serverId,
        $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        $expiresAt
    ]);

    // Registra/atualiza dispositivo na tabela player_devices
    $manufacturer = $device['manufacturer'] ?? 'Unknown';
    $stmt = $pdo->prepare("
        SELECT id FROM player_devices
        WHERE username = ? AND hwid = ?
    ");
    $stmt->execute([$username, $hwid]);
    $existingDevice = $stmt->fetch();

    if ($existingDevice) {
        // Atualiza registro existente
        $stmt = $pdo->prepare("
            UPDATE player_devices
            SET manufacturer = ?,
                is_vm = ?,
                last_seen = NOW(),
                ip_address = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $manufacturer,
            $isVM ? 1 : 0,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $existingDevice['id']
        ]);
    } else {
        // Cria novo registro
        $stmt = $pdo->prepare("
            INSERT INTO player_devices (username, hwid, manufacturer, is_vm, ip_address, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        ");
        $stmt->execute([
            $username,
            $hwid,
            $manufacturer,
            $isVM ? 1 : 0,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
    }

    logActivity('token_generated', $hwid, [
        'username' => $username,
        'serverId' => $serverId,
        'token' => substr($token, 0, 8) . '...'
    ]);

    jsonResponse([
        'success' => true,
        'token' => $token,
        'expiresIn' => $expiresIn,
        'expiresAt' => $expiresAt
    ]);

} catch (Exception $e) {
    error_log("Erro ao gerar token: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}
?>
