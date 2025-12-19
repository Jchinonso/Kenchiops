#!/usr/bin/env tsx
/**
 * Build validation script.
 * Checks that all packages have been built correctly.
 */

import { existsSync } from "fs";
import { join } from "path";

interface PackageCheck {
  name: string;
  distPath: string;
  required: boolean;
}

const packages: PackageCheck[] = [
  {
    name: "@kenchi/shared",
    distPath: "packages/shared/dist",
    required: true,
  },
  {
    name: "@kenchi/api",
    distPath: "services/api/dist",
    required: false,
  },
  {
    name: "@kenchi/slack-bot",
    distPath: "services/slack-bot/dist",
    required: false,
  },
  {
    name: "@kenchi/github-app",
    distPath: "services/github-app/dist",
    required: false,
  },
];

function checkBuilds(): boolean {
  console.log("🔍 Checking build status...\n");

  let allGood = true;

  for (const pkg of packages) {
    const indexPath = join(pkg.distPath, "index.js");
    const hasBuild = existsSync(indexPath);

    if (hasBuild) {
      console.log(`✅ ${pkg.name}: built`);
    } else {
      if (pkg.required) {
        console.log(`❌ ${pkg.name}: NOT BUILT (required)`);
        allGood = false;
      } else {
        console.log(`⚠️  ${pkg.name}: not built (optional)`);
      }
    }
  }

  console.log("");

  if (!allGood) {
    console.error("❌ Required packages are not built.");
    console.error("Run: npm run build:shared\n");
    return false;
  }

  console.log("✅ All required builds are present!\n");
  return true;
}

if (!checkBuilds()) {
  process.exit(1);
}
