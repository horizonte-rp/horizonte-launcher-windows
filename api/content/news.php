<?php
/**
 * API Endpoint: Listar Notícias
 * Retorna notícias por categoria (rp/dm/dayz)
 *
 * GET /content/news.php?category=rp
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Apenas GET é permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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
    // Parâmetro de categoria (opcional)
    $category = $_GET['category'] ?? null;

    // Validar categoria
    $validCategories = ['rp', 'dm', 'dayz'];
    if ($category && !in_array($category, $validCategories)) {
        throw new Exception('Categoria inválida');
    }

    // Montar query
    $query = "
        SELECT
            id,
            title,
            image,
            link
        FROM launcher_news
        WHERE active = 1
    ";

    $params = [];
    if ($category) {
        $query .= " AND category = ?";
        $params[] = $category;
    }

    $query .= " ORDER BY `order` ASC, id DESC";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $news = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Converter tipos
    foreach ($news as &$item) {
        $item['id'] = (int)$item['id'];
    }

    // Retornar resposta
    echo json_encode([
        'success' => true,
        'news' => $news,
        'count' => count($news)
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
