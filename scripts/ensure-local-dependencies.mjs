#!/usr/bin/env node
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

const requiredPackages = ["three", "hls.js", "react", "react-dom"];
const missing = requiredPackages.filter((name) => !existsSync(`node_modules/${name}/package.json`));

if (missing.length === 0) {
  console.log("Frontend dependencies are ready.");
  process.exit(0);
}

console.warn(`Missing frontend dependencies: ${missing.join(", ")}`);
console.log("Running pnpm install from the committed lockfile...");

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
try {
  execFileSync(pnpm, ["install", "--frozen-lockfile"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
} catch (error) {
  console.error("Could not install frontend dependencies. Run `pnpm install` in the repository root and retry.");
  process.exit(error?.status || 1);
}

for (const name of missing) {
  if (!existsSync(`node_modules/${name}/package.json`)) {
    console.error(`Dependency ${name} is still unavailable after pnpm install.`);
    process.exit(1);
  }
}
console.log("Frontend dependencies repaired successfully.");
