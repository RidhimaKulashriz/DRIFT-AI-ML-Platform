/**
 * Seed script: populate the database with demo contractors, assets, and a mission.
 * Run once: npx tsx server/seedDemoData.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. Set it in .env");
    process.exit(1);
  }

  const db = drizzle(databaseUrl);
  console.log("[Seed] Connected to database");

  // 1. Create contractors (if not exist)
  const existingContractors = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM contractors`
  );

  if (Number(existingContractors.rows[0].count) === 0) {
    console.log("[Seed] Creating demo contractors...");

    await db.execute(
      sql`INSERT INTO contractors (legalName, externalReference, status, createdat, updatedat)
          VALUES
            ('Manu — IGDTUW Campus', 'igdtuw-manu', 'active', NOW(), NOW()),
            ('Ridhima Kulashriz — IIIT-Delhi', 'iiitd-ridhima', 'active', NOW(), NOW())`
    );
    console.log("[Seed] Created 2 contractors");
  } else {
    console.log(`[Seed] ${existingContractors.rows[0].count} contractors already exist, skipping`);
  }

  // 2. Create demo assets for both campuses
  const existingAssets = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM assets`
  );

  if (Number(existingAssets.rows[0].count) === 0) {
    console.log("[Seed] Creating demo assets...");

    await db.execute(
      sql`INSERT INTO assets (name, assetType, locality, latitude, longitude, criticality, status, createdat, updatedat)
          VALUES
            ('IGDTUW Campus — Main Building', 'building', 'IGDTUW, New Delhi', '28.6876', '77.2100', 4, 'watch', NOW(), NOW()),
            ('IGDTUW Campus — Main Road', 'road', 'IGDTUW, New Delhi', '28.6880', '77.2110', 3, 'operational', NOW(), NOW()),
            ('IIIT-Delhi Campus — Academic Block', 'building', 'IIIT-Delhi, New Delhi', '28.5449', '77.2750', 5, 'watch', NOW(), NOW()),
            ('IIIT-Delhi Campus — Access Road', 'road', 'IIIT-Delhi, New Delhi', '28.5440', '77.2740', 3, 'operational', NOW(), NOW()),
            ('Delhi Ring Road — connecting corridor', 'road', 'New Delhi', '28.6163', '77.2425', 3, 'operational', NOW(), NOW())`
    );
    console.log("[Seed] Created 5 assets");
  } else {
    console.log(`[Seed] ${existingAssets.rows[0].count} assets already exist, skipping`);
  }

  // 3. Create a demo mission
  const existingMissions = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM missions`
  );

  if (Number(existingMissions.rows[0].count) === 0) {
    console.log("[Seed] Creating demo mission...");

    await db.execute(
      sql`INSERT INTO missions (assetId, name, mode, status, startedat, completedat, createdat, updatedat)
          VALUES (1, 'Demo inspection scan', 'demo', 'completed', NOW(), NOW(), NOW(), NOW())`
    );
    console.log("[Seed] Created demo mission");
  } else {
    console.log(`[Seed] ${existingMissions.rows[0].count} missions already exist, skipping`);
  }

  console.log("[Seed] Done! Database is ready for demo detections.");
  process.exit(0);
}

seed().catch((error) => {
  console.error("[Seed] Failed:", error);
  process.exit(1);
});
