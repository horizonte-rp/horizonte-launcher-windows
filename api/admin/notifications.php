<?php
/**
 * Painel Admin - Gerenciamento de Notificações
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

$success_message = null;
$error_message = null;

// Processar ações
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (isset($_POST['action'])) {
            switch ($_POST['action']) {
                case 'create':
                    $targetHwids = null;
                    if ($_POST['target_type'] === 'specific_hwid' && !empty($_POST['target_hwids'])) {
                        $hwids = array_map('trim', explode(',', $_POST['target_hwids']));
                        $targetHwids = json_encode($hwids);
                    }

                    $actionType = $_POST['action_type'] ?? 'none';
                    $actionValue = ($actionType !== 'none' && !empty($_POST['action_value'])) ? $_POST['action_value'] : null;

                    $stmt = $pdo->prepare("
                        INSERT INTO notifications (
                            title, body, icon, silent, action_type, action_value,
                            target_type, target_hwids, start_date, end_date, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");

                    $stmt->execute([
                        $_POST['title'],
                        $_POST['body'],
                        $_POST['icon'] ?? null,
                        isset($_POST['silent']) ? 1 : 0,
                        $actionType,
                        $actionValue,
                        $_POST['target_type'],
                        $targetHwids,
                        $_POST['start_date'],
                        !empty($_POST['end_date']) ? $_POST['end_date'] : null,
                        $_SESSION['admin_username']
                    ]);

                    $success_message = 'Notificação criada com sucesso!';
                    break;

                case 'toggle_active':
                    $stmt = $pdo->prepare("UPDATE notifications SET active = NOT active WHERE id = ?");
                    $stmt->execute([$_POST['notification_id']]);
                    $success_message = 'Status da notificação alterado!';
                    break;

                case 'delete':
                    $stmt = $pdo->prepare("DELETE FROM notifications WHERE id = ?");
                    $stmt->execute([$_POST['notification_id']]);
                    $success_message = 'Notificação excluída!';
                    break;
            }
        }
    } catch (Exception $e) {
        $error_message = 'Erro: ' . $e->getMessage();
    }
}

// Buscar notificações
$notifications = $pdo->query("
    SELECT
        n.*,
        (SELECT COUNT(*) FROM notification_deliveries WHERE notification_id = n.id) as deliveries_count
    FROM notifications n
    ORDER BY n.created_at DESC
")->fetchAll(PDO::FETCH_ASSOC);

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gerenciar Notificações - Painel Admin</title>
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
            max-width: 1400px;
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
        }

        .btn-success:hover {
            background: #27ae60;
        }

        .btn-danger {
            background: #e74c3c;
            color: white;
        }

        .btn-danger:hover {
            background: #c0392b;
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }

        nav {
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
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
        }

        nav a:hover, nav a.active {
            background: #667eea;
            color: white;
        }

        .content-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
        }

        .content-card h2 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 24px;
        }

        .alert {
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border-left: 4px solid #28a745;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border-left: 4px solid #dc3545;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 100px;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            outline: none;
            border-color: #667eea;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        table th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #667eea;
            border-bottom: 2px solid #667eea;
        }

        table td {
            padding: 12px;
            border-bottom: 1px solid #eee;
        }

        table tr:hover {
            background: #f8f9fa;
        }

        .badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .badge-success {
            background: #2ecc71;
            color: white;
        }

        .badge-warning {
            background: #f39c12;
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
            max-height: 90vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .modal-header h3 {
            color: #667eea;
            font-size: 22px;
        }

        .close-modal {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
        }

        .close-modal:hover {
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📢 Gerenciar Notificações</h1>
            <div>
                <button onclick="openModal()" class="btn btn-success">+ Nova Notificação</button>
                <a href="index.php" class="btn btn-primary">← Voltar</a>
            </div>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php" class="active">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
                <li><a href="logout.php">🚪 Sair</a></li>
            </ul>
        </nav>

        <?php if ($success_message): ?>
            <div class="alert alert-success"><?= htmlspecialchars($success_message) ?></div>
        <?php endif; ?>

        <?php if ($error_message): ?>
            <div class="alert alert-error"><?= htmlspecialchars($error_message) ?></div>
        <?php endif; ?>

        <div class="content-card">
            <h2>Notificações Criadas</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Título</th>
                        <th>Alvo</th>
                        <th>Período</th>
                        <th>Entregas</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($notifications as $notif): ?>
                        <tr>
                            <td>#<?= $notif['id'] ?></td>
                            <td><strong><?= htmlspecialchars($notif['title']) ?></strong></td>
                            <td>
                                <?php if ($notif['target_type'] === 'all'): ?>
                                    <span class="badge badge-info">Todos</span>
                                <?php else: ?>
                                    <span class="badge badge-warning">Específico</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?= date('d/m H:i', strtotime($notif['start_date'])) ?><br>
                                <small>até <?= $notif['end_date'] ? date('d/m H:i', strtotime($notif['end_date'])) : 'Indefinido' ?></small>
                            </td>
                            <td><?= $notif['deliveries_count'] ?></td>
                            <td>
                                <?php if ($notif['active']): ?>
                                    <span class="badge badge-success">Ativa</span>
                                <?php else: ?>
                                    <span class="badge badge-danger">Inativa</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <form method="POST" style="display: inline;">
                                    <input type="hidden" name="action" value="toggle_active">
                                    <input type="hidden" name="notification_id" value="<?= $notif['id'] ?>">
                                    <button type="submit" class="btn btn-primary btn-sm">
                                        <?= $notif['active'] ? 'Desativar' : 'Ativar' ?>
                                    </button>
                                </form>
                                <form method="POST" style="display: inline;" onsubmit="return confirm('Tem certeza?')">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="notification_id" value="<?= $notif['id'] ?>">
                                    <button type="submit" class="btn btn-danger btn-sm">Excluir</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Modal de criar notificação -->
    <div id="createModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Criar Nova Notificação</h3>
                <button class="close-modal" onclick="closeModal()">×</button>
            </div>

            <form method="POST">
                <input type="hidden" name="action" value="create">

                <div class="form-group">
                    <label for="title">Título *</label>
                    <input type="text" id="title" name="title" required placeholder="Ex: X4 PAYDAY!">
                </div>

                <div class="form-group">
                    <label for="body">Mensagem *</label>
                    <textarea id="body" name="body" required placeholder="Digite a mensagem da notificação..."></textarea>
                </div>

                <div class="form-group">
                    <label for="icon">URL do Ícone (opcional)</label>
                    <input type="url" id="icon" name="icon" placeholder="https://exemplo.com/icone.png">
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="silent" name="silent">
                    <label for="silent">Notificação silenciosa (sem som)</label>
                </div>

                <div class="form-group">
                    <label for="target_type">Público Alvo *</label>
                    <select id="target_type" name="target_type" required onchange="toggleTargetHwids()">
                        <option value="all">Todos os jogadores</option>
                        <option value="specific_hwid">HWIDs específicos</option>
                    </select>
                </div>

                <div class="form-group" id="target_hwids_group" style="display: none;">
                    <label for="target_hwids">HWIDs (separados por vírgula)</label>
                    <input type="text" id="target_hwids" name="target_hwids" placeholder="hwid1, hwid2, hwid3">
                </div>

                <div class="form-group">
                    <label for="action_type">Ação ao Clicar</label>
                    <select id="action_type" name="action_type" onchange="toggleActionValue()">
                        <option value="none">Nenhuma</option>
                        <option value="open_url">Abrir URL</option>
                        <option value="navigate">Navegar no Launcher</option>
                        <option value="play">Iniciar Jogo</option>
                    </select>
                </div>

                <div class="form-group" id="action_value_group" style="display: none;">
                    <label for="action_value">Valor da Ação</label>
                    <input type="text" id="action_value" name="action_value" placeholder="URL, página ou serverId">
                </div>

                <div class="form-group">
                    <label for="start_date">Data/Hora Início *</label>
                    <input type="datetime-local" id="start_date" name="start_date" required>
                </div>

                <div class="form-group">
                    <label for="end_date">Data/Hora Fim (opcional)</label>
                    <input type="datetime-local" id="end_date" name="end_date">
                </div>

                <button type="submit" class="btn btn-success" style="width: 100%;">Criar Notificação</button>
            </form>
        </div>
    </div>

    <script>
        function openModal() {
            document.getElementById('createModal').classList.add('active');
            // Definir data/hora atual como padrão
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('start_date').value = now.toISOString().slice(0, 16);
        }

        function closeModal() {
            document.getElementById('createModal').classList.remove('active');
        }

        function toggleTargetHwids() {
            const targetType = document.getElementById('target_type').value;
            const hwidsGroup = document.getElementById('target_hwids_group');
            hwidsGroup.style.display = targetType === 'specific_hwid' ? 'block' : 'none';
        }

        function toggleActionValue() {
            const actionType = document.getElementById('action_type').value;
            const valueGroup = document.getElementById('action_value_group');
            valueGroup.style.display = actionType !== 'none' ? 'block' : 'none';
        }

        // Fechar modal ao clicar fora
        document.getElementById('createModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    </script>
</body>
</html>
