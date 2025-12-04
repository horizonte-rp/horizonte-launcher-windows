<?php
/**
 * API Endpoint: Buscar notificações pendentes
 * Retorna notificações que ainda não foram entregues ao usuário
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Apenas POST é permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Conexão com banco de dados
require_once __DIR__ . '/../config/db.php';
$pdo = getDB();

if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

try {
    // Receber dados
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['hwid']) || !isset($input['sessionId'])) {
        throw new Exception('HWID e sessionId são obrigatórios');
    }

    $hwid = $input['hwid'];
    $sessionId = $input['sessionId'];

    // Buscar notificações pendentes que:
    // 1. Estão ativas
    // 2. Estão dentro do período (start_date <= agora <= end_date)
    // 3. Ainda não foram entregues para este HWID/session
    // 4. São para todos OU especificamente para este HWID
    $query = "
        SELECT
            n.id,
            n.title,
            n.body,
            n.icon,
            n.silent,
            n.action_type,
            n.action_value
        FROM notifications n
        WHERE n.active = 1
          AND n.start_date <= NOW()
          AND (n.end_date IS NULL OR n.end_date >= NOW())
          AND NOT EXISTS (
              SELECT 1 FROM notification_deliveries nd
              WHERE nd.notification_id = n.id
                AND nd.hwid = ?
          )
          AND (
              n.target_type = 'all'
              OR (n.target_type = 'specific_hwid' AND JSON_CONTAINS(n.target_hwids, ?))
          )
        ORDER BY n.created_at DESC
        LIMIT 10
    ";

    $stmt = $pdo->prepare($query);
    $stmt->execute([$hwid, json_encode($hwid)]);
    $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Formatar notificações para o launcher
    $formattedNotifications = [];
    foreach ($notifications as $notif) {
        $formatted = [
            'id' => $notif['id'],
            'title' => $notif['title'],
            'body' => $notif['body'],
            'icon' => $notif['icon'],
            'silent' => (bool)$notif['silent']
        ];

        // Adicionar ação se houver
        if ($notif['action_type'] !== 'none' && !empty($notif['action_value'])) {
            $formatted['action'] = [
                'type' => $notif['action_type'],
            ];

            // Adicionar valor específico da ação
            switch ($notif['action_type']) {
                case 'open_url':
                    $formatted['action']['url'] = $notif['action_value'];
                    break;
                case 'navigate':
                    $formatted['action']['page'] = $notif['action_value'];
                    break;
                case 'play':
                    $formatted['action']['serverId'] = $notif['action_value'];
                    break;
            }
        }

        $formattedNotifications[] = $formatted;

        // Registrar entrega
        $insertDelivery = "INSERT INTO notification_deliveries (notification_id, hwid, session_id) VALUES (?, ?, ?)";
        $stmtDelivery = $pdo->prepare($insertDelivery);
        $stmtDelivery->execute([$notif['id'], $hwid, $sessionId]);
    }

    // Retornar resposta
    echo json_encode([
        'success' => true,
        'notifications' => $formattedNotifications,
        'count' => count($formattedNotifications)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
