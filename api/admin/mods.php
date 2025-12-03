<?php
/**
 * Painel Admin - CRUD de Mods
 */

session_start();

if (!isset($_SESSION['admin_logged_in'])) {
    header('Location: index.php');
    exit;
}

require_once __DIR__ . '/../config/db.php';
$pdo = getDB();

if (!$pdo) {
    die('Erro: Não foi possível conectar ao banco de dados.');
}

$message = '';
$messageType = '';

// Processar formulários (POST requests)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'create') {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO launcher_mods (mod_id, name, author, description, full_description, image, category, game_category, popular, dependencies, download_url, version, size, order, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $_POST['mod_id'],
                $_POST['name'],
                $_POST['author'],
                $_POST['description'],
                $_POST['full_description'],
                $_POST['image'],
                $_POST['category'],
                $_POST['game_category'],
                isset($_POST['popular']) ? 1 : 0,
                $_POST['dependencies'] ?? '[]',
                $_POST['download_url'],
                $_POST['version'],
                $_POST['size'],
                $_POST['order'],
                isset($_POST['active']) ? 1 : 0
            ]);
            $message = 'Mod criado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao criar mod: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'update') {
        try {
            $stmt = $pdo->prepare("
                UPDATE launcher_mods
                SET mod_id = ?, name = ?, author = ?, description = ?, full_description = ?, image = ?, category = ?, game_category = ?, popular = ?, dependencies = ?, download_url = ?, version = ?, size = ?, order = ?, active = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $_POST['mod_id'],
                $_POST['name'],
                $_POST['author'],
                $_POST['description'],
                $_POST['full_description'],
                $_POST['image'],
                $_POST['category'],
                $_POST['game_category'],
                isset($_POST['popular']) ? 1 : 0,
                $_POST['dependencies'] ?? '[]',
                $_POST['download_url'],
                $_POST['version'],
                $_POST['size'],
                $_POST['order'],
                isset($_POST['active']) ? 1 : 0,
                $_POST['id']
            ]);
            $message = 'Mod atualizado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao atualizar mod: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'delete') {
        try {
            $stmt = $pdo->prepare("DELETE FROM launcher_mods WHERE id = ?");
            $stmt->execute([$_POST['id']]);
            $message = 'Mod deletado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao deletar mod: ' . $e->getMessage();
            $messageType = 'error';
        }
    }
}

// Buscar todos os mods
$mods = $pdo->query("
    SELECT * FROM launcher_mods
    ORDER BY game_category, category, name
")->fetchAll(PDO::FETCH_ASSOC);

// Contar mods por categoria de jogo
$gameCategories = ['rp' => 0, 'dm' => 0, 'dayz' => 0];
foreach ($mods as $mod) {
    $gameCategories[$mod['game_category']]++;
}

// Categorias de mods
$modCategories = [
    'tools' => 'Ferramentas',
    'cars' => 'Carros',
    'motorcycles' => 'Motos',
    'trucks' => 'Caminhões',
    'weapons' => 'Armas',
    'graphics' => 'Gráficos',
    'skins' => 'Skins',
    'sounds' => 'Sons',
    'maps' => 'Mapas',
    'scripts' => 'Scripts',
    'gameplay' => 'Gameplay',
    'optimization' => 'Otimização',
    'world' => 'Mundo',
    'hud' => 'HUD'
];

// Função auxiliar para formatar tamanho
function formatSize($bytes) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= (1 << (10 * $pow));
    return round($bytes, 2) . ' ' . $units[$pow];
}

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mods - Painel Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1600px;
            margin: 0 auto;
        }

        header {
            background: rgba(255, 255, 255, 0.95);
            padding: 20px 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        header h1 {
            color: #667eea;
            font-size: 28px;
        }

        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
        }

        .btn-primary {
            background: #667eea;
            color: white;
        }

        .btn-primary:hover {
            background: #5568d3;
        }

        .btn-success {
            background: #2ecc71;
            color: white;
            font-size: 12px;
            padding: 6px 12px;
        }

        .btn-success:hover {
            background: #27ae60;
        }

        .btn-warning {
            background: #f39c12;
            color: white;
            font-size: 12px;
            padding: 6px 12px;
        }

        .btn-warning:hover {
            background: #e67e22;
        }

        .btn-danger {
            background: #e74c3c;
            color: white;
            font-size: 12px;
            padding: 6px 12px;
        }

        .btn-danger:hover {
            background: #c0392b;
        }

        nav {
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
        }

        nav ul {
            list-style: none;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        nav a {
            padding: 12px 24px;
            background: #f8f9fa;
            color: #667eea;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.3s ease;
            display: block;
            white-space: nowrap;
        }

        nav a:hover, nav a.active {
            background: #667eea;
            color: white;
        }

        .message {
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-weight: 600;
        }

        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .stat-card h3 {
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .stat-card .value {
            font-size: 28px;
            font-weight: 700;
            color: #667eea;
        }

        .content-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
            overflow-x: auto;
        }

        .content-card h2 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 24px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 1200px;
        }

        table th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #667eea;
            border-bottom: 2px solid #667eea;
            white-space: nowrap;
        }

        table td {
            padding: 12px;
            border-bottom: 1px solid #eee;
        }

        table tr:hover {
            background: #f8f9fa;
        }

        .badge {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
        }

        .badge-primary {
            background: #667eea;
            color: white;
        }

        .badge-success {
            background: #2ecc71;
            color: white;
        }

        .badge-danger {
            background: #e74c3c;
            color: white;
        }

        .badge-info {
            background: #3498db;
            color: white;
        }

        .form-group {
            margin-bottom: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .form-group.full {
            grid-template-columns: 1fr;
        }

        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #333;
        }

        input, select, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        textarea {
            resize: vertical;
            min-height: 80px;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
        }

        .form-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 700px;
            width: 90%;
            max-height: 85vh;
            overflow-y: auto;
        }

        .modal h3 {
            color: #667eea;
            margin-bottom: 20px;
        }

        .actions-cell {
            display: flex;
            gap: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📦 Gerenciar Mods</h1>
            <a href="index.php" class="btn btn-primary">← Voltar</a>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php" class="active">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
                <li><a href="index.php?logout=1">🚪 Sair</a></li>
            </ul>
        </nav>

        <?php if ($message): ?>
            <div class="message <?= $messageType ?>">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total</h3>
                <div class="value"><?= count($mods) ?></div>
            </div>
            <div class="stat-card">
                <h3>RP</h3>
                <div class="value"><?= $gameCategories['rp'] ?></div>
            </div>
            <div class="stat-card">
                <h3>DM</h3>
                <div class="value"><?= $gameCategories['dm'] ?></div>
            </div>
            <div class="stat-card">
                <h3>DayZ</h3>
                <div class="value"><?= $gameCategories['dayz'] ?></div>
            </div>
        </div>

        <div class="content-card">
            <h2>Todos os Mods</h2>
            <button class="btn btn-primary" onclick="openAddModal()">+ Novo Mod</button>

            <?php if (empty($mods)): ?>
                <p style="text-align: center; color: #999; padding: 40px; margin-top: 20px;">
                    Nenhum mod registrado
                </p>
            <?php else: ?>
                <table style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Autor</th>
                            <th>Categoria</th>
                            <th>Jogo</th>
                            <th>Versão</th>
                            <th>Tamanho</th>
                            <th>Popular</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($mods as $mod): ?>
                            <tr>
                                <td><strong><?= htmlspecialchars($mod['name']) ?></strong></td>
                                <td><?= htmlspecialchars($mod['author']) ?></td>
                                <td><span class="badge badge-info"><?= $modCategories[$mod['category']] ?? $mod['category'] ?></span></td>
                                <td><span class="badge badge-primary"><?= strtoupper($mod['game_category']) ?></span></td>
                                <td><?= $mod['version'] ?></td>
                                <td><?= formatSize($mod['size']) ?></td>
                                <td>
                                    <?php if ($mod['popular']): ?>
                                        <span class="badge badge-success">Sim</span>
                                    <?php else: ?>
                                        <span style="color: #999;">-</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php if ($mod['active']): ?>
                                        <span class="badge badge-success">Ativo</span>
                                    <?php else: ?>
                                        <span class="badge badge-danger">Inativo</span>
                                    <?php endif; ?>
                                </td>
                                <td class="actions-cell">
                                    <button class="btn btn-warning" onclick="openEditModal(<?= htmlspecialchars(json_encode($mod)) ?>)">Editar</button>
                                    <form method="POST" style="display:inline;" onsubmit="return confirm('Tem certeza que deseja deletar este mod?');">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= $mod['id'] ?>">
                                        <button type="submit" class="btn btn-danger">Deletar</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
    </div>

    <!-- Modal de Formulário -->
    <div class="modal" id="formModal">
        <div class="modal-content">
            <h3 id="modalTitle">Novo Mod</h3>
            <form method="POST">
                <input type="hidden" name="action" id="formAction" value="create">
                <input type="hidden" name="id" id="formId" value="">

                <div class="form-group">
                    <div>
                        <label>ID do Mod (slug) *</label>
                        <input type="text" name="mod_id" id="mod_id" required>
                    </div>
                    <div>
                        <label>Nome do Mod *</label>
                        <input type="text" name="name" id="name" required>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Autor *</label>
                        <input type="text" name="author" id="author" required>
                    </div>
                    <div>
                        <label>Versão *</label>
                        <input type="text" name="version" id="version" value="1.0" required>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Categoria do Mod *</label>
                        <select name="category" id="category" required>
                            <?php foreach ($modCategories as $key => $label): ?>
                                <option value="<?= $key ?>"><?= $label ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label>Categoria do Jogo *</label>
                        <select name="game_category" id="game_category" required>
                            <option value="rp">RP</option>
                            <option value="dm">DM</option>
                            <option value="dayz">DayZ</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Tamanho (bytes) *</label>
                        <input type="number" name="size" id="size" value="0" required>
                    </div>
                    <div>
                        <label>Ordem de Exibição</label>
                        <input type="number" name="order" id="order" value="0">
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>URL da Imagem</label>
                        <input type="text" name="image" id="image">
                    </div>
                    <div>
                        <label>URL de Download *</label>
                        <input type="text" name="download_url" id="download_url" required>
                    </div>
                </div>

                <div class="form-group full">
                    <label>Descrição Curta *</label>
                    <textarea name="description" id="description" required></textarea>
                </div>

                <div class="form-group full">
                    <label>Descrição Completa *</label>
                    <textarea name="full_description" id="full_description" required></textarea>
                </div>

                <div class="form-group full">
                    <div class="checkbox-group">
                        <input type="checkbox" name="popular" id="popular">
                        <label for="popular" style="margin-bottom: 0;">Mod Popular</label>
                    </div>
                </div>

                <div class="form-group full">
                    <div class="checkbox-group">
                        <input type="checkbox" name="active" id="active" checked>
                        <label for="active" style="margin-bottom: 0;">Ativo</label>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-success">Salvar</button>
                    <button type="button" class="btn btn-primary" onclick="closeModal()">Cancelar</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function openAddModal() {
            document.getElementById('modalTitle').textContent = 'Novo Mod';
            document.getElementById('formAction').value = 'create';
            document.getElementById('formId').value = '';
            document.getElementById('mod_id').value = '';
            document.getElementById('name').value = '';
            document.getElementById('author').value = '';
            document.getElementById('version').value = '1.0';
            document.getElementById('category').value = 'tools';
            document.getElementById('game_category').value = 'rp';
            document.getElementById('size').value = '0';
            document.getElementById('order').value = '0';
            document.getElementById('image').value = '';
            document.getElementById('download_url').value = '';
            document.getElementById('description').value = '';
            document.getElementById('full_description').value = '';
            document.getElementById('popular').checked = false;
            document.getElementById('active').checked = true;
            document.getElementById('formModal').classList.add('active');
        }

        function openEditModal(mod) {
            document.getElementById('modalTitle').textContent = 'Editar Mod';
            document.getElementById('formAction').value = 'update';
            document.getElementById('formId').value = mod.id;
            document.getElementById('mod_id').value = mod.mod_id;
            document.getElementById('name').value = mod.name;
            document.getElementById('author').value = mod.author;
            document.getElementById('version').value = mod.version;
            document.getElementById('category').value = mod.category;
            document.getElementById('game_category').value = mod.game_category;
            document.getElementById('size').value = mod.size;
            document.getElementById('order').value = mod.order;
            document.getElementById('image').value = mod.image || '';
            document.getElementById('download_url').value = mod.download_url;
            document.getElementById('description').value = mod.description;
            document.getElementById('full_description').value = mod.full_description;
            document.getElementById('popular').checked = mod.popular == 1;
            document.getElementById('active').checked = mod.active == 1;
            document.getElementById('formModal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('formModal').classList.remove('active');
        }

        // Fechar modal ao clicar fora
        document.getElementById('formModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    </script>
</body>
</html>
