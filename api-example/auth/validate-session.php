<?php
/**
 * Validação de Sessão por IP
 * Horizonte Launcher - Auth API
 *
 * Endpoint: POST /auth/validate-session.php
 *
 * Verifica se um IP tem uma sessão válida (token gerado recentemente)
 * Usado pelo servidor SA-MP para validar jogadores sem precisar do token
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido'], 405);
}

try {
    $data = getRequestData();

    $username = $data['username'] ?? null;
    $playerIp = $data['ip'] ?? null;

    if (!$username || !$playerIp) {
        jsonResponse([
            'valid' => false,
            'error' => 'username e ip são obrigatórios'
        ], 400);
    }

    $pdo = getDB();
    if (!$pdo) {
        jsonResponse(['error' => 'Erro de conexão', 'valid' => false], 500);
    }

    // Busca sessão válida para este IP e username
    // Token deve ser:
    // - Do mesmo username
    // - Do mesmo IP que solicitou (ou qualquer IP se for localhost - para testes)
    // - Não expirado
    // - Válido (is_valid = 1)
    // - Não usado ainda OU usado recentemente (últimos 5 minutos - reconexão)

    // Verifica se é teste local (localhost)
    $isLocalTest = ($playerIp === '127.0.0.1' || $playerIp === '::1' || $playerIp === 'localhost');

    if ($isLocalTest) {
        // Para testes locais: busca sessão mais recente do username (ignora IP)
        $stmt = $pdo->prepare("
            SELECT
                st.id,
                st.token,
                st.hwid,
                st.server_id,
                st.ip_address,
                st.created_at,
                st.expires_at,
                st.is_used,
                st.used_at
            FROM session_tokens st
            WHERE st.username = ?
              AND st.is_valid = 1
              AND st.expires_at > NOW()
              AND (
                  st.is_used = 0
                  OR (st.is_used = 1 AND st.used_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE))
              )
            ORDER BY st.created_at DESC
            LIMIT 1
        ");
        $stmt->execute([$username]);
    } else {
        // Para produção: exige IP exato
        $stmt = $pdo->prepare("
            SELECT
                st.id,
                st.token,
                st.hwid,
                st.server_id,
                st.ip_address,
                st.created_at,
                st.expires_at,
                st.is_used,
                st.used_at
            FROM session_tokens st
            WHERE st.username = ?
              AND st.ip_address = ?
              AND st.is_valid = 1
              AND st.expires_at > NOW()
              AND (
                  st.is_used = 0
                  OR (st.is_used = 1 AND st.used_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE))
              )
            ORDER BY st.created_at DESC
            LIMIT 1
        ");
        $stmt->execute([$username, $playerIp]);
    }

    $session = $stmt->fetch();

    if (!$session) {
        logActivity('session_not_found', null, [
            'username' => $username,
            'ip' => $playerIp,
            'is_local_test' => $isLocalTest
        ]);

        jsonResponse([
            'valid' => false,
            'error' => 'Nenhuma sessão válida encontrada. Use o launcher para conectar.'
        ]);
    }

    // Verifica se o HWID está banido
    $stmt = $pdo->prepare("
        SELECT reason, banned_by, created_at, expires_at
        FROM hwid_bans
        WHERE hwid = ?
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    ");
    $stmt->execute([$session['hwid']]);
    $ban = $stmt->fetch();

    if ($ban) {
        logActivity('banned_session_attempt', $session['hwid'], [
            'username' => $username,
            'ip' => $playerIp,
            'ban_reason' => $ban['reason']
        ]);

        jsonResponse([
            'valid' => false,
            'banned' => true,
            'reason' => $ban['reason'],
            'bannedBy' => $ban['banned_by'],
            'expiresAt' => $ban['expires_at']
        ]);
    }

    // Busca informações do dispositivo
    $stmt = $pdo->prepare("
        SELECT manufacturer, is_vm, created_at as first_seen, last_seen
        FROM player_devices
        WHERE hwid = ? AND username = ?
        LIMIT 1
    ");
    $stmt->execute([$session['hwid'], $username]);
    $deviceInfo = $stmt->fetch();

    // Marca sessão como usada (se ainda não foi)
    if (!$session['is_used']) {
        $stmt = $pdo->prepare("
            UPDATE session_tokens
            SET is_used = 1, used_at = NOW(), used_ip = ?
            WHERE id = ?
        ");
        $stmt->execute([$playerIp, $session['id']]);
    }

    // Atualiza last_seen do dispositivo
    $stmt = $pdo->prepare("
        UPDATE player_devices
        SET last_seen = NOW()
        WHERE hwid = ? AND username = ?
    ");
    $stmt->execute([$session['hwid'], $username]);

    // Log de sucesso
    logActivity('session_validated', $session['hwid'], [
        'username' => $username,
        'ip' => $playerIp,
        'server_id' => $session['server_id']
    ]);

    // Resposta de sucesso
    jsonResponse([
        'valid' => true,
        'hwid' => $session['hwid'],
        'username' => $username,
        'serverId' => $session['server_id'],
        'sessionCreatedAt' => $session['created_at'],
        'device' => $deviceInfo ? [
            'manufacturer' => $deviceInfo['manufacturer'],
            'isVM' => (bool)$deviceInfo['is_vm'],
            'firstSeen' => $deviceInfo['first_seen'],
            'lastSeen' => $deviceInfo['last_seen']
        ] : null
    ]);

} catch (Exception $e) {
    error_log("Erro ao validar sessão: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'valid' => false], 500);
}
?>
