<?php
/**
 * Stats API - Endpoint JSON para estatísticas do launcher
 * Protegido por Bearer token ou X-Admin-Key
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Key');

// Preflight CORS
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
    echo json_encode(['error' => 'Erro de conexão com banco de dados']);
    exit;
}

try {
    // Sessões ativas (últimos 5 minutos)
    $activeSessions = $pdo->query("
        SELECT COUNT(*) as count
        FROM launcher_sessions
        WHERE last_heartbeat >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Jogadores em jogo agora (status = 'playing' e heartbeat recente)
    $playingNow = $pdo->query("
        SELECT COUNT(*) as count
        FROM launcher_sessions
        WHERE status = 'playing'
          AND last_heartbeat >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Total de dispositivos registrados
    $totalDevices = $pdo->query("SELECT COUNT(*) as count FROM player_devices")->fetch(PDO::FETCH_ASSOC)['count'];

    // Notificações ativas
    $activeNotifications = $pdo->query("
        SELECT COUNT(*) as count
        FROM notifications
        WHERE active = 1
          AND start_date <= NOW()
          AND (end_date IS NULL OR end_date >= NOW())
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Notificações enviadas hoje
    $notificationsSentToday = $pdo->query("
        SELECT COUNT(*) as count
        FROM notification_deliveries
        WHERE DATE(delivered_at) = CURDATE()
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // VMs detectadas (últimas 24h)
    $vmsDetected = $pdo->query("
        SELECT COUNT(*) as count
        FROM launcher_sessions
        WHERE is_vm = 1
          AND last_heartbeat >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Sessões por versão do launcher (24h)
    $sessionsByVersion = $pdo->query("
        SELECT launcher_version, COUNT(*) as count
        FROM launcher_sessions
        WHERE last_heartbeat >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY launcher_version
        ORDER BY count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'stats' => [
            'activeSessions' => (int)$activeSessions,
            'playingNow' => (int)$playingNow,
            'totalDevices' => (int)$totalDevices,
            'activeNotifications' => (int)$activeNotifications,
            'notificationsSentToday' => (int)$notificationsSentToday,
            'vmsDetected' => (int)$vmsDetected,
            'sessionsByVersion' => $sessionsByVersion
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erro ao buscar estatísticas: ' . $e->getMessage()]);
}
