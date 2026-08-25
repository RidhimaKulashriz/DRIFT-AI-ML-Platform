const baseUrl = process.env.DRIFT_BASE_URL ?? "http://127.0.0.1:3000";

async function request(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function assertStatus(actual, expected, label) {
  if (actual.status !== expected) throw new Error(`${label}: expected ${expected}, received ${actual.status}`);
  console.log(`PASS ${label} (${actual.status})`);
}

const telemetry = { missionId: 120001, latitude: 28.61, longitude: 77.2, altitude: 40, speedMps: 8, batteryPercent: 92, timestamp: Date.now() };
const evidence = { missionId: 120001, fileName: "bridge-frame.jpg", mimeType: "image/jpeg", mediaKind: "photo", base64: "data:image/jpeg;base64,AA==" };

assertStatus(await request("/api/drift/telemetry", telemetry), 401, "telemetry rejects missing bridge credentials");
assertStatus(await request("/api/drift/evidence", evidence), 401, "evidence rejects missing bridge credentials");

const token = process.env.DRIFT_INGEST_TOKEN;
if (!token) {
  console.log("SKIP authenticated persistence checks: DRIFT_INGEST_TOKEN is not configured in this shell.");
  process.exit(0);
}

assertStatus(await request("/api/drift/telemetry", { missionId: 120001, latitude: 95, longitude: 77.2, altitude: 40, speedMps: 8, batteryPercent: 92, timestamp: Date.now() }, { authorization: `Bearer ${token}` }), 400, "telemetry rejects invalid coordinates");
assertStatus(await request("/api/drift/evidence", { ...evidence, mimeType: "application/octet-stream" }, { authorization: `Bearer ${token}` }), 400, "evidence rejects unsupported media");
console.log("PASS authenticated negative-path bridge checks");
