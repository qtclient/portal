-- qtc-aac baseline: web tables overlaid on the CrystalServer schema.sql.
-- Every statement is idempotent so re-runs and existing databases stay safe.

-- ---- part 1 ----
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;

CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(255),
    IN fieldName VARCHAR(255),
    IN fieldDef TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE COLUMN_NAME=fieldName
        AND TABLE_NAME=tableName
        AND TABLE_SCHEMA=DATABASE()
    )
    THEN
        SET @ddl=CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN `', fieldName, '` ', fieldDef);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddIndexIfNotExists(
    IN tableName VARCHAR(255),
    IN indexName VARCHAR(255),
    IN uniqueIndex BOOLEAN,
    IN indexColumns VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @index_exists = (
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema = @dbname
        AND table_name = tableName
        AND index_name = indexName
    );

    IF @index_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD ');
        IF uniqueIndex THEN
            SET @ddl = CONCAT(@ddl, 'UNIQUE ');
        END IF;
        SET @ddl = CONCAT(@ddl, 'INDEX ', indexName, '(', indexColumns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddForeignKeyIfNotExists(
    IN tableName VARCHAR(255),
    IN constraintName VARCHAR(255),
    IN foreignKeyName VARCHAR(255),
    IN referenceTableName VARCHAR(255),
    IN referenceKeyName VARCHAR(255),
    IN onDeleteAction VARCHAR(255),
    IN onUpdateAction VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @fk_exists = (
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_schema = @dbname
        AND table_name = tableName
        AND constraint_name = constraintName
    );

    IF @fk_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName,
                          ' ADD CONSTRAINT ', constraintName,
                          ' FOREIGN KEY (', foreignKeyName,
                          ') REFERENCES ', referenceTableName,
                          '(', referenceKeyName, ')',
                          ' ON DELETE ', onDeleteAction,
                          ' ON UPDATE ', onUpdateAction);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CALL AddColumnIfNotExists('accounts', 'balance', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
CALL AddColumnIfNotExists('accounts', 'is_verified', 'BOOLEAN NOT NULL DEFAULT false');
CALL AddColumnIfNotExists('accounts', 'token_secret', 'VARCHAR(255) NULL');

CALL AddColumnIfNotExists('guild_ranks', 'order', 'INTEGER NOT NULL DEFAULT 0');

CALL AddColumnIfNotExists('guilds', 'created_at', 'DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0)');
CALL AddColumnIfNotExists('guilds', 'description', 'TEXT NULL');
CALL AddColumnIfNotExists('guilds', 'image_url', 'VARCHAR(191) NULL');

CALL AddColumnIfNotExists('players', 'is_main', 'BOOLEAN NOT NULL DEFAULT false');

CALL AddColumnIfNotExists('tile_store', 'id', 'INTEGER NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`id`)');

CALL AddColumnIfNotExists('towns', 'starter', 'BOOLEAN NOT NULL DEFAULT false');

CREATE TABLE IF NOT EXISTS `monsters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `lookbody` INTEGER NOT NULL DEFAULT 0,
    `lookfeet` INTEGER NOT NULL DEFAULT 0,
    `lookhead` INTEGER NOT NULL DEFAULT 0,
    `looklegs` INTEGER NOT NULL DEFAULT 0,
    `looktype` INTEGER NOT NULL DEFAULT 136,
    `lookaddons` INTEGER NOT NULL DEFAULT 0,
    `lookmount` INTEGER NOT NULL DEFAULT 0,
    `looktypeex` INTEGER NOT NULL DEFAULT 0,
    `raceid` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_account_backup_codes` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,

    INDEX `qtcaac_account_backup_codes_account_id_fkey`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_coin_offers` (
    `id` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `price` DECIMAL(65, 30) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',

    UNIQUE INDEX `qtcaac_coin_offers_amount_currency_key`(`amount`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_coin_orders` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'FAILED_ATTEMPT', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `account_id` INTEGER UNSIGNED NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `amount` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payment_token` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `qtcaac_coin_orders_payment_token_key`(`payment_token`),
    INDEX `qtcaac_coin_orders_account_id_fkey`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_currency_exchange_rates` (
    `currency` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(65, 30) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`currency`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_email_verifications` (
    `token` VARCHAR(191) NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `new_email` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `qtcaac_email_verifications_account_id_fkey`(`account_id`),
    PRIMARY KEY (`token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_news` (
    `id` VARCHAR(191) NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `author_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `qtcaac_news_author_id_fkey`(`author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_password_resets` (
    `token` VARCHAR(191) NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `qtcaac_password_resets_account_id_key`(`account_id`),
    PRIMARY KEY (`token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_player_settings` (
    `id` VARCHAR(191) NOT NULL,
    `player_id` INTEGER NOT NULL,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `show_skills` BOOLEAN NOT NULL DEFAULT true,
    `show_inventory` BOOLEAN NOT NULL DEFAULT true,
    `comment` TEXT NULL,

    UNIQUE INDEX `qtcaac_player_settings_player_id_key`(`player_id`),
    INDEX `player_id`(`player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `expires` BIGINT UNSIGNED NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,

    INDEX `qtcaac_sessions_account_id_fkey`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_static_pages` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `order` INTEGER NOT NULL DEFAULT 0,
    `hide` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `qtcaac_static_pages_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL AddIndexIfNotExists('account_sessions', 'account_sessions_account_id_fkey', FALSE, 'account_id');
CALL AddIndexIfNotExists('accounts', 'accounts_email_unique', TRUE, 'email');
CALL AddIndexIfNotExists('player_bosstiary', 'player_bosstiary_unique', TRUE, 'player_id');
CALL AddIndexIfNotExists('player_charms', 'player_charms_unique', TRUE, 'player_id');
CALL AddIndexIfNotExists('player_deaths', 'player_deaths_unique', TRUE, 'player_id, time');
CALL AddIndexIfNotExists('player_kills', 'player_kills_unique', TRUE, 'player_id, time, target');
CALL AddIndexIfNotExists('players', 'deletion', FALSE, 'deletion');

CALL AddForeignKeyIfNotExists('players_online', 'players_online_player_id_fkey', 'player_id', 'players', 'id', 'RESTRICT', 'CASCADE');
CALL AddForeignKeyIfNotExists('account_sessions', 'account_sessions_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_account_backup_codes', 'qtcaac_account_backup_codes_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_coin_orders', 'qtcaac_coin_orders_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_email_verifications', 'qtcaac_email_verifications_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_news', 'qtcaac_news_author_id_fkey', 'author_id', 'players', 'id', 'RESTRICT', 'CASCADE');
CALL AddForeignKeyIfNotExists('qtcaac_password_resets', 'qtcaac_password_resets_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_player_settings', 'qtcaac_player_settings_player_id_fkey', 'player_id', 'players', 'id', 'CASCADE', 'NO ACTION');
CALL AddForeignKeyIfNotExists('qtcaac_sessions', 'qtcaac_sessions_account_id_fkey', 'account_id', 'accounts', 'id', 'CASCADE', 'CASCADE');

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;

DROP TRIGGER IF EXISTS `oncreate_guilds`;

INSERT IGNORE INTO `qtcaac_coin_offers` (`id`, `amount`, `price`, `currency`)
VALUES
	('1021b338-07aa-11ee-bee2-0cc47a9f9a0a', 100, 1.990000000000000000000000000000, 'USD'),
	('1021d7ee-07aa-11ee-bee2-0cc47a9f9a0a', 250, 4.990000000000000000000000000000, 'USD'),
	('1021ef71-07aa-11ee-bee2-0cc47a9f9a0a', 600, 9.990000000000000000000000000000, 'USD'),
	('10220e3a-07aa-11ee-bee2-0cc47a9f9a0a', 1600, 24.990000000000000000000000000000, 'USD'),
	('102228af-07aa-11ee-bee2-0cc47a9f9a0a', 3400, 49.990000000000000000000000000000, 'USD'),
	('10223e81-07aa-11ee-bee2-0cc47a9f9a0a', 7000, 99.990000000000000000000000000000, 'USD');

INSERT IGNORE INTO `qtcaac_static_pages` (`id`, `slug`, `title`, `content`, `created_at`, `updated_at`, `order`)
VALUES
	('cliqdro2d0000thlziqly40j9', 'rules', 'Rules', '{% $title %} is an online role-playing game in which players from all over the world meet everyday. In order to ensure that the game is fun for everyone, we expect all players to behave in a reasonable and respectful manner.  \r\n  \r\nWe reserves the right to stop destructive behaviour in the game, on the official website or in any other part of our services. Such behaviour includes, but is not limited to, the following offences:  \r\n  \r\n\r\n1. **Names**\r\n    1. **Offensive Name**  \r\n    Names that are insulting, racist, sexually related, drug-related, harassing or generally objectionable.\r\n    2. **Name Containing Forbidden Advertising**\r\n    Names that advertise brands, products or services of third parties, content which is not related to the game or trades for real money.\r\n    3. **Unsuitable Name**  \r\n    Names that express religious or political views.\r\n    4. **Name Supporting Rule Violation**  \r\n    Names that support, incite, announce or imply a violation of the {% $title %} Rules.\r\n2. **Statements**\r\n    1. **Offensive Statement**  \r\n    Insulting, racist, sexually related, drug-related, harassing or generally objectionable statements.\r\n    2. **Spamming**  \r\n    Excessively repeating identical or similar statements or using badly formatted or nonsensical text.\r\n    3. **Forbidden Advertising**  \r\n    Advertising brands, products or services of third parties, content which is not related to the game or trades for real money.\r\n    4. **Off-Topic Public Statement**  \r\n    Religious or political public statements or other public statements which are not related to the topic of the used channel or board.\r\n    5. **Violating Language Restriction**  \r\n    Non-English statements in boards and channels where the use of English is explicitly required.\r\n    6. **Disclosing Personal Data of Others**  \r\n    Disclosing personal data of other people.\r\n    7. **Supporting Rule Violation**  \r\n    Statements that support, incite, announce or imply a violation of the {% $title %} Rules.\r\n1. **Cheating**\r\n    1. **Bug Abuse**  \r\n    Exploiting obvious errors of the game or any other part of {% $title %}\'s services.\r\n    1. **Using Unofficial Software to Play**  \r\n    Manipulating the official client program or using additional software to play the game.\r\n1. **{% $title %}**\r\n    1. **Pretending to be {% $title %}**  \r\n    Pretending to be a representative of {% $title %} or to have their legitimation or powers.\r\n    1. **Slandering or Agitating against {% $title %}**  \r\n    Publishing clearly wrong information about or calling a boycott against {% $title %} or its services.\r\n    1. **False Information to {% $title %}**  \r\n    Intentionally giving wrong or misleading information to {% $title %} in reports about rule violations, complaints, bug reports or support requests.\r\n1. **Legal Issues**\r\n    1. **Hacking**  \r\n    Stealing other players\' account or personal data.\r\n    1. **Attacking {% $title %} Service**  \r\n    Attacking, disrupting or damaging the operation of any {% $title %} server, the game or any other part of {% $title %}\'s services.\r\n    1. **Violating Law or Regulations**  \r\n    Violating any applicable law, the {% $title %} Service Agreement or rights of third parties.\r\n\r\n\r\nViolating or attempting to violate the {% $title %} Rules may lead to a temporary suspension of characters and accounts. In severe cases the removal or modification of character skills, attributes and belongings, as well as the permanent removal of characters and accounts without any compensation may be considered. The sanction is based on the seriousness of the rule violation and the previous record of the player. It is determined at the sole discretion of {% $title %} and can be imposed without any previous warning.  \r\n  \r\nThese rules may be changed at any time. All changes will be announced on the official website.', '2023-06-10 19:19:34.550', '2023-06-10 20:38:59.091', 0);

-- ---- part 2 ----
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;

CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(255),
    IN fieldName VARCHAR(255),
    IN fieldDef TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE COLUMN_NAME=fieldName
        AND TABLE_NAME=tableName
        AND TABLE_SCHEMA=DATABASE()
    )
    THEN
        SET @ddl=CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN `', fieldName, '` ', fieldDef);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddIndexIfNotExists(
    IN tableName VARCHAR(255),
    IN indexName VARCHAR(255),
    IN uniqueIndex BOOLEAN,
    IN indexColumns VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @index_exists = (
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema = @dbname
        AND table_name = tableName
        AND index_name = indexName
    );

    IF @index_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD ');
        IF uniqueIndex THEN
            SET @ddl = CONCAT(@ddl, 'UNIQUE ');
        END IF;
        SET @ddl = CONCAT(@ddl, 'INDEX ', indexName, '(', indexColumns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddForeignKeyIfNotExists(
    IN tableName VARCHAR(255),
    IN constraintName VARCHAR(255),
    IN foreignKeyName VARCHAR(255),
    IN referenceTableName VARCHAR(255),
    IN referenceKeyName VARCHAR(255),
    IN onDeleteAction VARCHAR(255),
    IN onUpdateAction VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @fk_exists = (
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_schema = @dbname
        AND table_name = tableName
        AND constraint_name = constraintName
    );

    IF @fk_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName,
                          ' ADD CONSTRAINT ', constraintName,
                          ' FOREIGN KEY (', foreignKeyName,
                          ') REFERENCES ', referenceTableName,
                          '(', referenceKeyName, ')',
                          ' ON DELETE ', onDeleteAction,
                          ' ON UPDATE ', onUpdateAction);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CALL AddColumnIfNotExists('qtcaac_news', 'ticker', 'BOOLEAN NOT NULL DEFAULT false');

CALL AddColumnIfNotExists('accounts', 'referred_by', 'INTEGER UNSIGNED NULL');
CALL AddColumnIfNotExists('accounts', 'referral_rewarded_at', 'DATETIME(3) NULL');
CALL AddIndexIfNotExists('accounts', 'accounts_referred_by_fkey', false, 'referred_by');
CALL AddForeignKeyIfNotExists(
	'accounts',
	'accounts_referred_by_fkey',
	'referred_by',
	'accounts',
	'id',
	'SET NULL',
	'NO ACTION'
);

CALL AddColumnIfNotExists('players', 'charbazaar', 'TINYINT(1) NOT NULL DEFAULT 0');

CALL AddColumnIfNotExists('qtcaac_coin_orders', 'payment_method', 'VARCHAR(32) NOT NULL DEFAULT ''stripe''');

CREATE TABLE IF NOT EXISTS `qtcaac_char_bazaar_auctions` (
	`id` VARCHAR(191) NOT NULL,
	`player_id` INTEGER NOT NULL,
	`seller_account_id` INTEGER UNSIGNED NOT NULL,
	`buyer_account_id` INTEGER UNSIGNED NULL,
	`start_price` INTEGER UNSIGNED NOT NULL,
	`current_price` INTEGER UNSIGNED NOT NULL,
	`current_bidder_account_id` INTEGER UNSIGNED NULL,
	`listed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ends_at` DATETIME(3) NOT NULL,
	`status` ENUM('LISTED', 'SOLD', 'EXPIRED') NOT NULL DEFAULT 'LISTED',
	`create_fee` INTEGER UNSIGNED NOT NULL,
	`bid_fee` INTEGER UNSIGNED NOT NULL,
	`tax_percent` INTEGER UNSIGNED NOT NULL,
	INDEX `qtcaac_char_bazaar_auctions_player_id_fkey`(`player_id`),
	INDEX `qtcaac_char_bazaar_auctions_seller_fkey`(`seller_account_id`),
	INDEX `qtcaac_char_bazaar_auctions_buyer_fkey`(`buyer_account_id`),
	INDEX `qtcaac_char_bazaar_auctions_bidder_fkey`(`current_bidder_account_id`),
	INDEX `qtcaac_char_bazaar_auctions_status_ends`(`status`, `ends_at`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_char_bazaar_bids` (
	`id` VARCHAR(191) NOT NULL,
	`auction_id` VARCHAR(191) NOT NULL,
	`account_id` INTEGER UNSIGNED NOT NULL,
	`amount` INTEGER UNSIGNED NOT NULL,
	`fee` INTEGER UNSIGNED NOT NULL,
	`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	INDEX `qtcaac_char_bazaar_bids_auction_id_fkey`(`auction_id`),
	INDEX `qtcaac_char_bazaar_bids_account_id_fkey`(`account_id`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_auctions',
	'qtcaac_char_bazaar_auctions_player_id_fkey',
	'player_id',
	'players',
	'id',
	'CASCADE',
	'NO ACTION'
);
CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_auctions',
	'qtcaac_char_bazaar_auctions_seller_fkey',
	'seller_account_id',
	'accounts',
	'id',
	'CASCADE',
	'NO ACTION'
);
CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_auctions',
	'qtcaac_char_bazaar_auctions_buyer_fkey',
	'buyer_account_id',
	'accounts',
	'id',
	'SET NULL',
	'NO ACTION'
);
CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_auctions',
	'qtcaac_char_bazaar_auctions_bidder_fkey',
	'current_bidder_account_id',
	'accounts',
	'id',
	'SET NULL',
	'NO ACTION'
);
CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_bids',
	'qtcaac_char_bazaar_bids_auction_id_fkey',
	'auction_id',
	'qtcaac_char_bazaar_auctions',
	'id',
	'CASCADE',
	'NO ACTION'
);
CALL AddForeignKeyIfNotExists(
	'qtcaac_char_bazaar_bids',
	'qtcaac_char_bazaar_bids_account_id_fkey',
	'account_id',
	'accounts',
	'id',
	'CASCADE',
	'NO ACTION'
);

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;

-- ---- part 3 ----
CREATE TABLE IF NOT EXISTS `qtcaac_device_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_used_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `qtcaac_device_sessions_token_hash_key`(`token_hash`),
    INDEX `qtcaac_device_sessions_account_id_fkey`(`account_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `qtcaac_device_sessions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_bootstrap_codes` (
    `code_hash` CHAR(64) NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `expires` BIGINT UNSIGNED NOT NULL,

    INDEX `qtcaac_bootstrap_codes_account_id_fkey`(`account_id`),
    INDEX `qtcaac_bootstrap_codes_expires_idx`(`expires`),
    PRIMARY KEY (`code_hash`),
    CONSTRAINT `qtcaac_bootstrap_codes_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---- part 4: bootstrap code purpose + news compendium category ----
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;

CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(255),
    IN fieldName VARCHAR(255),
    IN fieldDef TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE COLUMN_NAME=fieldName
        AND TABLE_NAME=tableName
        AND TABLE_SCHEMA=DATABASE()
    )
    THEN
        SET @ddl=CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN `', fieldName, '` ', fieldDef);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddIndexIfNotExists(
    IN tableName VARCHAR(255),
    IN indexName VARCHAR(255),
    IN uniqueIndex BOOLEAN,
    IN indexColumns VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @index_exists = (
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema = @dbname
        AND table_name = tableName
        AND index_name = indexName
    );

    IF @index_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD ');
        IF uniqueIndex THEN
            SET @ddl = CONCAT(@ddl, 'UNIQUE ');
        END IF;
        SET @ddl = CONCAT(@ddl, 'INDEX ', indexName, '(', indexColumns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CREATE PROCEDURE AddForeignKeyIfNotExists(
    IN tableName VARCHAR(255),
    IN constraintName VARCHAR(255),
    IN foreignKeyName VARCHAR(255),
    IN referenceTableName VARCHAR(255),
    IN referenceKeyName VARCHAR(255),
    IN onDeleteAction VARCHAR(255),
    IN onUpdateAction VARCHAR(255)
)
BEGIN
    SET @dbname = DATABASE();
    SET @fk_exists = (
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_schema = @dbname
        AND table_name = tableName
        AND constraint_name = constraintName
    );

    IF @fk_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName,
                          ' ADD CONSTRAINT ', constraintName,
                          ' FOREIGN KEY (', foreignKeyName,
                          ') REFERENCES ', referenceTableName,
                          '(', referenceKeyName, ')',
                          ' ON DELETE ', onDeleteAction,
                          ' ON UPDATE ', onUpdateAction);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CALL AddColumnIfNotExists('qtcaac_bootstrap_codes', 'purpose', 'VARCHAR(16) NOT NULL DEFAULT ''play''');
CALL AddColumnIfNotExists('qtcaac_news', 'category', 'VARCHAR(64) NOT NULL DEFAULT ''MAJOR UPDATES''');
CALL AddIndexIfNotExists('qtcaac_news', 'qtcaac_news_published_category_idx', FALSE, 'published, category');
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DROP PROCEDURE IF EXISTS AddForeignKeyIfNotExists;
