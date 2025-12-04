<?php
/**
 * API Endpoint: Listar Mods
 * Retorna mods filtrados por gameCategory e/ou category
 *
 * GET /content/mods.php?gameCategory=rp&category=tools&popular=true
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
    // Parâmetros de filtro
    $gameCategory = $_GET['gameCategory'] ?? null;
    $category = $_GET['category'] ?? null;
    $popular = isset($_GET['popular']) ? filter_var($_GET['popular'], FILTER_VALIDATE_BOOLEAN) : null;

    // Validar gameCategory
    $validGameCategories = ['rp', 'dm', 'dayz'];
    if ($gameCategory && !in_array($gameCategory, $validGameCategories)) {
        throw new Exception('gameCategory inválida');
    }

    // Validar category
    $validCategories = ['tools', 'cars', 'motorcycles', 'trucks', 'weapons', 'graphics', 'skins', 'sounds', 'maps', 'scripts', 'gameplay', 'optimization', 'world', 'hud'];
    if ($category && !in_array($category, $validCategories)) {
        throw new Exception('category inválida');
    }

    // Montar query
    $query = "
        SELECT
            mod_id as id,
            name,
            author,
            description,
            full_description as fullDescription,
            image,
            category,
            game_category as gameCategory,
            popular,
            dependencies,
            download_url as downloadUrl,
            version,
            size,
            downloads
        FROM launcher_mods
        WHERE active = 1
    ";

    $params = [];

    if ($gameCategory) {
        $query .= " AND game_category = ?";
        $params[] = $gameCategory;
    }

    if ($category) {
        $query .= " AND category = ?";
        $params[] = $category;
    }

    if ($popular !== null) {
        $query .= " AND popular = ?";
        $params[] = $popular ? 1 : 0;
    }

    $query .= " ORDER BY `order` ASC, downloads DESC, id DESC";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $mods = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Processar dados
    foreach ($mods as &$mod) {
        // Converter popular para boolean
        $mod['popular'] = (bool)$mod['popular'];

        // Converter size e downloads para inteiros
        $mod['size'] = (int)$mod['size'];
        $mod['downloads'] = (int)$mod['downloads'];

        // Parse dependencies JSON
        if (!empty($mod['dependencies'])) {
            $mod['dependencies'] = json_decode($mod['dependencies'], true) ?? [];
        } else {
            $mod['dependencies'] = [];
        }
    }

    // Retornar resposta
    echo json_encode([
        'success' => true,
        'mods' => $mods,
        'count' => count($mods)
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
