<?php
/**
 * Painel Admin - CRUD de Servidores
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
                INSERT INTO launcher_servers (category, server_id, name, ip, port, max_players, discord, order, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $_POST['category'],
                $_POST['server_id'],
                $_POST['name'],
                $_POST['ip'],
                $_POST['port'],
                $_POST['max_players'],
                $_POST['discord'],
                $_POST['order'],
                isset($_POST['active']) ? 1 : 0
            ]);
            $message = 'Servidor criado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao criar servidor: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'update') {
        try {
            $stmt = $pdo->prepare("
                UPDATE launcher_servers
                SET category = ?, server_id = ?, name = ?, ip = ?, port = ?, max_players = ?, discord = ?, order = ?, active = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $_POST['category'],
                $_POST['server_id'],
                $_POST['name'],
                $_POST['ip'],
                $_POST['port'],
                $_POST['max_players'],
                $_POST['discord'],
                $_POST['order'],
                isset($_POST['active']) ? 1 : 0,
                $_POST['id']
            ]);
            $message = 'Servidor atualizado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao atualizar servidor: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'delete') {
        try {
            $stmt = $pdo->prepare("DELETE FROM launcher_servers WHERE id = ?");
            $stmt->execute([$_POST['id']]);
            $message = 'Servidor deletado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao deletar servidor: ' . $e->getMessage();
            $messageType = 'error';
        }
    }
}

// Buscar todos os servidores
$servers = $pdo->query("
    SELECT * FROM launcher_servers
    ORDER BY category, order, name
")->fetchAll(PDO::FETCH_ASSOC);

// Contar servidores por categoria
$categories = ['rp' => 0, 'dm' => 0, 'dayz' => 0];
foreach ($servers as $server) {
    $categories[$server['category']]++;
}

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Servidores - Painel Admin</title>
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
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
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
            <h1>🎮 Gerenciar Servidores</h1>
            <a href="index.php" class="btn btn-primary">← Voltar</a>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="servers.php" class="active">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
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
                <div class="value"><?= count($servers) ?></div>
            </div>
            <div class="stat-card">
                <h3>RP</h3>
                <div class="value"><?= $categories['rp'] ?></div>
            </div>
            <div class="stat-card">
                <h3>DM</h3>
                <div class="value"><?= $categories['dm'] ?></div>
            </div>
            <div class="stat-card">
                <h3>DayZ</h3>
                <div class="value"><?= $categories['dayz'] ?></div>
            </div>
        </div>

        <div class="content-card">
            <h2>Todos os Servidores</h2>
            <button class="btn btn-primary" onclick="openAddModal()">+ Novo Servidor</button>

            <?php if (empty($servers)): ?>
                <p style="text-align: center; color: #999; padding: 40px; margin-top: 20px;">
                    Nenhum servidor registrado
                </p>
            <?php else: ?>
                <table style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Categoria</th>
                            <th>Server ID</th>
                            <th>IP:Porta</th>
                            <th>Jogadores</th>
                            <th>Status</th>
                            <th>Ordem</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($servers as $server): ?>
                            <tr>
                                <td><strong><?= htmlspecialchars($server['name']) ?></strong></td>
                                <td><span class="badge badge-primary"><?= strtoupper($server['category']) ?></span></td>
                                <td><?= $server['server_id'] ?></td>
                                <td><?= htmlspecialchars($server['ip']) ?>:<?= $server['port'] ?></td>
                                <td><?= $server['max_players'] ?></td>
                                <td>
                                    <?php if ($server['active']): ?>
                                        <span class="badge badge-success">Ativo</span>
                                    <?php else: ?>
                                        <span class="badge badge-danger">Inativo</span>
                                    <?php endif; ?>
                                </td>
                                <td><?= $server['order'] ?></td>
                                <td class="actions-cell">
                                    <button class="btn btn-warning" onclick="openEditModal(<?= htmlspecialchars(json_encode($server)) ?>)">Editar</button>
                                    <form method="POST" style="display:inline;" onsubmit="return confirm('Tem certeza que deseja deletar este servidor?');">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= $server['id'] ?>">
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
            <h3 id="modalTitle">Novo Servidor</h3>
            <form method="POST">
                <input type="hidden" name="action" id="formAction" value="create">
                <input type="hidden" name="id" id="formId" value="">

                <div class="form-group">
                    <div>
                        <label>Nome do Servidor *</label>
                        <input type="text" name="name" id="name" required>
                    </div>
                    <div>
                        <label>Server ID *</label>
                        <input type="number" name="server_id" id="server_id" required>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Categoria *</label>
                        <select name="category" id="category" required>
                            <option value="rp">RP</option>
                            <option value="dm">DM</option>
                            <option value="dayz">DayZ</option>
                        </select>
                    </div>
                    <div>
                        <label>IP do Servidor *</label>
                        <input type="text" name="ip" id="ip" required>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Porta *</label>
                        <input type="number" name="port" id="port" value="7777" required>
                    </div>
                    <div>
                        <label>Máximo de Jogadores *</label>
                        <input type="number" name="max_players" id="max_players" value="100" required>
                    </div>
                </div>

                <div class="form-group">
                    <div>
                        <label>Discord (Link)</label>
                        <input type="text" name="discord" id="discord" placeholder="https://discord.gg/...">
                    </div>
                    <div>
                        <label>Ordem de Exibição</label>
                        <input type="number" name="order" id="order" value="0">
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
            document.getElementById('modalTitle').textContent = 'Novo Servidor';
            document.getElementById('formAction').value = 'create';
            document.getElementById('formId').value = '';
            document.getElementById('name').value = '';
            document.getElementById('server_id').value = '';
            document.getElementById('category').value = 'rp';
            document.getElementById('ip').value = '';
            document.getElementById('port').value = '7777';
            document.getElementById('max_players').value = '100';
            document.getElementById('discord').value = '';
            document.getElementById('order').value = '0';
            document.getElementById('active').checked = true;
            document.getElementById('formModal').classList.add('active');
        }

        function openEditModal(server) {
            document.getElementById('modalTitle').textContent = 'Editar Servidor';
            document.getElementById('formAction').value = 'update';
            document.getElementById('formId').value = server.id;
            document.getElementById('name').value = server.name;
            document.getElementById('server_id').value = server.server_id;
            document.getElementById('category').value = server.category;
            document.getElementById('ip').value = server.ip;
            document.getElementById('port').value = server.port;
            document.getElementById('max_players').value = server.max_players;
            document.getElementById('discord').value = server.discord || '';
            document.getElementById('order').value = server.order;
            document.getElementById('active').checked = server.active == 1;
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
