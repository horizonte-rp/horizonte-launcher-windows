<?php
/**
 * Check Ban Endpoint
 * Verifica se um HWID está banido
 *
 * POST /auth/check-ban.php
 * Body: { hwid, signature, timestamp }
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido'], 405);
}

$data = getRequestData();

// Validação dos campos obrigatórios
if (empty($data['hwid']) || empty($data['signature']) || empty($data['timestamp'])) {
    jsonResponse(['error' => 'Dados incompletos', 'banned' => false], 400);
}

$hwid = $data['hwid'];
$signature = $data['signature'];
$timestamp = $data['timestamp'];

// Valida timestamp (não pode ser muito antigo - 5 minutos)
if (abs(time() * 1000 - $timestamp) > 300000) {
    jsonResponse(['error' => 'Request expirado', 'banned' => false], 400);
}

// Valida assinatura
if (!validateSignature($hwid, $timestamp, $signature)) {
    logActivity('invalid_signature', $hwid, ['signature' => $signature]);
    jsonResponse(['error' => 'Assinatura inválida', 'banned' => false], 401);
}

$pdo = getDB();
if (!$pdo) {
    jsonResponse(['error' => 'Erro interno', 'banned' => false], 500);
}

try {
    // Busca ban ativo para este HWID
    $stmt = $pdo->prepare("
        SELECT id, hwid, reason, banned_by, created_at, expires_at
        FROM hwid_bans
        WHERE hwid = ?
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
    ");
    $stmt->execute([$hwid]);
    $ban = $stmt->fetch();

    if ($ban) {
        // HWID está banido
        logActivity('ban_check_positive', $hwid, ['ban_id' => $ban['id']]);

        jsonResponse([
            'banned' => true,
            'reason' => $ban['reason'],
            'bannedBy' => $ban['banned_by'],
            'createdAt' => $ban['created_at'],
            'expiresAt' => $ban['expires_at']
        ]);
    } else {
        // HWID não está banido
        logActivity('ban_check_negative', $hwid);

        jsonResponse([
            'banned' => false
        ]);
    }
} catch (Exception $e) {
    error_log("Erro ao verificar ban: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'banned' => false], 500);
}
?>
