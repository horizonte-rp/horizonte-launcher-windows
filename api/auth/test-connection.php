<?php
/**
 * Teste de conexão com o banco de dados
 * Acesse: http://horizontegames.com/api/auth/test-connection.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

// Credenciais (mesmo do db.php)
$host = '151.242.227.225';
$dbname = 'suburbio';
$user = 'sbb';
$pass = 'K7B02#C$mgH2Z<@';

$result = [
    'timestamp' => date('Y-m-d H:i:s'),
    'php_version' => PHP_VERSION,
    'tests' => []
];

// Teste 1: Extensão PDO
$result['tests']['pdo_extension'] = extension_loaded('pdo_mysql') ? 'OK' : 'ERRO: PDO MySQL não instalado';

// Teste 2: Conexão com o banco
try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $result['tests']['connection'] = 'OK';

    // Teste 3: Verifica se as tabelas existem
    $tables = ['player_devices', 'hwid_bans', 'session_tokens', 'auth_logs'];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SELECT 1 FROM $table LIMIT 1");
            $result['tests']["table_$table"] = 'OK';
        } catch (Exception $e) {
            $result['tests']["table_$table"] = 'ERRO: ' . $e->getMessage();
        }
    }

    // Teste 4: Inserção de teste
    try {
        $stmt = $pdo->prepare("INSERT INTO auth_logs (type, hwid, ip_address, data, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute(['test', 'test_hwid', $_SERVER['REMOTE_ADDR'] ?? 'unknown', '{"test":true}']);
        $result['tests']['insert'] = 'OK - ID: ' . $pdo->lastInsertId();

        // Limpa o teste
        $pdo->exec("DELETE FROM auth_logs WHERE type = 'test'");
    } catch (Exception $e) {
        $result['tests']['insert'] = 'ERRO: ' . $e->getMessage();
    }

} catch (PDOException $e) {
    $result['tests']['connection'] = 'ERRO: ' . $e->getMessage();
}

// Resultado
$allOk = true;
foreach ($result['tests'] as $test => $status) {
    if (strpos($status, 'ERRO') !== false) {
        $allOk = false;
        break;
    }
}

$result['status'] = $allOk ? 'SUCESSO' : 'FALHA';

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
