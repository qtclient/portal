-- Client telemetry: crash reports/groups, debug symbols, FPS samples, system surveys.

CREATE TABLE IF NOT EXISTS `qtcaac_crash_groups` (
    `id` VARCHAR(191) NOT NULL,
    `signature` CHAR(40) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `first_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `count` INTEGER NOT NULL DEFAULT 0,
    `last_revision` VARCHAR(64) NOT NULL,
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,

    UNIQUE INDEX `qtcaac_crash_groups_signature_key`(`signature`),
    INDEX `qtcaac_crash_groups_last_seen_idx`(`last_seen`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_crash_reports` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `platform` VARCHAR(32) NOT NULL,
    `revision` VARCHAR(64) NOT NULL,
    `report_type` VARCHAR(16) NOT NULL,
    `comment` TEXT NULL,
    `account_id` INTEGER UNSIGNED NULL,
    `ip_hash` CHAR(64) NULL,
    `dump_path` VARCHAR(255) NULL,
    `dump_size` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `signature` CHAR(40) NULL,
    `crash_type` VARCHAR(128) NULL,
    `frames` JSON NULL,
    `metadata` JSON NULL,
    `group_id` VARCHAR(191) NULL,

    INDEX `qtcaac_crash_reports_created_at_idx`(`created_at`),
    INDEX `qtcaac_crash_reports_group_id_idx`(`group_id`),
    INDEX `qtcaac_crash_reports_status_idx`(`status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `qtcaac_crash_reports_group_id_fkey` FOREIGN KEY (`group_id`)
        REFERENCES `qtcaac_crash_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_symbol_files` (
    `id` VARCHAR(191) NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `kind` VARCHAR(16) NOT NULL,
    `debug_id` VARCHAR(64) NOT NULL,
    `code_file` VARCHAR(255) NOT NULL,
    `os` VARCHAR(16) NULL,
    `arch` VARCHAR(16) NULL,
    `path` VARCHAR(512) NOT NULL,
    `size` INTEGER NOT NULL,

    UNIQUE INDEX `qtcaac_symbol_files_kind_debug_id_code_file_key`(`kind`, `debug_id`, `code_file`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_fps_samples` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sampled_at` DATETIME(3) NULL,
    `client_id` VARCHAR(64) NULL,
    `platform` VARCHAR(32) NOT NULL,
    `revision` VARCHAR(64) NOT NULL,
    `renderer` VARCHAR(128) NOT NULL,
    `average_fps` DOUBLE NOT NULL,
    `min_fps` DOUBLE NOT NULL,
    `max_fps` DOUBLE NOT NULL,

    INDEX `qtcaac_fps_samples_revision_renderer_idx`(`revision`, `renderer`),
    INDEX `qtcaac_fps_samples_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qtcaac_system_surveys` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `client_id` VARCHAR(64) NULL,
    `platform` VARCHAR(32) NOT NULL,
    `revision` VARCHAR(64) NOT NULL,
    `gpu` VARCHAR(255) NULL,
    `cpu` VARCHAR(255) NULL,
    `os` VARCHAR(255) NULL,
    `raw` JSON NOT NULL,

    INDEX `qtcaac_system_surveys_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
