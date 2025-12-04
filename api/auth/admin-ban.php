<?php
/**
 * Admin Ban Endpoint
 * Gerencia banimentos de HWID (apenas para admins)
 *
 * POST /auth/admin-ban.php
 * Body: {
 *   action: 'ban' | 'unban' | 'list',
 *   adminKey: 'chave_secreta_admin',
 *   hwid: 'hash_do_hwid',          // para ban/unban
 *   reason: 'motivo',              // para ban
 *   days: 30,                      // para ban (null = permanente)
 *   username: 'nick'               // alternativa ao hwid (busca hwid do jogador)
 * }
 */

require_once 'db.php';

// Apenas POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Método não permitido', 'success' => false], 405);
}

$data = getRequestData();

// Detecta IP real (considerando proxies)
function getRealIP() {
    // CloudFlare
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return $_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    // Proxy padrão
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    // Real IP header
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        return $_SERVER['HTTP_X_REAL_IP'];
    }
    // Padrão
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

$clientIP = getRealIP();

// IPs autorizados a usar este endpoint
$allowedIPs = [
    '127.0.0.1',        // localhost
    '::1',              // localhost IPv6
    '149.56.252.173',   // Servidor 1
    '51.222.228.151',   // Servidor 2
    '54.39.38.150',     // Servidor 3
    '149.56.155.127',   // Servidor 4
    '177.131.175.180',  // IP local para testes
];

// Validação de IP - só aceita requests de IPs autorizados
if (!in_array($clientIP, $allowedIPs)) {
    logActivity('admin_ip_blocked', 'unknown', [
        'ip' => $clientIP,
        'attempted_action' => $data['action'] ?? 'unknown'
    ]);
    jsonResponse(['error' => 'IP não autorizado', 'success' => false], 403);
}

// Validação da chave admin - OBRIGATÓRIA
$adminKey = $data['adminKey'] ?? '';
if ($adminKey !== ADMIN_API_KEY) {
    logActivity('admin_unauthorized', 'unknown', [
        'ip' => $clientIP,
        'attempted_action' => $data['action'] ?? 'unknown'
    ]);
    jsonResponse(['error' => 'Não autorizado', 'success' => false], 403);
}

$action = $data['action'] ?? '';
$pdo = getDB();

if (!$pdo) {
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}

try {
    switch ($action) {
        // =========================================
        // LISTAR BANS ATIVOS
        // =========================================
        case 'list':
            $stmt = $pdo->query("SELECT * FROM v_active_bans");
            $bans = $stmt->fetchAll();

            jsonResponse([
                'success' => true,
                'bans' => $bans,
                'total' => count($bans)
            ]);
            break;

        // =========================================
        // BANIR HWID
        // =========================================
        case 'ban':
            $hwid = $data['hwid'] ?? null;
            $username = $data['username'] ?? null;
            $reason = $data['reason'] ?? 'Sem motivo especificado';
            $days = $data['days'] ?? null; // null = permanente
            $bannedBy = $data['bannedBy'] ?? 'Admin';

            // Se forneceu username, busca o HWID
            if (!$hwid && $username) {
                $stmt = $pdo->prepare("
                    SELECT hwid FROM player_devices
                    WHERE username = ?
                    ORDER BY last_seen DESC
                    LIMIT 1
                ");
                $stmt->execute([$username]);
                $device = $stmt->fetch();

                if (!$device) {
                    jsonResponse([
                        'error' => 'Jogador não encontrado ou sem dispositivo registrado',
                        'success' => false
                    ], 404);
                }

                $hwid = $device['hwid'];
            }

            if (!$hwid) {
                jsonResponse(['error' => 'HWID ou username obrigatório', 'success' => false], 400);
            }

            // Verifica se já está banido
            $stmt = $pdo->prepare("
                SELECT id FROM hwid_bans
                WHERE hwid = ? AND (expires_at IS NULL OR expires_at > NOW())
            ");
            $stmt->execute([$hwid]);
            if ($stmt->fetch()) {
                jsonResponse([
                    'error' => 'Este HWID já está banido',
                    'success' => false
                ], 409);
            }

            // Aplica ban
            $expiresAt = null;
            if ($days !== null && $days > 0) {
                $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));
            }

            $stmt = $pdo->prepare("
                INSERT INTO hwid_bans (hwid, reason, banned_by, created_at, expires_at)
                VALUES (?, ?, ?, NOW(), ?)
            ");
            $stmt->execute([$hwid, $reason, $bannedBy, $expiresAt]);

            // Invalida tokens
            $stmt = $pdo->prepare("UPDATE session_tokens SET is_valid = 0 WHERE hwid = ?");
            $stmt->execute([$hwid]);

            // Busca jogadores afetados
            $stmt = $pdo->prepare("SELECT DISTINCT username FROM player_devices WHERE hwid = ?");
            $stmt->execute([$hwid]);
            $affected = $stmt->fetchAll(PDO::FETCH_COLUMN);

            logActivity('admin_ban', $hwid, [
                'reason' => $reason,
                'days' => $days,
                'bannedBy' => $bannedBy,
                'affected' => $affected
            ]);

            jsonResponse([
                'success' => true,
                'message' => 'HWID banido com sucesso',
                'hwid' => substr($hwid, 0, 16) . '...',
                'expiresAt' => $expiresAt,
                'affectedPlayers' => $affected
            ]);
            break;

        // =========================================
        // REMOVER BAN
        // =========================================
        case 'unban':
            $hwid = $data['hwid'] ?? null;
            $username = $data['username'] ?? null;

            // Se forneceu username, busca o HWID
            if (!$hwid && $username) {
                $stmt = $pdo->prepare("
                    SELECT hwid FROM player_devices
                    WHERE username = ?
                    ORDER BY last_seen DESC
                    LIMIT 1
                ");
                $stmt->execute([$username]);
                $device = $stmt->fetch();

                if ($device) {
                    $hwid = $device['hwid'];
                }
            }

            if (!$hwid) {
                jsonResponse(['error' => 'HWID ou username obrigatório', 'success' => false], 400);
            }

            $stmt = $pdo->prepare("DELETE FROM hwid_bans WHERE hwid = ?");
            $stmt->execute([$hwid]);

            $removed = $stmt->rowCount();

            logActivity('admin_unban', $hwid, ['removedBy' => $data['bannedBy'] ?? 'Admin']);

            jsonResponse([
                'success' => true,
                'message' => $removed > 0 ? 'Ban removido com sucesso' : 'HWID não estava banido',
                'removed' => $removed
            ]);
            break;

        // =========================================
        // BUSCAR INFO DE JOGADOR
        // =========================================
        case 'info':
            $username = $data['username'] ?? null;
            $hwid = $data['hwid'] ?? null;

            if (!$username && !$hwid) {
                jsonResponse(['error' => 'Username ou HWID obrigatório', 'success' => false], 400);
            }

            if ($username) {
                $stmt = $pdo->prepare("
                    SELECT * FROM player_devices
                    WHERE username = ?
                    ORDER BY last_seen DESC
                ");
                $stmt->execute([$username]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT * FROM player_devices
                    WHERE hwid = ?
                    ORDER BY last_seen DESC
                ");
                $stmt->execute([$hwid]);
            }

            $devices = $stmt->fetchAll();

            // Verifica bans
            $hwids = array_unique(array_column($devices, 'hwid'));
            $bans = [];

            if (!empty($hwids)) {
                $placeholders = implode(',', array_fill(0, count($hwids), '?'));
                $stmt = $pdo->prepare("
                    SELECT * FROM hwid_bans
                    WHERE hwid IN ($placeholders)
                      AND (expires_at IS NULL OR expires_at > NOW())
                ");
                $stmt->execute($hwids);
                $bans = $stmt->fetchAll();
            }

            jsonResponse([
                'success' => true,
                'devices' => $devices,
                'bans' => $bans,
                'isBanned' => !empty($bans)
            ]);
            break;

        default:
            jsonResponse(['error' => 'Ação inválida', 'success' => false], 400);
    }
} catch (Exception $e) {
    error_log("Erro no admin-ban: " . $e->getMessage());
    jsonResponse(['error' => 'Erro interno', 'success' => false], 500);
}
?>
