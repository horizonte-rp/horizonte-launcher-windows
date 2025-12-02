<?php
/**
 * Register Device Endpoint
 * Registra/vincula um HWID a uma conta de jogador
 *
 * POST /auth/register-device.php
 * Body: { username, device: { hwid, signature, timestamp, isVM, manufacturer, ... } }
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido', 'success' => false], 405);
}

$data = getRequestData();

// Validação dos campos obrigatórios
if (empty($data['username']) || empty($data['device']['hwid'])) {
    jsonResponse(['error' => 'Dados incompletos', 'success' => false], 400);
}

$username = trim($data['username']);
$device = $data['device'];
$hwid = $device['hwid'];
$isVM = $device['isVM'] ?? false;
$manufacturer = $device['manufacturer'] ?? 'Unknown';

// Bloqueia VMs (opcional - descomente para ativar)
// if ($isVM) {
//     logActivity('vm_blocked', $hwid, ['username' => $username]);
//     jsonResponse(['error' => 'Máquinas virtuais não são permitidas', 'success' => false, 'code' => 'VM_BLOCKED'], 403);
// }

$pdo = getDB();
if (!$pdo) {
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}

try {
    // Verifica se HWID já está banido
    $stmt = $pdo->prepare("
        SELECT id FROM hwid_bans
        WHERE hwid = ? AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    ");
    $stmt->execute([$hwid]);
    if ($stmt->fetch()) {
        logActivity('register_banned_hwid', $hwid, ['username' => $username]);
        jsonResponse([
            'error' => 'Este dispositivo está banido',
            'success' => false,
            'code' => 'HWID_BANNED'
        ], 403);
    }

    // Verifica se o HWID já está vinculado a outra conta
    $stmt = $pdo->prepare("
        SELECT username FROM player_devices
        WHERE hwid = ? AND username != ?
        LIMIT 1
    ");
    $stmt->execute([$hwid, $username]);
    $existingDevice = $stmt->fetch();

    if ($existingDevice) {
        // HWID já vinculado a outra conta
        // Você pode decidir se permite ou não múltiplas contas por HWID
        logActivity('hwid_already_linked', $hwid, [
            'username' => $username,
            'existing_user' => $existingDevice['username']
        ]);

        // Opção 1: Bloquear
        // jsonResponse([
        //     'error' => 'Este dispositivo já está vinculado a outra conta',
        //     'success' => false,
        //     'code' => 'HWID_LINKED'
        // ], 403);

        // Opção 2: Permitir (apenas avisa no log)
    }

    // Verifica se já existe registro para este usuário + HWID
    $stmt = $pdo->prepare("
        SELECT id FROM player_devices
        WHERE username = ? AND hwid = ?
    ");
    $stmt->execute([$username, $hwid]);
    $existing = $stmt->fetch();

    if ($existing) {
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
            $existing['id']
        ]);

        logActivity('device_updated', $hwid, ['username' => $username]);
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

        logActivity('device_registered', $hwid, ['username' => $username]);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Dispositivo registrado com sucesso'
    ]);

} catch (Exception $e) {
    error_log("Erro ao registrar dispositivo: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}
?>
