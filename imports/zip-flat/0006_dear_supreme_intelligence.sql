ALTER TABLE `defects` ADD `inspectionDomain` varchar(80);--> statement-breakpoint
ALTER TABLE `defects` ADD `coveragePercent` int;--> statement-breakpoint
ALTER TABLE `defects` ADD `uncertainty` json;--> statement-breakpoint
ALTER TABLE `defects` ADD `correlationKey` varchar(160);--> statement-breakpoint
ALTER TABLE `defects` ADD `reviewRequired` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `captureZone` varchar(80);--> statement-breakpoint
ALTER TABLE `evidence` ADD `headingDegrees` int;--> statement-breakpoint
ALTER TABLE `evidence` ADD `qualityStatus` enum('pending','pass','review','fail') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `evidence` ADD `imageQuality` json;--> statement-breakpoint
ALTER TABLE `missions` ADD `inspectionProfile` json;--> statement-breakpoint
ALTER TABLE `reports` ADD `inspectionScope` json;--> statement-breakpoint
ALTER TABLE `reports` ADD `signoff` json;