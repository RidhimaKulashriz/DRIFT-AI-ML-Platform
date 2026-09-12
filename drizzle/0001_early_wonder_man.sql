CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`assetType` enum('bridge','road','rail','building','utility') NOT NULL,
	`locality` varchar(160) NOT NULL,
	`latitude` varchar(32) NOT NULL,
	`longitude` varchar(32) NOT NULL,
	`criticality` int NOT NULL DEFAULT 3,
	`status` enum('operational','watch','restricted','closed') NOT NULL DEFAULT 'operational',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int,
	`defectId` int,
	`actorId` int,
	`action` varchar(120) NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `defects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`assetId` int NOT NULL,
	`evidenceId` int,
	`defectType` enum('pothole','crack','structural') NOT NULL,
	`label` varchar(120) NOT NULL,
	`confidencePercent` int NOT NULL,
	`zeroErrorScore` int NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`status` enum('detected','under_review','verified','scheduled','resolved','dismissed') NOT NULL DEFAULT 'detected',
	`reviewState` enum('pending','approved','overridden','rejected') NOT NULL DEFAULT 'pending',
	`latitude` varchar(32) NOT NULL,
	`longitude` varchar(32) NOT NULL,
	`boundingBox` json,
	`explanation` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `defects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`uploadedBy` int,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`mediaKind` enum('photo','video','annotation','report') NOT NULL,
	`latitude` varchar(32),
	`longitude` varchar(32),
	`playbackSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assetId` int NOT NULL,
	`createdBy` int,
	`name` varchar(180) NOT NULL,
	`mode` enum('demo','hardware') NOT NULL DEFAULT 'demo',
	`status` enum('planned','preflight','active','paused','completed','failed') NOT NULL DEFAULT 'planned',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`hardwareAdapter` varchar(80),
	`operatorNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `missions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repairEstimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`defectId` int NOT NULL,
	`estimateCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`assumptions` json,
	`status` enum('draft','reviewed','approved') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairEstimates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`narrative` text NOT NULL,
	`storageKey` varchar(512),
	`storageUrl` varchar(768),
	`status` enum('draft','ready','signed_off') NOT NULL DEFAULT 'draft',
	`generatedBy` varchar(80) NOT NULL DEFAULT 'zeroerror',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`defectId` int NOT NULL,
	`reviewerId` int,
	`decision` enum('approve','override','reject','needs_site_visit') NOT NULL,
	`priorityOverride` enum('low','medium','high','critical'),
	`note` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `severityHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`defectId` int NOT NULL,
	`previousSeverity` enum('low','medium','high','critical'),
	`nextSeverity` enum('low','medium','high','critical') NOT NULL,
	`score` int NOT NULL,
	`reason` text NOT NULL,
	`changedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `severityHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`latitude` varchar(32) NOT NULL,
	`longitude` varchar(32) NOT NULL,
	`altitudeMeters` int NOT NULL,
	`speedMps` int NOT NULL,
	`batteryPercent` int NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telemetry_id` PRIMARY KEY(`id`)
);
