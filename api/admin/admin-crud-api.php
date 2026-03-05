<?php
/**
 * Admin CRUD API - Endpoint JSON unificado para gerenciamento
 * Protegido por Bearer token ou X-Admin-Key
 *
 * Módulos: bans, notifications, devices, mods, news
 * Ações: list, create, update, delete, toggle, stats
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/validate_token.php';

// Validar acesso admin (token ou API key)
requireAdminAuth();

$pdo = getDB();
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erro de conexão com banco de dados']);
    exit;
}

// Ler body JSON
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$module = $input['module'] ?? '';
$action = $input['action'] ?? 'list';

try {
    switch ($module) {

        // ==========================================
        // BANS
        // ==========================================
        case 'bans':
            switch ($action) {
                case 'list':
                    $rows = $pdo->query("SELECT * FROM hwid_bans ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows]);
                    break;

                case 'stats':
                    $total = $pdo->query("SELECT COUNT(*) as c FROM hwid_bans")->fetch()['c'];
                    $active = $pdo->query("SELECT COUNT(*) as c FROM hwid_bans WHERE expires_at IS NULL OR expires_at > NOW()")->fetch()['c'];
                    $permanent = $pdo->query("SELECT COUNT(*) as c FROM hwid_bans WHERE expires_at IS NULL")->fetch()['c'];
                    $expired = $pdo->query("SELECT COUNT(*) as c FROM hwid_bans WHERE expires_at IS NOT NULL AND expires_at < NOW()")->fetch()['c'];
                    echo json_encode(['success' => true, 'data' => compact('total', 'active', 'permanent', 'expired')]);
                    break;

                case 'create':
                    $hwid = $input['hwid'] ?? '';
                    $reason = $input['reason'] ?? '';
                    $bannedBy = $input['banned_by'] ?? 'Admin';
                    $expiresAt = !empty($input['expires_at']) ? $input['expires_at'] : null;

                    if (empty($hwid) || empty($reason)) {
                        echo json_encode(['success' => false, 'error' => 'HWID e razão são obrigatórios']);
                        break;
                    }

                    // Verificar duplicata
                    $check = $pdo->prepare("SELECT id FROM hwid_bans WHERE hwid = ? AND (expires_at IS NULL OR expires_at > NOW())");
                    $check->execute([$hwid]);
                    if ($check->fetch()) {
                        echo json_encode(['success' => false, 'error' => 'Este HWID já possui um ban ativo']);
                        break;
                    }

                    $stmt = $pdo->prepare("INSERT INTO hwid_bans (hwid, reason, banned_by, expires_at) VALUES (?, ?, ?, ?)");
                    $stmt->execute([$hwid, $reason, $bannedBy, $expiresAt]);
                    echo json_encode(['success' => true, 'message' => 'Ban criado com sucesso']);
                    break;

                case 'update':
                    $id = $input['id'] ?? 0;
                    $reason = $input['reason'] ?? '';
                    $bannedBy = $input['banned_by'] ?? 'Admin';
                    $expiresAt = !empty($input['expires_at']) ? $input['expires_at'] : null;

                    $stmt = $pdo->prepare("UPDATE hwid_bans SET reason = ?, banned_by = ?, expires_at = ? WHERE id = ?");
                    $stmt->execute([$reason, $bannedBy, $expiresAt, $id]);
                    echo json_encode(['success' => true, 'message' => 'Ban atualizado']);
                    break;

                case 'delete':
                    $id = $input['id'] ?? 0;
                    $stmt = $pdo->prepare("DELETE FROM hwid_bans WHERE id = ?");
                    $stmt->execute([$id]);
                    echo json_encode(['success' => true, 'message' => 'Ban removido']);
                    break;

                default:
                    echo json_encode(['success' => false, 'error' => 'Ação inválida para bans']);
            }
            break;

        // ==========================================
        // NOTIFICATIONS
        // ==========================================
        case 'notifications':
            switch ($action) {
                case 'list':
                    $rows = $pdo->query("
                        SELECT n.*,
                            (SELECT COUNT(*) FROM notification_deliveries WHERE notification_id = n.id) as delivery_count
                        FROM notifications n
                        ORDER BY n.created_at DESC
                    ")->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows]);
                    break;

                case 'create':
                    $title = $input['title'] ?? '';
                    $body = $input['body'] ?? '';
                    $icon = $input['icon'] ?? null;
                    $silent = isset($input['silent']) ? (int)$input['silent'] : 0;
                    $actionType = $input['action_type'] ?? 'none';
                    $actionValue = $input['action_value'] ?? null;
                    $targetType = $input['target_type'] ?? 'all';
                    $targetHwids = null;
                    $startDate = $input['start_date'] ?? date('Y-m-d H:i:s');
                    $endDate = !empty($input['end_date']) ? $input['end_date'] : null;

                    if (empty($title) || empty($body)) {
                        echo json_encode(['success' => false, 'error' => 'Título e corpo são obrigatórios']);
                        break;
                    }

                    if ($targetType === 'specific_hwid' && !empty($input['target_hwids'])) {
                        $hwids = array_map('trim', explode(',', $input['target_hwids']));
                        $targetHwids = json_encode($hwids);
                    }

                    $stmt = $pdo->prepare("
                        INSERT INTO notifications (title, body, icon, silent, action_type, action_value, target_type, target_hwids, start_date, end_date, active, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Admin')
                    ");
                    $stmt->execute([$title, $body, $icon, $silent, $actionType, $actionValue, $targetType, $targetHwids, $startDate, $endDate]);
                    echo json_encode(['success' => true, 'message' => 'Notificação criada']);
                    break;

                case 'toggle':
                    $id = $input['id'] ?? 0;
                    $stmt = $pdo->prepare("UPDATE notifications SET active = NOT active WHERE id = ?");
                    $stmt->execute([$id]);
                    echo json_encode(['success' => true, 'message' => 'Status alterado']);
                    break;

                case 'delete':
                    $id = $input['id'] ?? 0;
                    $pdo->prepare("DELETE FROM notification_deliveries WHERE notification_id = ?")->execute([$id]);
                    $pdo->prepare("DELETE FROM notifications WHERE id = ?")->execute([$id]);
                    echo json_encode(['success' => true, 'message' => 'Notificação removida']);
                    break;

                default:
                    echo json_encode(['success' => false, 'error' => 'Ação inválida para notifications']);
            }
            break;

        // ==========================================
        // DEVICES
        // ==========================================
        case 'devices':
            switch ($action) {
                case 'list':
                    $rows = $pdo->query("SELECT * FROM player_devices ORDER BY last_seen DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows]);
                    break;

                case 'search':
                    $query = trim($input['query'] ?? '');
                    if (empty($query) || strlen($query) < 2) {
                        echo json_encode(['success' => false, 'error' => 'Digite pelo menos 2 caracteres']);
                        break;
                    }
                    $like = '%' . $query . '%';
                    $stmt = $pdo->prepare("
                        SELECT * FROM player_devices
                        WHERE username LIKE ? OR hwid LIKE ? OR ip_address LIKE ?
                        ORDER BY last_seen DESC
                        LIMIT 200
                    ");
                    $stmt->execute([$like, $like, $like]);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows, 'total' => count($rows)]);
                    break;

                case 'stats':
                    $total = $pdo->query("SELECT COUNT(*) as c FROM player_devices")->fetch()['c'];
                    $active24h = $pdo->query("SELECT COUNT(*) as c FROM player_devices WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR)")->fetch()['c'];
                    $vms = $pdo->query("SELECT COUNT(*) as c FROM player_devices WHERE is_vm = 1")->fetch()['c'];
                    echo json_encode(['success' => true, 'data' => compact('total', 'active24h', 'vms')]);
                    break;

                default:
                    echo json_encode(['success' => false, 'error' => 'Ação inválida para devices']);
            }
            break;

        // ==========================================
        // MODS
        // ==========================================
        case 'mods':
            switch ($action) {
                case 'list':
                    $rows = $pdo->query("SELECT * FROM launcher_mods ORDER BY game_category, category, name")->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows]);
                    break;

                case 'stats':
                    $total = $pdo->query("SELECT COUNT(*) as c FROM launcher_mods")->fetch()['c'];
                    $rp = $pdo->query("SELECT COUNT(*) as c FROM launcher_mods WHERE game_category = 'rp'")->fetch()['c'];
                    $dm = $pdo->query("SELECT COUNT(*) as c FROM launcher_mods WHERE game_category = 'dm'")->fetch()['c'];
                    $dayz = $pdo->query("SELECT COUNT(*) as c FROM launcher_mods WHERE game_category = 'dayz'")->fetch()['c'];
                    echo json_encode(['success' => true, 'data' => compact('total', 'rp', 'dm', 'dayz')]);
                    break;

                case 'create':
                    $stmt = $pdo->prepare("
                        INSERT INTO launcher_mods (mod_id, name, author, description, full_description, image, category, game_category, popular, dependencies, download_url, version, size, `order`, active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $stmt->execute([
                        $input['mod_id'] ?? '', $input['name'] ?? '', $input['author'] ?? '',
                        $input['description'] ?? '', $input['full_description'] ?? '',
                        $input['image'] ?? null, $input['category'] ?? 'tools',
                        $input['game_category'] ?? 'rp', isset($input['popular']) ? (int)$input['popular'] : 0,
                        $input['dependencies'] ?? '[]', $input['download_url'] ?? '',
                        $input['version'] ?? '1.0', (int)($input['size'] ?? 0),
                        (int)($input['order'] ?? 0), isset($input['active']) ? (int)$input['active'] : 1
                    ]);
                    echo json_encode(['success' => true, 'message' => 'Mod criado']);
                    break;

                case 'update':
                    $id = $input['id'] ?? 0;
                    $stmt = $pdo->prepare("
                        UPDATE launcher_mods SET
                            mod_id = ?, name = ?, author = ?, description = ?, full_description = ?,
                            image = ?, category = ?, game_category = ?, popular = ?, dependencies = ?,
                            download_url = ?, version = ?, size = ?, `order` = ?, active = ?, updated_at = NOW()
                        WHERE id = ?
                    ");
                    $stmt->execute([
                        $input['mod_id'] ?? '', $input['name'] ?? '', $input['author'] ?? '',
                        $input['description'] ?? '', $input['full_description'] ?? '',
                        $input['image'] ?? null, $input['category'] ?? 'tools',
                        $input['game_category'] ?? 'rp', isset($input['popular']) ? (int)$input['popular'] : 0,
                        $input['dependencies'] ?? '[]', $input['download_url'] ?? '',
                        $input['version'] ?? '1.0', (int)($input['size'] ?? 0),
                        (int)($input['order'] ?? 0), isset($input['active']) ? (int)$input['active'] : 1,
                        $id
                    ]);
                    echo json_encode(['success' => true, 'message' => 'Mod atualizado']);
                    break;

                case 'delete':
                    $id = $input['id'] ?? 0;
                    $pdo->prepare("DELETE FROM launcher_mods WHERE id = ?")->execute([$id]);
                    echo json_encode(['success' => true, 'message' => 'Mod removido']);
                    break;

                default:
                    echo json_encode(['success' => false, 'error' => 'Ação inválida para mods']);
            }
            break;

        // ==========================================
        // NEWS
        // ==========================================
        case 'news':
            switch ($action) {
                case 'list':
                    $rows = $pdo->query("SELECT * FROM launcher_news ORDER BY category, `order`, created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['success' => true, 'data' => $rows]);
                    break;

                case 'stats':
                    $total = $pdo->query("SELECT COUNT(*) as c FROM launcher_news")->fetch()['c'];
                    $rp = $pdo->query("SELECT COUNT(*) as c FROM launcher_news WHERE category = 'rp'")->fetch()['c'];
                    $dm = $pdo->query("SELECT COUNT(*) as c FROM launcher_news WHERE category = 'dm'")->fetch()['c'];
                    $dayz = $pdo->query("SELECT COUNT(*) as c FROM launcher_news WHERE category = 'dayz'")->fetch()['c'];
                    echo json_encode(['success' => true, 'data' => compact('total', 'rp', 'dm', 'dayz')]);
                    break;

                case 'create':
                    $stmt = $pdo->prepare("INSERT INTO launcher_news (category, title, image, link, `order`, active) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['category'] ?? 'rp', $input['title'] ?? '',
                        $input['image'] ?? null, $input['link'] ?? '',
                        (int)($input['order'] ?? 0), isset($input['active']) ? (int)$input['active'] : 1
                    ]);
                    echo json_encode(['success' => true, 'message' => 'Notícia criada']);
                    break;

                case 'update':
                    $id = $input['id'] ?? 0;
                    $stmt = $pdo->prepare("UPDATE launcher_news SET category = ?, title = ?, image = ?, link = ?, `order` = ?, active = ?, updated_at = NOW() WHERE id = ?");
                    $stmt->execute([
                        $input['category'] ?? 'rp', $input['title'] ?? '',
                        $input['image'] ?? null, $input['link'] ?? '',
                        (int)($input['order'] ?? 0), isset($input['active']) ? (int)$input['active'] : 1,
                        $id
                    ]);
                    echo json_encode(['success' => true, 'message' => 'Notícia atualizada']);
                    break;

                case 'delete':
                    $id = $input['id'] ?? 0;
                    $pdo->prepare("DELETE FROM launcher_news WHERE id = ?")->execute([$id]);
                    echo json_encode(['success' => true, 'message' => 'Notícia removida']);
                    break;

                default:
                    echo json_encode(['success' => false, 'error' => 'Ação inválida para news']);
            }
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Módulo inválido: ' . $module]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
