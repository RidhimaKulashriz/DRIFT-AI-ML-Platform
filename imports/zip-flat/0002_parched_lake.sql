CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`defectId` int NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`title` varchar(180) NOT NULL,
	`message` text NOT NULL,
	`status` enum('open','acknowledged','dismissed') NOT NULL DEFAULT 'open',
	`acknowledgedBy` int,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
