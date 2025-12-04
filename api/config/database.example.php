<?php
/**
 * Configuração de Conexão com Banco de Dados
 * Renomeie este arquivo para database.php e configure suas credenciais
 */

$db_host = 'localhost';
$db_name = 'horizonte_launcher';
$db_user = 'root';
$db_pass = '';

try {
    $pdo = new PDO(
        "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    die('Erro na conexão com banco de dados: ' . $e->getMessage());
}
