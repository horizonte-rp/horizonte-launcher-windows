<?php
/**
 * Painel Admin - Gerenciar Banimentos de HWID
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
            // Verificar se HWID já está banido (ativo)
            $checkStmt = $pdo->prepare("
                SELECT id FROM hwid_bans
                WHERE hwid = ? AND (expires_at IS NULL OR expires_at > NOW())
            ");
            $checkStmt->execute([$_POST['hwid']]);
            if ($checkStmt->fetch()) {
                $message = 'Este HWID já está banido!';
                $messageType = 'error';
            } else {
                $expiresAt = !empty($_POST['expires_at']) ? $_POST['expires_at'] : null;

                $stmt = $pdo->prepare("
                    INSERT INTO hwid_bans (hwid, reason, banned_by, created_at, expires_at)
                    VALUES (?, ?, ?, NOW(), ?)
                ");
                $stmt->execute([
                    $_POST['hwid'],
                    $_POST['reason'],
                    $_POST['banned_by'],
                    $expiresAt
                ]);
                $message = 'HWID banido com sucesso!';
                $messageType = 'success';
            }
        } catch (Exception $e) {
            $message = 'Erro ao banir HWID: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'update') {
        try {
            $expiresAt = !empty($_POST['expires_at']) ? $_POST['expires_at'] : null;

            $stmt = $pdo->prepare("
                UPDATE hwid_bans
                SET reason = ?, banned_by = ?, expires_at = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $_POST['reason'],
                $_POST['banned_by'],
                $expiresAt,
                $_POST['id']
            ]);
            $message = 'Banimento atualizado com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao atualizar banimento: ' . $e->getMessage();
            $messageType = 'error';
        }
    } elseif ($action === 'delete') {
        try {
            $stmt = $pdo->prepare("DELETE FROM hwid_bans WHERE id = ?");
            $stmt->execute([$_POST['id']]);
            $message = 'Banimento removido com sucesso!';
            $messageType = 'success';
        } catch (Exception $e) {
            $message = 'Erro ao remover banimento: ' . $e->getMessage();
            $messageType = 'error';
        }
    }
}

// Buscar todos os banimentos
try {
    $bans = $pdo->query("
        SELECT * FROM hwid_bans
        ORDER BY created_at DESC
    ")->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    die('Erro ao buscar banimentos: ' . $e->getMessage() . '<br><br>Execute o arquivo database/schema.sql no MySQL para criar as tabelas.');
}

// Estatísticas
$totalBans = count($bans);
$activeBans = count(array_filter($bans, fn($b) => !$b['expires_at'] || strtotime($b['expires_at']) > time()));
$permanentBans = count(array_filter($bans, fn($b) => !$b['expires_at']));
$expiredBans = count(array_filter($bans, fn($b) => $b['expires_at'] && strtotime($b['expires_at']) < time()));

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Banimentos HWID - Painel Admin</title>
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
            min-width: 1000px;
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

        .badge-success {
            background: #2ecc71;
            color: white;
        }

        .badge-danger {
            background: #e74c3c;
            color: white;
        }

        .badge-warning {
            background: #f39c12;
            color: white;
        }

        .badge-info {
            background: #3498db;
            color: white;
        }

        .hwid-text {
            font-family: monospace;
            font-size: 12px;
            color: #666;
            word-break: break-all;
        }

        .hwid-container {
            display: flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
        }

        .hwid-input {
            font-family: monospace;
            font-size: 11px;
            padding: 4px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #f9f9f9;
            color: #333;
            width: 200px;
            cursor: text;
        }

        .hwid-input:focus {
            outline: none;
            border-color: #667eea;
            background: white;
        }

        .copy-btn {
            background: transparent;
            border: none;
            padding: 4px;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.5;
            display: flex;
            align-items: center;
        }

        .copy-btn:hover {
            opacity: 1;
        }

        .copy-btn svg {
            width: 16px;
            height: 16px;
            fill: #666;
            transition: fill 0.2s;
        }

        .copy-btn:hover svg {
            fill: #333;
        }

        .copy-btn.copied svg {
            fill: #4CAF50;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group.full {
            grid-column: 1 / -1;
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
            flex-wrap: wrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🚫 Banimentos de HWID</h1>
            <a href="index.php" class="btn btn-primary">← Voltar</a>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="bans.php" class="active">🚫 Banimentos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
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
                <div class="value"><?= $totalBans ?></div>
            </div>
            <div class="stat-card">
                <h3>Ativos</h3>
                <div class="value"><?= $activeBans ?></div>
            </div>
            <div class="stat-card">
                <h3>Permanentes</h3>
                <div class="value"><?= $permanentBans ?></div>
            </div>
            <div class="stat-card">
                <h3>Expirados</h3>
                <div class="value"><?= $expiredBans ?></div>
            </div>
        </div>

        <div class="content-card">
            <h2>Todos os Banimentos</h2>
            <button class="btn btn-primary" onclick="openAddModal()">+ Novo Banimento</button>

            <div style="margin: 20px 0;">
                <input
                    type="text"
                    id="searchInput"
                    placeholder="🔍 Buscar por HWID, motivo, admin..."
                    style="width: 100%; padding: 12px 20px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;"
                    onkeyup="filterBans()"
                >
            </div>

            <?php if (empty($bans)): ?>
                <p style="text-align: center; color: #999; padding: 40px; margin-top: 20px;">
                    Nenhum banimento registrado
                </p>
            <?php else: ?>
                <table style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>HWID</th>
                            <th>Motivo</th>
                            <th>Banido por</th>
                            <th>Data do Ban</th>
                            <th>Expira em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($bans as $ban): ?>
                            <tr>
                                <td>
                                    <div class="hwid-container">
                                        <input type="text" class="hwid-input" value="<?= htmlspecialchars($ban['hwid']) ?>" readonly>
                                        <button class="copy-btn" onclick="copyHWID(this)" title="Copiar HWID">
                                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                                <td style="max-width: 300px;"><?= htmlspecialchars($ban['reason']) ?></td>
                                <td><?= htmlspecialchars($ban['banned_by']) ?></td>
                                <td><?= date('d/m/Y H:i', strtotime($ban['created_at'])) ?></td>
                                <td>
                                    <?php if ($ban['expires_at']): ?>
                                        <?php
                                        $isExpired = strtotime($ban['expires_at']) < time();
                                        $isActive = !$isExpired;
                                        $badgeClass = $isActive ? 'badge-warning' : 'badge-danger';
                                        ?>
                                        <span class="badge <?= $badgeClass ?>">
                                            <?= date('d/m/Y H:i', strtotime($ban['expires_at'])) ?>
                                            <?= $isExpired ? ' (EXPIRADO)' : '' ?>
                                        </span>
                                    <?php else: ?>
                                        <span class="badge badge-danger">PERMANENTE</span>
                                    <?php endif; ?>
                                </td>
                                <td class="actions-cell">
                                    <button class="btn btn-warning" onclick="openEditModal(<?= htmlspecialchars(json_encode($ban)) ?>)">Editar</button>
                                    <form method="POST" style="display:inline;" onsubmit="return confirm('Tem certeza que deseja remover este banimento?');">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= $ban['id'] ?>">
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
            <h3 id="modalTitle">Novo Banimento</h3>
            <form method="POST">
                <input type="hidden" name="action" id="formAction" value="create">
                <input type="hidden" name="id" id="formId" value="">

                <div class="form-group">
                    <label>HWID *</label>
                    <input type="text" name="hwid" id="hwid" required placeholder="Copie o HWID completo da página de dispositivos">
                </div>

                <div class="form-group">
                    <label>Motivo do Banimento *</label>
                    <textarea name="reason" id="reason" rows="3" required placeholder="Ex: Uso de hacks, multicontas, etc."></textarea>
                </div>

                <div class="form-group">
                    <label>Banido por (Admin) *</label>
                    <input type="text" name="banned_by" id="banned_by" required value="<?= htmlspecialchars($_SESSION['admin_username'] ?? 'Admin') ?>">
                </div>

                <div class="form-group">
                    <label>Data de Expiração (deixe vazio para permanente)</label>
                    <input type="datetime-local" name="expires_at" id="expires_at">
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
            document.getElementById('modalTitle').textContent = 'Novo Banimento';
            document.getElementById('formAction').value = 'create';
            document.getElementById('formId').value = '';
            document.getElementById('hwid').value = '';
            document.getElementById('hwid').readOnly = false;
            document.getElementById('reason').value = '';
            document.getElementById('banned_by').value = '<?= htmlspecialchars($_SESSION['admin_username'] ?? 'Admin') ?>';
            document.getElementById('expires_at').value = '';
            document.getElementById('formModal').classList.add('active');
        }

        function openEditModal(ban) {
            document.getElementById('modalTitle').textContent = 'Editar Banimento';
            document.getElementById('formAction').value = 'update';
            document.getElementById('formId').value = ban.id;
            document.getElementById('hwid').value = ban.hwid;
            document.getElementById('hwid').readOnly = true;
            document.getElementById('reason').value = ban.reason;
            document.getElementById('banned_by').value = ban.banned_by;

            // Formatar data para datetime-local
            if (ban.expires_at) {
                const date = new Date(ban.expires_at);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                document.getElementById('expires_at').value = `${year}-${month}-${day}T${hours}:${minutes}`;
            } else {
                document.getElementById('expires_at').value = '';
            }

            document.getElementById('formModal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('formModal').classList.remove('active');
        }

        function filterBans() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const table = document.querySelector('table tbody');
            const rows = table.getElementsByTagName('tr');

            for (let row of rows) {
                // Pegar HWID completo do input
                const hwidInput = row.cells[0].querySelector('.hwid-input');
                const hwid = hwidInput ? hwidInput.value.toLowerCase() : '';
                const reason = row.cells[1].textContent.toLowerCase();
                const bannedBy = row.cells[2].textContent.toLowerCase();

                const found = hwid.includes(searchTerm) ||
                             reason.includes(searchTerm) ||
                             bannedBy.includes(searchTerm);

                row.style.display = found ? '' : 'none';
            }
        }

        // Função para copiar HWID
        function copyHWID(button) {
            const input = button.previousElementSibling;
            const hwid = input.value;

            // Selecionar o texto
            input.select();
            input.setSelectionRange(0, 99999); // Para mobile

            // Tentar copiar
            let success = false;
            try {
                // Método antigo (mais compatível)
                success = document.execCommand('copy');
            } catch (err) {
                success = false;
            }

            if (success) {
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                    input.blur();
                }, 1500);
            } else {
                // Fallback: tentar Clipboard API
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(hwid).then(() => {
                        button.classList.add('copied');
                        setTimeout(() => {
                            button.classList.remove('copied');
                            input.blur();
                        }, 1500);
                    }).catch(err => {
                        alert('Erro ao copiar: ' + err);
                    });
                } else {
                    alert('Seu navegador não suporta cópia automática');
                }
            }
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
