<?php
/**
 * Configuração do Banco de Dados
 * Horizonte Launcher - Auth API
 */

define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'horizonte');
define('DB_USER', 'root');
define('DB_PASS', '@horizonte@rp@');

// Chave secreta para validar assinaturas (DEVE ser igual ao launcher)
define('SECRET_KEY', 'horizonte-launcher-secret-2024');

// Chave secreta para endpoints admin (DEVE ser igual ao servidor SA-MP)
define('ADMIN_API_KEY', 'HqW5Rxj81jaMt69y31qSXnhrtKIfA6');

/**
 * Conexão PDO com o banco de dados
 */
function getDB() {
    static $pdo = null;

    if ($pdo === null) {
        try {
            $pdo = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch (PDOException $e) {
            error_log("Erro de conexão: " . $e->getMessage());
            return null;
        }
    }

    return $pdo;
}

/**
 * Retorna resposta JSON
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Launcher-Version, X-Request-Timestamp');

    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Obtém dados JSON do request
 */
function getRequestData() {
    $json = file_get_contents('php://input');
    return json_decode($json, true) ?? [];
}

/**
 * Valida assinatura HMAC
 */
function validateSignature($hwid, $timestamp, $signature) {
    $data = json_encode(['hwid' => $hwid, 'timestamp' => $timestamp]);
    $expectedSignature = hash_hmac('sha256', $data, SECRET_KEY);
    return hash_equals($expectedSignature, $signature);
}

/**
 * Gera token aleatório seguro
 */
function generateToken($length = 32) {
    return bin2hex(random_bytes($length));
}

/**
 * Log de atividade
 */
function logActivity($type, $hwid, $data = []) {
    $pdo = getDB();
    if (!$pdo) return;

    try {
        $stmt = $pdo->prepare("
            INSERT INTO auth_logs (type, hwid, ip_address, data, created_at)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $type,
            $hwid,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            json_encode($data)
        ]);
    } catch (Exception $e) {
        error_log("Erro ao registrar log: " . $e->getMessage());
    }
}
?>
