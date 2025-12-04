-- =========================================================================
-- TABELAS DE CONTEÚDO DO LAUNCHER
-- =========================================================================
-- Servidores, Notícias e Mods gerenciados pelo painel admin
-- =========================================================================

-- TABELA: launcher_servers
-- Servidores de cada categoria (rp/dm/dayz)
CREATE TABLE IF NOT EXISTS `launcher_servers` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `server_id` INT NOT NULL COMMENT 'ID do servidor (usado pelo launcher)',
    `category` ENUM('rp', 'dm', 'dayz') NOT NULL COMMENT 'Categoria do servidor',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nome do servidor',
    `ip` VARCHAR(45) NOT NULL COMMENT 'IP do servidor',
    `port` INT(5) NOT NULL DEFAULT 7777 COMMENT 'Porta do servidor',
    `max_players` INT(5) NOT NULL DEFAULT 100 COMMENT 'Máximo de jogadores',
    `discord` VARCHAR(255) NULL DEFAULT NULL COMMENT 'Link do Discord',
    `order` INT(3) NOT NULL DEFAULT 0 COMMENT 'Ordem de exibição',
    `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Servidor ativo?',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_server` (`category`, `server_id`),
    KEY `idx_category` (`category`),
    KEY `idx_active` (`active`),
    KEY `idx_order` (`order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABELA: launcher_news
-- Notícias exibidas no launcher por categoria
CREATE TABLE IF NOT EXISTS `launcher_news` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `category` ENUM('rp', 'dm', 'dayz') NOT NULL COMMENT 'Categoria da notícia',
    `title` VARCHAR(255) NOT NULL COMMENT 'Título da notícia',
    `image` VARCHAR(500) NOT NULL COMMENT 'URL da imagem',
    `link` VARCHAR(500) NOT NULL COMMENT 'Link ao clicar na notícia',
    `order` INT(3) NOT NULL DEFAULT 0 COMMENT 'Ordem de exibição',
    `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Notícia ativa?',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_category` (`category`),
    KEY `idx_active` (`active`),
    KEY `idx_order` (`order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABELA: launcher_mods
-- Mods disponíveis para download no launcher
CREATE TABLE IF NOT EXISTS `launcher_mods` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `mod_id` VARCHAR(50) NOT NULL COMMENT 'ID único do mod (slug)',
    `name` VARCHAR(255) NOT NULL COMMENT 'Nome do mod',
    `author` VARCHAR(100) NOT NULL COMMENT 'Autor do mod',
    `description` TEXT NOT NULL COMMENT 'Descrição curta',
    `full_description` TEXT NOT NULL COMMENT 'Descrição completa',
    `image` VARCHAR(500) NOT NULL COMMENT 'URL da imagem',
    `category` ENUM('tools', 'cars', 'motorcycles', 'trucks', 'weapons', 'graphics', 'skins', 'sounds', 'maps', 'scripts', 'gameplay', 'optimization', 'world', 'hud') NOT NULL COMMENT 'Tipo do mod',
    `game_category` ENUM('rp', 'dm', 'dayz') NOT NULL COMMENT 'Categoria do jogo',
    `popular` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Mod popular?',
    `dependencies` TEXT NULL DEFAULT NULL COMMENT 'JSON array de IDs de mods necessários',
    `download_url` VARCHAR(500) NOT NULL COMMENT 'URL do arquivo ZIP',
    `version` VARCHAR(20) NOT NULL COMMENT 'Versão do mod',
    `size` BIGINT NOT NULL COMMENT 'Tamanho em bytes',
    `downloads` INT(11) NOT NULL DEFAULT 0 COMMENT 'Contador de downloads',
    `order` INT(3) NOT NULL DEFAULT 0 COMMENT 'Ordem de exibição',
    `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Mod ativo?',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_mod` (`mod_id`),
    KEY `idx_category` (`category`),
    KEY `idx_game_category` (`game_category`),
    KEY `idx_popular` (`popular`),
    KEY `idx_active` (`active`),
    KEY `idx_order` (`order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- DADOS DE EXEMPLO (MIGRAR DO config.php)
-- =========================================================================

-- Exemplo: Inserir servidores do Horizonte RP
INSERT INTO `launcher_servers` (`server_id`, `category`, `name`, `ip`, `port`, `max_players`, `discord`, `order`, `active`) VALUES
(0, 'rp', 'Localhost (Teste)', '127.0.0.1', 7777, 100, '', 0, 1),
(1, 'rp', 'Horizonte RP #1', '149.56.252.173', 7777, 600, 'https://discord.com/invite/GmrQbRAvrP', 1, 1),
(2, 'rp', 'Horizonte RP #2', '51.222.228.151', 7777, 600, 'https://discord.gg/zb2RfgwKvJ', 2, 1),
(3, 'rp', 'Horizonte RP #3', '54.39.38.150', 7777, 600, 'https://discord.gg/wWpzCGwbve', 3, 1),
(4, 'rp', 'Horizonte RP #4', '149.56.155.127', 7777, 600, 'https://discord.gg/ApWCz9pqqa', 4, 1);

-- Exemplo: Inserir notícias do Horizonte RP
INSERT INTO `launcher_news` (`category`, `title`, `image`, `link`, `order`, `active`) VALUES
('rp', 'Natal chegando!', 'http://horizontegames.com/api/assets/images/news1.png?v=4', 'https://horizonte-rp.com', 1, 1),
('rp', 'Horizonte 3 Anos!', 'http://horizontegames.com/api/assets/images/news2.png?v=4', 'https://horizonte-rp.com', 2, 1),
('rp', 'Natal chegando!', 'http://horizontegames.com/api/assets/images/news1.png?v=4', 'https://horizonte-rp.com', 3, 1);

-- Exemplo: Inserir mods do Horizonte RP
INSERT INTO `launcher_mods` (`mod_id`, `name`, `author`, `description`, `full_description`, `image`, `category`, `game_category`, `popular`, `dependencies`, `download_url`, `version`, `size`, `order`, `active`) VALUES
('moonloader', 'MoonLoader', 'FYP', 'Carregador de scripts Lua para GTA San Andreas com suporte a SAMP.', 'MoonLoader permite executar scripts em Lua no GTA SA. Essencial para diversos mods e ferramentas de SAMP, com hot-reload e console de debug.', 'http://horizontegames.com/api/assets/mods/moonloader.png?v=4', 'tools', 'rp', 1, '[]', 'http://horizontegames.com/api/mods/moonloader.zip', '0.26', 5242880, 1, 1),
('modloader', 'Mod Loader', 'LINK/2012', 'Gerenciador de mods que permite instalar mods sem substituir arquivos.', 'Mod Loader facilita a instalação de mods criando uma pasta onde você pode colocar mods sem modificar os arquivos originais do jogo.', 'http://horizontegames.com/api/assets/mods/modloader.png?v=4', 'tools', 'rp', 1, '[]', 'http://horizontegames.com/api/mods/modloader.zip', '0.3.7', 1048576, 2, 1),
('cleo', 'CLEO 4', 'Seemann', 'Biblioteca essencial para rodar scripts CLEO no GTA San Andreas.', 'CLEO 4 é a biblioteca mais importante para mods de GTA SA. Permite executar scripts .cs e .csi, adicionando novas funcionalidades ao jogo.', 'http://horizontegames.com/api/assets/mods/cleo.png?v=4', 'tools', 'rp', 1, '[]', 'http://horizontegames.com/api/mods/cleo.zip', '4.4.1', 2097152, 3, 1),
('calculadora', 'Calculadora de Chat', 'Adrian G', 'Digite qualquer expressão matemática e veja o resultado em tempo real, sem precisar enviar a mensagem.', 'Script que permite realizar cálculos matemáticos diretamente no campo de chat do SA-MP. Ao digitar uma expressão matemática, o resultado é exibido automaticamente em uma janela flutuante, sem necessidade de enviar a mensagem. Exemplo: (1500/100)*30', 'http://horizontegames.com/api/assets/mods/calculadora.png?v=4', 'tools', 'rp', 1, '["moonloader"]', 'http://horizontegames.com/api/mods/calculadora.zip', '3.0', 3145728, 4, 1);
-- =========================================================================
-- FINALIZADO!
-- =========================================================================