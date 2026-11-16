-- Char Bazaar auctions are set up in the game client (CIP): the game server's
-- charbazaar module writes the auction row, the seller's picks and a frozen
-- snapshot of the character here; bidding and settlement stay on the website.

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(255),
    IN fieldName VARCHAR(255),
    IN fieldDef VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tableName AND COLUMN_NAME = fieldName
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', tableName, '` ADD COLUMN `', fieldName, '` ', fieldDef);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

-- NULL bid fee = the website's current QTCAAC bid fee (bidding is a website rule).
ALTER TABLE `qtcaac_char_bazaar_auctions` MODIFY `bid_fee` INTEGER UNSIGNED NULL;
-- Item appearance ids the seller showcased (comma separated) and the chosen
-- sales arguments as `[{"icon":N,"text":"…"}]`.
CALL AddColumnIfNotExists('qtcaac_char_bazaar_auctions', 'showcase', 'VARCHAR(255) NULL');
CALL AddColumnIfNotExists('qtcaac_char_bazaar_auctions', 'sales_arguments', 'TEXT NULL');

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

CREATE TABLE IF NOT EXISTS `qtcaac_char_bazaar_snapshots` (
    `auction_id` VARCHAR(191) NOT NULL,
    `player_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `world_name` VARCHAR(255) NOT NULL,
    `blessings_count` INTEGER NOT NULL DEFAULT 0,
    `blessings_twist` INTEGER NOT NULL DEFAULT 0,
    `equipment` MEDIUMTEXT NULL,
    `items` MEDIUMTEXT NULL,
    `outfits` MEDIUMTEXT NULL,
    `mounts` MEDIUMTEXT NULL,
    `quests` MEDIUMTEXT NULL,
    `features` MEDIUMTEXT NULL,
    `showcase` MEDIUMTEXT NULL,
    `created_at` BIGINT NOT NULL,
    `skill_fist` BIGINT NOT NULL DEFAULT 0,
    `skill_club` BIGINT NOT NULL DEFAULT 0,
    `skill_sword` BIGINT NOT NULL DEFAULT 0,
    `skill_axe` BIGINT NOT NULL DEFAULT 0,
    `skill_dist` BIGINT NOT NULL DEFAULT 0,
    `skill_shielding` BIGINT NOT NULL DEFAULT 0,
    `skill_fishing` BIGINT NOT NULL DEFAULT 0,
    `skill_fist_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_club_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_sword_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_axe_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_dist_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_shielding_tries` BIGINT NOT NULL DEFAULT 0,
    `skill_fishing_tries` BIGINT NOT NULL DEFAULT 0,
    `looktype` BIGINT NOT NULL DEFAULT 0,
    `lookaddons` BIGINT NOT NULL DEFAULT 0,
    `lookhead` BIGINT NOT NULL DEFAULT 0,
    `lookbody` BIGINT NOT NULL DEFAULT 0,
    `looklegs` BIGINT NOT NULL DEFAULT 0,
    `lookfeet` BIGINT NOT NULL DEFAULT 0,
    `lookmounthead` BIGINT NOT NULL DEFAULT 0,
    `lookmountbody` BIGINT NOT NULL DEFAULT 0,
    `lookmountlegs` BIGINT NOT NULL DEFAULT 0,
    `lookmountfeet` BIGINT NOT NULL DEFAULT 0,
    `health` BIGINT NOT NULL DEFAULT 0,
    `healthmax` BIGINT NOT NULL DEFAULT 0,
    `mana` BIGINT NOT NULL DEFAULT 0,
    `manamax` BIGINT NOT NULL DEFAULT 0,
    `maglevel` BIGINT NOT NULL DEFAULT 0,
    `manaspent` BIGINT NOT NULL DEFAULT 0,
    `cap` BIGINT NOT NULL DEFAULT 0,
    `soul` BIGINT NOT NULL DEFAULT 0,
    `balance` BIGINT NOT NULL DEFAULT 0,
    `experience` BIGINT NOT NULL DEFAULT 0,
    `level` BIGINT NOT NULL DEFAULT 0,
    `vocation` BIGINT NOT NULL DEFAULT 0,
    `sex` BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`auction_id`),
    INDEX `qtcaac_char_bazaar_snapshots_player_id_idx`(`player_id`),
    CONSTRAINT `qtcaac_char_bazaar_snapshots_auction_id_fkey` FOREIGN KEY (`auction_id`)
        REFERENCES `qtcaac_char_bazaar_auctions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
