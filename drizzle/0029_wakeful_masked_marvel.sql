CREATE TABLE `public_forecast_provenance_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationKey` varchar(32) NOT NULL,
	`date` varchar(10) NOT NULL,
	`serviceName` varchar(64) NOT NULL,
	`status` enum('official','fallback','unavailable') NOT NULL,
	`provider` varchar(96),
	`upstreamModels` json,
	`fallbackReason` varchar(255),
	`officialConfigured` int NOT NULL DEFAULT 0,
	`shadowMode` int NOT NULL DEFAULT 1,
	`appliedToProduction` int NOT NULL DEFAULT 0,
	`checkedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_forecast_provenance_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_forecast_provenance_location_date_service_unique` UNIQUE(`locationKey`,`date`,`serviceName`)
);
