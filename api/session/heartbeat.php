<?php
/**
 * API Endpoint: Heartbeat de sessão
 * Registra/atualiza a sessão ativa do launcher
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

    // Validar campos obrigatórios
    $requiredFields = ['sessionId', 'hwid', 'platform', 'arch', 'launcherVersion'];
    foreach ($requiredFields as $field) {
        if (!isset($input[$field])) {
            throw new Exception("Campo obrigatório ausente: $field");
        }
    }

    $sessionId = $input['sessionId'];
    $hwid = $input['hwid'];
    $hwidComponents = isset($input['hwidComponents']) ? json_encode($input['hwidComponents']) : null;
    $manufacturer = $input['manufacturer'] ?? null;
    $isVM = isset($input['isVM']) ? (int)$input['isVM'] : 0;
    $vmConfidence = isset($input['vmConfidence']) ? (int)$input['vmConfidence'] : 0;
    $platform = $input['platform'];
    $arch = $input['arch'];
    $launcherVersion = $input['launcherVersion'];

    // Verificar se sessão já existe
    $checkQuery = "SELECT id FROM launcher_sessions WHERE session_id = ?";
    $stmt = $pdo->prepare($checkQuery);
    $stmt->execute([$sessionId]);
    $existingSession = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existingSession) {
        // Atualizar sessão existente
        $updateQuery = "
            UPDATE launcher_sessions SET
                hwid = ?,
                hwid_components = ?,
                manufacturer = ?,
                is_vm = ?,
                vm_confidence = ?,
                platform = ?,
                arch = ?,
                launcher_version = ?,
                last_heartbeat = NOW(),
                status = 'active'
            WHERE session_id = ?
        ";

        $stmt = $pdo->prepare($updateQuery);
        $stmt->execute([
            $hwid,
            $hwidComponents,
            $manufacturer,
            $isVM,
            $vmConfidence,
            $platform,
            $arch,
            $launcherVersion,
            $sessionId
        ]);

        $response = [
            'success' => true,
            'action' => 'updated',
            'sessionId' => $sessionId
        ];
    } else {
        // Criar nova sessão
        $insertQuery = "
            INSERT INTO launcher_sessions (
                session_id,
                hwid,
                hwid_components,
                manufacturer,
                is_vm,
                vm_confidence,
                platform,
                arch,
                launcher_version,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ";

        $stmt = $pdo->prepare($insertQuery);
        $stmt->execute([
            $sessionId,
            $hwid,
            $hwidComponents,
            $manufacturer,
            $isVM,
            $vmConfidence,
            $platform,
            $arch,
            $launcherVersion
        ]);

        $response = [
            'success' => true,
            'action' => 'created',
            'sessionId' => $sessionId
        ];
    }

    // Limpar sessões antigas (opcional, executar periodicamente)
    // Você pode descomentar esta linha ou executar via CRON
    // $pdo->query("CALL cleanup_old_sessions()");

    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
