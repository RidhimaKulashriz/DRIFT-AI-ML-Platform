ALTER TABLE `defects` ADD `inferenceModel` varchar(200);--> statement-breakpoint
ALTER TABLE `defects` ADD `inferenceSource` enum('production-cv','deterministic-fallback');--> statement-breakpoint
ALTER TABLE `defects` ADD `inferenceAnnotation` text;--> statement-breakpoint
ALTER TABLE `defects` ADD `inferenceCapturedAt` timestamp;--> statement-breakpoint
ALTER TABLE `evidence` ADD `source` enum('hardware','upload','simulator') DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `sha256` varchar(64);--> statement-breakpoint
ALTER TABLE `evidence` ADD `capturedAt` timestamp;--> statement-breakpoint
ALTER TABLE `evidence` ADD `cameraId` varchar(120);