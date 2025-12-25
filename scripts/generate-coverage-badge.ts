/**
 * Coverage Badge Generator
 *
 * Reads jest coverage summary and updates README with coverage badge.
 * Run after `npm run test:coverage` to update the badge.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const COVERAGE_SUMMARY_PATH = join(process.cwd(), "coverage", "coverage-summary.json");
const README_PATH = join(process.cwd(), "README.md");

interface CoverageSummary {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
}

const getColor = (pct: number): string => {
  if (pct >= 80) return "brightgreen";
  if (pct >= 60) return "green";
  if (pct >= 40) return "yellow";
  if (pct >= 20) return "orange";
  return "red";
};

const generateBadgeUrl = (label: string, pct: number): string => {
  const color = getColor(pct);
  const encodedLabel = encodeURIComponent(label);
  const value = `${pct.toFixed(1)}%25`;
  // Use shields.io dynamic badge endpoint that can be updated
  return `https://img.shields.io/badge/${encodedLabel}-${value}-${color}?logo=jest`;
};

const main = (): void => {
  if (!existsSync(COVERAGE_SUMMARY_PATH)) {
    console.error("Coverage summary not found. Run `npm run test:coverage` first.");
    process.exit(1);
  }

  const summary: CoverageSummary = JSON.parse(readFileSync(COVERAGE_SUMMARY_PATH, "utf-8"));
  const { lines, statements, functions, branches } = summary.total;

  const coverageBadge = generateBadgeUrl("coverage", lines.pct);

  console.log("Coverage Summary:");
  console.log(`  Lines:      ${lines.pct.toFixed(1)}%`);
  console.log(`  Statements: ${statements.pct.toFixed(1)}%`);
  console.log(`  Branches:   ${branches.pct.toFixed(1)}%`);
  console.log(`  Functions:  ${functions.pct.toFixed(1)}%`);
  console.log("");
  console.log("Badge URLs:");
  console.log(`  Coverage:   ${coverageBadge}`);

  // Update README
  if (!existsSync(README_PATH)) {
    console.error("README.md not found.");
    process.exit(1);
  }

  let readme = readFileSync(README_PATH, "utf-8");

  // Pattern to match existing coverage badge line
  const coverageBadgePattern = /\[!\[Coverage\]\([^)]+\)\]\([^)]*\)/;
  const newCoverageBadge = `[![Coverage](${coverageBadge})](./coverage/lcov-report/index.html)`;

  if (coverageBadgePattern.test(readme)) {
    // Replace existing badge
    readme = readme.replace(coverageBadgePattern, newCoverageBadge);
    console.log("Updated existing coverage badge in README.");
  } else {
    // Add badge after the first line of badges (after [![CI])
    const ciPattern = /(\[!\[CI\]\([^)]+\)\]\([^)]+\))/;
    if (ciPattern.test(readme)) {
      readme = readme.replace(ciPattern, `$1\n${newCoverageBadge}`);
      console.log("Added coverage badge to README.");
    } else {
      console.log("Could not find CI badge to insert after. Please add badge manually.");
      console.log(`Badge markdown: ${newCoverageBadge}`);
    }
  }

  writeFileSync(README_PATH, readme);
  console.log("README.md updated successfully.");
};

main();
