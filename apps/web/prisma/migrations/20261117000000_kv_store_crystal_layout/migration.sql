-- kv_store is Crystal's table (src/kv/kv_sql.cpp): key_name, timestamp, value.
-- Databases created by the pre-baseline migrations have `key`/`value` instead,
-- so every Crystal KV read/write failed (Unknown column 'key_name'). Bring
-- either layout to Crystal's; a fresh database gets the table here, before
-- Crystal's own migration 38 (CREATE TABLE IF NOT EXISTS) would.
CREATE TABLE IF NOT EXISTS `kv_store` (
  `key_name` VARCHAR(191) NOT NULL,
  `timestamp` BIGINT NOT NULL,
  `value` LONGBLOB NOT NULL,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `kv_store` CHANGE COLUMN IF EXISTS `key` `key_name` VARCHAR(191) NOT NULL;
ALTER TABLE `kv_store` ADD COLUMN IF NOT EXISTS `timestamp` BIGINT NOT NULL DEFAULT 0 AFTER `key_name`;
UPDATE `kv_store` SET `value` = '' WHERE `value` IS NULL;
ALTER TABLE `kv_store` MODIFY COLUMN `value` LONGBLOB NOT NULL;
