<?php
/**
 * Painel Admin - Visualizar Sessões Ativas
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

// Buscar sessões ativas (últimos 10 minutos)
$sessions = $pdo->query("
    SELECT
        s.*,
        TIMESTAMPDIFF(SECOND, s.last_heartbeat, NOW()) AS seconds_since_heartbeat,
        TIMESTAMPDIFF(MINUTE, s.first_seen, NOW()) AS session_duration_minutes
    FROM launcher_sessions s
    WHERE s.last_heartbeat >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    ORDER BY s.last_heartbeat DESC
")->fetchAll(PDO::FETCH_ASSOC);

// Estatísticas
$totalSessions = count($sessions);
$activeSessions = count(array_filter($sessions, fn($s) => $s['seconds_since_heartbeat'] <= 300)); // 5 min
$vmSessions = count(array_filter($sessions, fn($s) => $s['is_vm']));

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sessões Ativas - Painel Admin</title>
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

        .badge-warning {
            background: #f39c12;
            color: white;
        }

        .badge-danger {
            background: #e74c3c;
            color: white;
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

        .hwid-short {
            font-family: monospace;
            font-size: 12px;
            color: #666;
        }

        .vm-indicator {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>👥 Sessões Ativas do Launcher</h1>
            <a href="index.php" class="btn btn-primary">← Voltar</a>
        </header>

        <nav>
            <ul>
                <li><a href="index.php">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php" class="active">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
                <li><a href="logout.php">🚪 Sair</a></li>
            </ul>
        </nav>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total de Sessões</h3>
                <div class="value"><?= $totalSessions ?></div>
            </div>

            <div class="stat-card">
                <h3>Sessões Ativas</h3>
                <div class="value"><?= $activeSessions ?></div>
            </div>

            <div class="stat-card">
                <h3>VMs Detectadas</h3>
                <div class="value"><?= $vmSessions ?></div>
            </div>
        </div>

        <div class="content-card">
            <h2>Sessões Online (Últimos 10 minutos)</h2>

            <?php if (empty($sessions)): ?>
                <p style="text-align: center; color: #999; padding: 40px;">
                    Nenhuma sessão ativa no momento
                </p>
            <?php else: ?>
                <table>
                    <thead>
                        <tr>
                            <th>Session ID</th>
                            <th>HWID</th>
                            <th>Fabricante</th>
                            <th>Versão</th>
                            <th>Plataforma</th>
                            <th>VM</th>
                            <th>Início</th>
                            <th>Duração</th>
                            <th>Último Ping</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($sessions as $session): ?>
                            <tr>
                                <td>
                                    <span class="hwid-short" title="<?= htmlspecialchars($session['session_id']) ?>">
                                        <?= substr($session['session_id'], 0, 12) ?>...
                                    </span>
                                </td>
                                <td>
                                    <span class="hwid-short" title="<?= htmlspecialchars($session['hwid']) ?>">
                                        <?= substr($session['hwid'], 0, 16) ?>...
                                    </span>
                                </td>
                                <td><?= htmlspecialchars($session['manufacturer'] ?? 'N/A') ?></td>
                                <td><strong>v<?= htmlspecialchars($session['launcher_version']) ?></strong></td>
                                <td><?= htmlspecialchars($session['platform']) ?> / <?= htmlspecialchars($session['arch']) ?></td>
                                <td>
                                    <?php if ($session['is_vm']): ?>
                                        <div class="vm-indicator">
                                            <span class="badge badge-danger">VM</span>
                                            <small>(<?= $session['vm_confidence'] ?>)</small>
                                        </div>
                                    <?php else: ?>
                                        <span class="badge badge-success">Não</span>
                                    <?php endif; ?>
                                </td>
                                <td><?= date('H:i:s', strtotime($session['first_seen'])) ?></td>
                                <td><?= $session['session_duration_minutes'] ?> min</td>
                                <td>
                                    <?php
                                    $seconds = $session['seconds_since_heartbeat'];
                                    if ($seconds < 60) {
                                        echo $seconds . 's atrás';
                                    } else {
                                        echo floor($seconds / 60) . 'm atrás';
                                    }
                                    ?>
                                </td>
                                <td>
                                    <?php if ($seconds <= 180): ?>
                                        <span class="badge badge-success">Online</span>
                                    <?php elseif ($seconds <= 300): ?>
                                        <span class="badge badge-warning">Idle</span>
                                    <?php else: ?>
                                        <span class="badge badge-danger">Offline</span>
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
        // Auto-refresh a cada 30 segundos
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
