<?php
/**
 * Painel Admin - Visualizar Dispositivos
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

// Buscar dispositivos ordenados por last_seen DESC
$devices = $pdo->query("
    SELECT
        id,
        username,
        hwid,
        manufacturer,
        is_vm,
        ip_address,
        created_at,
        last_seen
    FROM player_devices
    ORDER BY last_seen DESC
    LIMIT 500
")->fetchAll(PDO::FETCH_ASSOC);

// Estatísticas
$totalDevices = count($devices);
$vmDevices = count(array_filter($devices, fn($d) => $d['is_vm']));
$activeDevices = count(array_filter($devices, fn($d) => $d['last_seen'] && strtotime($d['last_seen']) > strtotime('-24 hours')));

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dispositivos - Painel Admin</title>
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

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        .stat-card h3 {
            color: #666;
            font-size: 13px;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .stat-card .value {
            font-size: 32px;
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

        .hwid-short {
            font-family: monospace;
            font-size: 12px;
            color: #666;
            cursor: help;
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
            width: 180px;
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

        .refresh-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #667eea;
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
        }

        .refresh-btn:hover {
            background: #5568d3;
            transform: scale(1.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>💻 Dispositivos do Launcher</h1>
            <a href="index.php" class="btn btn-primary">← Voltar</a>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php" class="active">💻 Dispositivos</a></li>
                <li><a href="bans.php">🚫 Banimentos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
            </ul>
        </nav>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total de Dispositivos</h3>
                <div class="value"><?= $totalDevices ?></div>
            </div>

            <div class="stat-card">
                <h3>Dispositivos Ativos (24h)</h3>
                <div class="value"><?= $activeDevices ?></div>
            </div>

            <div class="stat-card">
                <h3>VMs Detectadas</h3>
                <div class="value"><?= $vmDevices ?></div>
            </div>
        </div>

        <div class="content-card">
            <h2>Todos os Dispositivos Registrados</h2>

            <div style="margin-bottom: 20px;">
                <input
                    type="text"
                    id="searchInput"
                    placeholder="🔍 Buscar por usuário, HWID, fabricante, IP..."
                    style="width: 100%; padding: 12px 20px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; transition: all 0.3s ease;"
                    onkeyup="filterDevices()"
                    onfocus="this.style.borderColor='#667eea'"
                    onblur="this.style.borderColor='#ddd'"
                >
                <p id="searchResults" style="margin-top: 10px; color: #666; font-size: 13px;"></p>
            </div>

            <?php if (empty($devices)): ?>
                <p style="text-align: center; color: #999; padding: 40px;">
                    Nenhum dispositivo registrado ainda
                </p>
            <?php else: ?>
                <table>
                    <thead>
                        <tr>
                            <th>Usuário</th>
                            <th>HWID</th>
                            <th>Fabricante</th>
                            <th>VM</th>
                            <th>IP Address</th>
                            <th>Registrado em</th>
                            <th>Último Acesso</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($devices as $device): ?>
                            <tr>
                                <td><strong><?= htmlspecialchars($device['username']) ?></strong></td>
                                <td>
                                    <div class="hwid-container">
                                        <input type="text" class="hwid-input" value="<?= htmlspecialchars($device['hwid']) ?>" readonly>
                                        <button class="copy-btn" onclick="copyHWID(this)" title="Copiar HWID">
                                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                                <td><?= htmlspecialchars($device['manufacturer'] ?? 'N/A') ?></td>
                                <td>
                                    <?php if ($device['is_vm']): ?>
                                        <span class="badge badge-danger">VM</span>
                                    <?php else: ?>
                                        <span class="badge badge-success">Não</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="hwid-short" title="<?= htmlspecialchars($device['ip_address'] ?? 'N/A') ?>">
                                        <?= htmlspecialchars($device['ip_address'] ?? 'N/A') ?>
                                    </span>
                                </td>
                                <td><?= date('d/m/Y H:i', strtotime($device['created_at'])) ?></td>
                                <td>
                                    <?php if ($device['last_seen']): ?>
                                        <span class="<?= strtotime($device['last_seen']) > strtotime('-24 hours') ? 'badge-success' : 'badge-warning' ?>">
                                            <?= date('d/m/Y H:i', strtotime($device['last_seen'])) ?>
                                        </span>
                                    <?php else: ?>
                                        <span class="badge badge-warning">N/A</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
    </div>

    <button class="refresh-btn" onclick="location.reload()" title="Atualizar">↻</button>

    <script>
        // Função de busca/filtro
        function filterDevices() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const table = document.querySelector('table tbody');
            const rows = table.getElementsByTagName('tr');
            let visibleCount = 0;

            for (let row of rows) {
                const username = row.cells[0].textContent.toLowerCase();
                // Pegar HWID completo do input
                const hwidInput = row.cells[1].querySelector('.hwid-input');
                const hwid = hwidInput ? hwidInput.value.toLowerCase() : '';
                const manufacturer = row.cells[2].textContent.toLowerCase();
                const vm = row.cells[3].textContent.toLowerCase();
                const ip = row.cells[4].textContent.toLowerCase();
                const registeredAt = row.cells[5].textContent.toLowerCase();
                const lastSeen = row.cells[6].textContent.toLowerCase();

                // Busca em todos os campos
                const found = username.includes(searchTerm) ||
                             hwid.includes(searchTerm) ||
                             manufacturer.includes(searchTerm) ||
                             vm.includes(searchTerm) ||
                             ip.includes(searchTerm) ||
                             registeredAt.includes(searchTerm) ||
                             lastSeen.includes(searchTerm);

                if (found) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            }

            // Atualizar contador de resultados
            const resultsText = document.getElementById('searchResults');
            if (searchTerm) {
                resultsText.textContent = `Mostrando ${visibleCount} de <?= count($devices) ?> dispositivos`;
            } else {
                resultsText.textContent = '';
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

        // Auto-refresh a cada 60 segundos
        setTimeout(() => location.reload(), 60000);
    </script>
</body>
</html>
