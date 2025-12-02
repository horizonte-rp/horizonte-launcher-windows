<?php
/**
 * Horizonte Launcher API
 * Endpoint: /api/launcher/config.php
 *
 * Retorna configurações do launcher, notícias e informações de atualização
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Configuração do Launcher
$config = [
    // Versão atual do launcher (altere quando lançar nova versão)
    'version' => '1.1.1',

    // URL para download da nova versão (quando disponível)
    'updateUrl' => 'http://horizontegames.com/api/downloads/Horizonte%20Launcher.exe',

    // Forçar atualização? Se true, usuário não pode usar versão antiga
    'forceUpdate' => false,

    // Mensagem de manutenção (deixe vazio para desativar)
    'maintenance' => '',

    // URL da página "Jogar" (tenta abrir o launcher, se não tiver redireciona para download)
    'howToPlayUrl' => 'http://horizontegames.com/howtoplay.php',

    // URL da API de autenticação (HWID, tokens, bans)
    'authApiUrl' => 'http://horizontegames.com/api/auth',

    // Categorias de servidores
    'categories' => [
        'rp' => [
            'name' => 'Roleplay',
            'titleName' => 'HZ:RP',
            'folderName' => 'horizonte-rp',
            'color' => '#00a8ff',  // Cor principal da categoria (usada em botões, barras, etc)
            'banner' => 'http://horizontegames.com/api/assets/images/banner_rp.jpg?v=4',
            'download' => [
                'url' => 'https://horizonte-rp.com/assets/game.zip',
                'version' => '1.0.0',
                'size' => 1073741824  // ~1GB
            ],
            'servers' => [
                [
                    'id' => 0,
                    'name' => 'Localhost (Teste)',
                    'ip' => '127.0.0.1',
                    'port' => 7777,
                    'maxPlayers' => 100,
                    'discord' => ''
                ],
                [
                    'id' => 1,
                    'name' => 'Horizonte RP #1',
                    'ip' => '149.56.252.173',
                    'port' => 7777,
                    'maxPlayers' => 600,
                    'discord' => 'https://discord.com/invite/GmrQbRAvrP'
                ],
                [
                    'id' => 2,
                    'name' => 'Horizonte RP #2',
                    'ip' => '51.222.228.151',
                    'port' => 7777,
                    'maxPlayers' => 600,
                    'discord' => 'https://discord.gg/zb2RfgwKvJ'
                ],
                [
                    'id' => 3,
                    'name' => 'Horizonte RP #3',
                    'ip' => '54.39.38.150',
                    'port' => 7777,
                    'maxPlayers' => 600,
                    'discord' => 'https://discord.gg/wWpzCGwbve'
                ],
                [
                    'id' => 4,
                    'name' => 'Horizonte RP #4',
                    'ip' => '149.56.155.127',
                    'port' => 7777,
                    'maxPlayers' => 600,
                    'discord' => 'https://discord.gg/ApWCz9pqqa'
                ]
            ],
            'news' => [
                [
                    'id' => 1,
                    'title' => 'Natal chegando',
                    'image' => 'http://horizontegames.com/api/assets/images/news1.png?v=4',
                    'link' => 'https://horizonte-rp.com'
                ],
                [
                    'id' => 2,
                    'title' => 'Horizonte 3 Anos!',
                    'image' => 'http://horizontegames.com/api/assets/images/news2.png?v=4',
                    'link' => 'https://horizonte-rp.com'
                ],
                [
                    'id' => 3,
                    'title' => 'Natal chegando',
                    'image' => 'http://horizontegames.com/api/assets/images/news1.png?v=4',
                    'link' => 'https://horizonte-rp.com'
                ]
            ]
        ],
        'dm' => [
            'name' => 'DeathMatch',
            'titleName' => 'HZ:DM',
            'folderName' => 'horizonte-dm',
            'color' => '#ff6b35',  // Cor principal da categoria (usada em botões, barras, etc)
            'banner' => 'http://horizontegames.com/api/assets/images/banner_dm.jpg?v=4',
            'download' => [
                'url' => '',  // Vazio = download não disponível
                'version' => '',
                'size' => 0
            ],
            'servers' => [],
            'news' => []
        ],
        'dayz' => [
            'name' => 'DayZ',
            'titleName' => 'HZ:DAYZ',
            'folderName' => 'horizonte-dayz',
            'color' => '#4caf50',  // Cor principal da categoria (usada em botões, barras, etc)
            'banner' => 'http://horizontegames.com/api/assets/images/banner_dayz.jpg?v=4',
            'download' => [
                'url' => 'https://horizonte-rp.com/assets/game.zip',
                'version' => '1.0.0',
                'size' => 1073741824  // ~1GB
            ],
            'servers' => [],
            'news' => []
        ]
    ],

    // Links sociais
    'social' => [
        'site' => 'https://horizonte-rp.com',
        'youtube' => 'https://youtube.com/@horizonterp',
        'instagram' => 'https://instagram.com/horizontegamesrp',
        'tiktok' => 'https://tiktok.com/@horizontegamesrp',
        'whatsapp' => 'https://whatsapp.com/channel/0029VasuRhn0AgWD4qkkXp05',
        'discord' => 'https://discord.gg/hzrp'
    ],

    // Mods disponíveis para download
    'mods' => [
        /**
         * =========================================================================
         * DOCUMENTAÇÃO DE CATEGORIAS PARA MODS
         * =========================================================================
         *
         * CAMPO: gameCategory (OBRIGATÓRIO)
         * Define em qual servidor/jogo o mod aparece e onde será instalado
         * Valores aceitos:
         * - 'rp'    => Horizonte RP (instalado em horizonte-rp/mods/)
         * - 'dm'    => Horizonte DM (instalado em horizonte-dm/mods/)
         * - 'dayz'  => Horizonte DayZ (instalado em horizonte-dayz/mods/)
         *
         * CAMPO: category (OBRIGATÓRIO)
         * Define o tipo do mod para filtragem no dropdown
         * Valores aceitos:
         * - 'tools'        => Ferramentas (CLEO, MoonLoader, Mod Loader, SAMPFUNCS)
         * - 'cars'         => Carros (veículos de 4 rodas)
         * - 'motorcycles'  => Motos (veículos de 2 rodas)
         * - 'trucks'       => Caminhões (veículos pesados)
         * - 'weapons'      => Armas (armas de fogo, armas brancas)
         * - 'graphics'     => Gráficos (ENB, texturas, melhorias visuais)
         * - 'skins'        => Skins (roupas, personagens)
         * - 'sounds'       => Sons (efeitos sonoros, músicas)
         * - 'maps'         => Mapas (novas áreas, construções)
         * - 'scripts'      => Scripts (scripts Lua, CLEO scripts)
         * - 'gameplay'     => Gameplay (modificações de jogabilidade)
         * - 'optimization' => Otimização (melhorias de performance)
         * - 'world'        => Mundo (alterações no ambiente)
         * - 'hud'          => HUD (interface do usuário, elementos de tela)
         *
         * CAMPO: popular (OPCIONAL)
         * Define se o mod aparece na seção "Populares"
         * Valores: true ou false (padrão: false)
         *
         * CAMPO: dependencies (OPCIONAL)
         * Array com IDs de mods necessários para este funcionar
         * Exemplo: ['cleo', 'moonloader']
         *
         * =========================================================================
         * EXEMPLO DE MOD - USE COMO TEMPLATE:
         * =========================================================================
         */
        [
            'id' => 'moonloader',
            'name' => 'MoonLoader',
            'author' => 'FYP',
            'description' => 'Carregador de scripts Lua para GTA San Andreas com suporte a SAMP.',
            'fullDescription' => 'MoonLoader permite executar scripts em Lua no GTA SA. Essencial para diversos mods e ferramentas de SAMP, com hot-reload e console de debug.',
            'image' => 'http://horizontegames.com/api/assets/mods/moonloader.png?v=4',
            'category' => 'tools',
            'gameCategory' => 'rp',
            'popular' => true,
            'dependencies' => [],
            'downloadUrl' => 'http://horizontegames.com/api/mods/moonloader.zip',
            'version' => '0.26',
            'size' => 5242880
        ],
        [
            'id' => 'modloader',
            'name' => 'Mod Loader',
            'author' => 'LINK/2012',
            'description' => 'Gerenciador de mods que permite instalar mods sem substituir arquivos.',
            'fullDescription' => 'Mod Loader facilita a instalação de mods criando uma pasta onde você pode colocar mods sem modificar os arquivos originais do jogo.',
            'image' => 'http://horizontegames.com/api/assets/mods/modloader.png?v=4',
            'category' => 'tools',
            'gameCategory' => 'rp',
            'popular' => true,
            'dependencies' => [],
            'downloadUrl' => 'http://horizontegames.com/api/mods/modloader.zip',
            'version' => '0.3.7',
            'size' => 1048576
        ],
        [
            'id' => 'cleo',                    // ID único do mod (sem espaços)
            'name' => 'CLEO 4',                // Nome de exibição do mod
            'author' => 'Seemann',              // Autor do mod
            'description' => 'Biblioteca essencial para rodar scripts CLEO no GTA San Andreas.',  // Descrição curta (aparece no card)
            'fullDescription' => 'CLEO 4 é a biblioteca mais importante para mods de GTA SA. Permite executar scripts .cs e .csi, adicionando novas funcionalidades ao jogo.',  // Descrição completa (aparece no modal)
            'image' => 'http://horizontegames.com/api/assets/mods/cleo.png?v=4',  // URL da imagem do mod
            'category' => 'tools',              // Tipo do mod (ver lista acima)
            'gameCategory' => 'rp',             // Servidor onde aparece (rp/dm/dayz)
            'popular' => true,                  // Aparece em "Populares"? (true/false)
            'dependencies' => [],                // Dependências (array de IDs)
            'downloadUrl' => 'http://horizontegames.com/api/mods/cleo.zip',  // URL do arquivo ZIP
            'version' => '4.4.1',
            'size' => 2097152
        ],
        [
            'id' => 'calculadora',
            'name' => 'Calculadora de Chat',
            'author' => 'Adrian G',
            'description' => 'Digite qualquer expressão matemática e veja o resultado em tempo real, sem precisar enviar a mensagem.',
            'fullDescription' => 'Script que permite realizar cálculos matemáticos diretamente no campo de chat do SA-MP. Ao digitar uma expressão matemática, o resultado é exibido automaticamente em uma janela flutuante, sem necessidade de enviar a mensagem. Exemplo: (1500/100)*30',
            'image' => 'http://horizontegames.com/api/assets/mods/calculadora.png?v=4',
            'category' => 'tools',
            'gameCategory' => 'rp',
            'popular' => true,
            'dependencies' => ['moonloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/calculadora.zip',
            'version' => '3.0',
            'size' => 3145728
        ],
        [
            'id' => 'traçante',
            'name' => 'Traçante de Bala de Fumaça',
            'author' => 'BillyCoster',
            'description' => 'Adiciona rastros de fumaça realistas nas balas disparadas, similar ao efeito do GTA V.',
            'fullDescription' => 'Este mod adiciona um efeito visual de rastro de fumaça nas balas disparadas, tornando os tiroteios mais imersivos e cinematográficos. Inspirado no sistema de traçantes do GTA V, permite visualizar a trajetória dos projéteis em tempo real. Ideal para quem busca maior realismo nos combates.',
            'image' => 'http://horizontegames.com/api/assets/mods/traçante.png?v=4',
            'category' => 'graphics',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => [],
            'downloadUrl' => 'http://horizontegames.com/api/mods/traçante.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'climamenu',
            'name' => 'Clima Menu',
            'author' => 'Daryl',
            'description' => 'Mude o clima, o tempo e outras configurações do jogo.',
            'fullDescription' => 'Este mod te da a possibilidade de mudar o clima e o tempo do jogo. Também é possível ativar widescreen, damage informer, entre outros...',
            'image' => 'http://horizontegames.com/api/assets/mods/climaMenu.png?v=4',
            'category' => 'graphics',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => [],
            'downloadUrl' => 'http://horizontegames.com/api/mods/climaMenu.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'capaeditor',
            'name' => 'Capa Editor',
            'author' => 'Victor Trok',
            'description' => 'Edite o HUD do capacete do servidor através do comando /capa.',
            'fullDescription' => 'Este mod edita o HUD de capacete no servidor através do comando /Capa.',
            'image' => 'http://horizontegames.com/api/assets/mods/capaEditor.png?v=4',
            'category' => 'hud',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => ['moonloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/capaEditor.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'hudeditor',
            'name' => 'Hud Editor',
            'author' => 'Victor Trok',
            'description' => 'Edite o HUD do jogo através do comando /hud.',
            'fullDescription' => 'Este mod edita o HUD do jogo, (barra de vida, colete, folego, stamina, dinheiro, icone da arma) através do comando /hud.',
            'image' => 'http://horizontegames.com/api/assets/mods/hudEditor.png?v=4',
            'category' => 'hud',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => ['moonloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/hudEditor.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'tab',
            'name' => 'TAB Personalizado',
            'author' => 'Bill Master',
            'description' => 'Personalize o TAB do jogo. Pesquise jogadores, crie grupos e outras configurações.',
            'fullDescription' => 'Este mod modifica o TAB do jogo (scoreboard) e te da opções de pesquisar por jogadores, criar grupos, entre outras configurações.',
            'image' => 'http://horizontegames.com/api/assets/mods/tab.png?v=4',
            'category' => 'hud',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => ['moonloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/tab.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'tiger1200',
            'name' => 'Triumph Tiger 1200',
            'author' => 'Bill Master',
            'description' => 'Modifique sua NRG-500 para uma Tiger 1200.',
            'fullDescription' => 'Este mod substitui o veiculo NRG-500 para a Triumph Tiger 1200.',
            'image' => 'http://horizontegames.com/api/assets/mods/tiger1200.png?v=4',
            'category' => 'motorcycles',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => ['modloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/tiger1200.zip',
            'version' => '1.0',
            'size' => 141312
        ],
        [
            'id' => 'lamborghiniRevuelto',
            'name' => 'Lamborghini Revuelto',
            'author' => 'Ricky',
            'description' => 'Modifique seu Infernus para uma Lamborghini Revuelto.',
            'fullDescription' => 'Este mod substitui o veiculo Infernus para a Lamborghini Revuelto.',
            'image' => 'http://horizontegames.com/api/assets/mods/lamborghiniRevuelto.png?v=4',
            'category' => 'cars',
            'gameCategory' => 'rp',
            'popular' => false,
            'dependencies' => ['modloader'],
            'downloadUrl' => 'http://horizontegames.com/api/mods/lamborghiniRevuelto.zip',
            'version' => '1.0',
            'size' => 141312
        ],

        // Adicione mais mods seguindo o template acima
    ]
];

echo json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>