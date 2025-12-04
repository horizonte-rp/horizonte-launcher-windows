<?php
/**
 * Painel Admin - Dashboard Principal
 * Sistema de gerenciamento do Horizonte Launcher
 */

session_start();

// Autenticação simples (você pode melhorar isso)
$ADMIN_USERNAME = 'admin';
$ADMIN_PASSWORD = '@horizonte@rp@'; // ALTERE ESTA SENHA!

// IMPORTANTE: Substitua pela sua chave secreta do Google reCAPTCHA
// Obtenha suas chaves em: https://www.google.com/recaptcha/admin
$RECAPTCHA_SECRET_KEY = '6LcZbiAsAAAAAAeEOA46QOGdsdNUDpBUiE93ehjZ';

/**
 * Verifica o reCAPTCHA v2
 * @param string $response - Token do reCAPTCHA
 * @param string $secretKey - Chave secreta do reCAPTCHA
 * @return bool - true se válido, false se inválido
 */
function verifyCaptcha($response, $secretKey) {
    if (empty($response)) {
        return false;
    }

    $verifyURL = 'https://www.google.com/recaptcha/api/siteverify';
    $data = [
        'secret' => $secretKey,
        'response' => $response,
        'remoteip' => $_SERVER['REMOTE_ADDR']
    ];

    $options = [
        'http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/x-www-form-urlencoded',
            'content' => http_build_query($data),
            'timeout' => 10
        ]
    ];

    $context = stream_context_create($options);
    $result = @file_get_contents($verifyURL, false, $context);

    if ($result === false) {
        error_log('reCAPTCHA: Erro ao conectar com Google API');
        return false;
    }

    $json = json_decode($result, true);
    return isset($json['success']) && $json['success'] === true;
}

// Verificar login
if (!isset($_SESSION['admin_logged_in'])) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
        // Verificar CAPTCHA primeiro
        $captchaResponse = $_POST['g-recaptcha-response'] ?? '';

        if (!verifyCaptcha($captchaResponse, $RECAPTCHA_SECRET_KEY)) {
            $login_error = 'Por favor, complete a verificação CAPTCHA';
        } elseif ($_POST['username'] === $ADMIN_USERNAME && $_POST['password'] === $ADMIN_PASSWORD) {
            $_SESSION['admin_logged_in'] = true;
            $_SESSION['admin_username'] = $ADMIN_USERNAME;
            header('Location: index.php');
            exit;
        } else {
            $login_error = 'Usuário ou senha incorretos';
        }
    }

    // Mostrar página de login
    include __DIR__ . '/login.php';
    exit;
}

// Usuário logado - continuar com dashboard
require_once __DIR__ . '/../config/db.php';
$pdo = getDB();

if (!$pdo) {
    die('Erro: Não foi possível conectar ao banco de dados.');
}

// Buscar estatísticas
try {
    // Sessões ativas (últimos 5 minutos)
    $activeSessions = $pdo->query("
        SELECT COUNT(*) as count
        FROM launcher_sessions
        WHERE last_heartbeat >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Total de dispositivos registrados
    $totalDevices = $pdo->query("SELECT COUNT(*) as count FROM player_devices")->fetch(PDO::FETCH_ASSOC)['count'];

    // Notificações ativas
    $activeNotifications = $pdo->query("
        SELECT COUNT(*) as count
        FROM notifications
        WHERE active = 1
          AND start_date <= NOW()
          AND (end_date IS NULL OR end_date >= NOW())
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Notificações enviadas hoje
    $notificationsSentToday = $pdo->query("
        SELECT COUNT(*) as count
        FROM notification_deliveries
        WHERE DATE(delivered_at) = CURDATE()
    ")->fetch(PDO::FETCH_ASSOC)['count'];

    // Sessões por versão do launcher
    $sessionsByVersion = $pdo->query("
        SELECT launcher_version, COUNT(*) as count
        FROM launcher_sessions
        WHERE last_heartbeat >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY launcher_version
        ORDER BY count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    // VMs detectadas (últimas 24h)
    $vmsDetected = $pdo->query("
        SELECT COUNT(*) as count
        FROM launcher_sessions
        WHERE is_vm = 1
          AND last_heartbeat >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ")->fetch(PDO::FETCH_ASSOC)['count'];

} catch (Exception $e) {
    $stats_error = 'Erro ao buscar estatísticas: ' . $e->getMessage();
}

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Admin - Horizonte Launcher</title>
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

        .user-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .user-info span {
            color: #666;
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
            transform: translateY(-2px);
        }

        .btn-danger {
            background: #e74c3c;
            color: white;
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
            transform: translateY(-2px);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        .stat-card h3 {
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .stat-card .value {
            font-size: 36px;
            font-weight: 700;
            color: #667eea;
        }

        .stat-card .label {
            color: #999;
            font-size: 12px;
            margin-top: 5px;
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

        table {
            width: 100%;
            border-collapse: collapse;
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
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎮 Horizonte Launcher - Painel Admin</h1>
            <div class="user-info">
                <span>Olá, <strong><?= htmlspecialchars($_SESSION['admin_username']) ?></strong></span>
                <a href="logout.php" class="btn btn-danger">Sair</a>
            </div>
        </header>

        <nav>
            <ul>
                <li><a href="index.php" class="active">📊 Dashboard</a></li>
                <li><a href="notifications.php">📢 Notificações</a></li>
                <li><a href="sessions.php">👥 Sessões Ativas</a></li>
                <li><a href="devices.php">💻 Dispositivos</a></li>
                <li><a href="bans.php">🚫 Banimentos</a></li>
                <li><a href="servers.php">🎮 Servidores</a></li>
                <li><a href="mods.php">📦 Mods</a></li>
                <li><a href="news.php">📰 Notícias</a></li>
            </ul>
        </nav>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Sessões Ativas</h3>
                <div class="value"><?= $activeSessions ?? 0 ?></div>
                <div class="label">Últimos 5 minutos</div>
            </div>

            <div class="stat-card">
                <h3>Dispositivos Registrados</h3>
                <div class="value"><?= $totalDevices ?? 0 ?></div>
                <div class="label">Total</div>
            </div>

            <div class="stat-card">
                <h3>Notificações Ativas</h3>
                <div class="value"><?= $activeNotifications ?? 0 ?></div>
                <div class="label">Em andamento</div>
            </div>

            <div class="stat-card">
                <h3>Notificações Enviadas</h3>
                <div class="value"><?= $notificationsSentToday ?? 0 ?></div>
                <div class="label">Hoje</div>
            </div>

            <div class="stat-card">
                <h3>VMs Detectadas</h3>
                <div class="value"><?= $vmsDetected ?? 0 ?></div>
                <div class="label">Últimas 24h</div>
            </div>
        </div>

        <div class="content-card">
            <h2>📊 Versões do Launcher (24h)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Versão</th>
                        <th>Sessões</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!empty($sessionsByVersion)): ?>
                        <?php foreach ($sessionsByVersion as $version): ?>
                            <tr>
                                <td><strong>v<?= htmlspecialchars($version['launcher_version']) ?></strong></td>
                                <td><?= $version['count'] ?></td>
                                <td>
                                    <?php if ($version['launcher_version'] === '1.1.3'): ?>
                                        <span class="badge badge-success">Atual</span>
                                    <?php else: ?>
                                        <span class="badge badge-warning">Antiga</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <tr>
                            <td colspan="3" style="text-align: center; color: #999;">Nenhum dado disponível</td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <?php if (isset($stats_error)): ?>
            <div class="content-card" style="border-left: 4px solid #e74c3c;">
                <p style="color: #e74c3c;"><strong>Erro:</strong> <?= htmlspecialchars($stats_error) ?></p>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
