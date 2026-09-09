-- PHASE 10/14/15: Add campuses + campusLocations tables with verified IGDTUW + IIIT-Delhi data
-- Migration 0005

CREATE TYPE "public"."location_source" AS ENUM('image_exif', 'device_gps', 'verified_campus', 'user_selected', 'geocoded', 'unknown');--> statement-breakpoint

CREATE TABLE "campuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(220) NOT NULL UNIQUE,
	"shortName" varchar(40) NOT NULL UNIQUE,
	"description" text,
	"address" varchar(300),
	"city" varchar(80),
	"state" varchar(80),
	"country" varchar(80) DEFAULT 'India' NOT NULL,
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"website" varchar(300),
	"defaultImageUrl" text,
	"sourceUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "campusLocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"campusId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"locationType" varchar(80),
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"address" varchar(300),
	"sourceUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "assets" ADD COLUMN "campusId" integer;--> statement-breakpoint

ALTER TABLE "evidence" ADD COLUMN "locationSource" "location_source" DEFAULT 'unknown';--> statement-breakpoint

-- Insert IGDTUW (verified coordinates from public records)
INSERT INTO "campuses" ("id", "name", "shortName", "description", "address", "city", "state", "country", "latitude", "longitude", "website", "defaultImageUrl", "sourceUrl", "createdAt", "updatedAt")
VALUES (
  1,
  'Indira Gandhi Delhi Technical University for Women',
  'IGDTUW',
  'A premier women''s technical university in Delhi established in 1998 (formerly IGITW), located at Kashmere Gate, Delhi. Offers B.Tech, M.Tech, and PhD programs in engineering, technology, and applied sciences.',
  'Kashmere Gate, Near St. James Church',
  'New Delhi',
  'Delhi',
  'India',
  '28.6647',
  '77.2325',
  'https://www.igdtuw.ac.in/',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/IGDTUW_New_Delhi.jpg/800px-IGDTUW_New_Delhi.jpg',
  'https://en.wikipedia.org/wiki/Indira_Gandhi_Delhi_Technical_University_for_Women',
  NOW(),
  NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name,
  "shortName" = EXCLUDED."shortName",
  "description" = EXCLUDED.description,
  "address" = EXCLUDED.address,
  "latitude" = EXCLUDED.latitude,
  "longitude" = EXCLUDED.longitude,
  "website" = EXCLUDED.website,
  "defaultImageUrl" = EXCLUDED."defaultImageUrl",
  "sourceUrl" = EXCLUDED."sourceUrl",
  "updatedAt" = NOW();--> statement-breakpoint

-- Insert IIIT-Delhi (verified coordinates from public records)
INSERT INTO "campuses" ("id", "name", "shortName", "description", "address", "city", "state", "country", "latitude", "longitude", "website", "defaultImageUrl", "sourceUrl", "createdAt", "updatedAt")
VALUES (
  2,
  'Indraprastha Institute of Information Technology Delhi',
  'IIIT-Delhi',
  'A State University by the Government of NCT of Delhi, established in 2008. Focuses on Information Technology research and education. Located in Okhla Phase III, New Delhi.',
  'Okhla Phase III, Near Govindpuri Metro Station',
  'New Delhi',
  'Delhi',
  'India',
  '28.5444',
  '77.2725',
  'https://www.iiitd.ac.in/',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/IIIT-Delhi_Entrance.jpg/800px-IIIT-Delhi_Entrance.jpg',
  'https://en.wikipedia.org/wiki/IIIT-Delhi',
  NOW(),
  NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name,
  "shortName" = EXCLUDED."shortName",
  "description" = EXCLUDED.description,
  "address" = EXCLUDED.address,
  "latitude" = EXCLUDED.latitude,
  "longitude" = EXCLUDED.longitude,
  "website" = EXCLUDED.website,
  "defaultImageUrl" = EXCLUDED."defaultImageUrl",
  "sourceUrl" = EXCLUDED."sourceUrl",
  "updatedAt" = NOW();--> statement-breakpoint

-- Insert IGDTUW campus locations
INSERT INTO "campusLocations" ("id", "campusId", "name", "description", "locationType", "latitude", "longitude", "address", "sourceUrl", "createdAt", "updatedAt") VALUES
  (1, 1, 'IGDTUW Main Gate', 'Primary entrance to IGDTUW campus on Kashmere Gate road', 'entrance', '28.6651', '77.2333', 'Kashmere Gate, New Delhi', 'https://www.igdtuw.ac.in/', NOW(), NOW()),
  (2, 1, 'IGDTUW Main Building', 'Central academic and administrative building', 'building', '28.6643', '77.2320', 'IGDTUW Campus, Kashmere Gate', 'https://www.igdtuw.ac.in/', NOW(), NOW()),
  (3, 1, 'IGDTUW Internal Road', 'Internal campus road connecting main gate to academic blocks', 'road', '28.6647', '77.2328', 'IGDTUW Campus', 'https://www.igdtuw.ac.in/', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name,
  "description" = EXCLUDED.description,
  "latitude" = EXCLUDED.latitude,
  "longitude" = EXCLUDED.longitude,
  "updatedAt" = NOW();--> statement-breakpoint

-- Insert IIIT-Delhi campus locations
INSERT INTO "campusLocations" ("id", "campusId", "name", "description", "locationType", "latitude", "longitude", "address", "sourceUrl", "createdAt", "updatedAt") VALUES
  (4, 2, 'IIIT-Delhi Main Entrance', 'Primary entrance to IIIT-Delhi campus in Okhla Phase III', 'entrance', '28.5447', '77.2730', 'Okhla Phase III, New Delhi', 'https://www.iiitd.ac.in/', NOW(), NOW()),
  (5, 2, 'IIIT-Delhi Academic Block', 'Main academic block housing lecture halls and labs', 'building', '28.5441', '77.2720', 'IIIT-Delhi Campus, Okhla Phase III', 'https://www.iiitd.ac.in/', NOW(), NOW()),
  (6, 2, 'IIIT-Delhi Library Bridge', 'Connecting bridge between academic block and library', 'bridge', '28.5445', '77.2728', 'IIIT-Delhi Campus', 'https://www.iiitd.ac.in/', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name,
  "description" = EXCLUDED.description,
  "latitude" = EXCLUDED.latitude,
  "longitude" = EXCLUDED.longitude,
  "updatedAt" = NOW();
