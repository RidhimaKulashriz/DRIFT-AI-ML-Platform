CREATE TABLE `inspectionCorrelations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`correlationKey` varchar(160) NOT NULL,
	`missionId` int NOT NULL,
	`assetId` int,
	`evidenceId` int,
	`defectId` int,
	`telemetryId` int,
	`relationType` enum('evidence','finding','telemetry') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inspectionCorrelations_id` PRIMARY KEY(`id`)
);
