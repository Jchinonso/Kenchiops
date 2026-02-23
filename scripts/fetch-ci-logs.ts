/**
 * Script to fetch CI logs from GitHub for debugging/analysis.
 *
 * Usage: npx ts-node scripts/fetch-ci-logs.ts <owner> <repo> <runId>
 * Example: npx ts-node scripts/fetch-ci-logs.ts kenchiops Kenchiops 20922586134
 */

// eslint-disable-next-line no-restricted-imports -- standalone CLI script, not a service
import { Octokit } from "@octokit/rest";
// eslint-disable-next-line no-restricted-imports -- standalone CLI script, not a service
import { createAppAuth } from "@octokit/auth-app";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { createLogger, ValidationError, config } from "@kenchi/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger("fetch-ci-logs");

const { GITHUB_APP_ID } = config;
const GITHUB_APP_PRIVATE_KEY = config.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const { GITHUB_INSTALLATION_ID } = config;

const fetchLogs = async (owner: string, repo: string, runId: number): Promise<void> => {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_INSTALLATION_ID) {
    throw new ValidationError("Missing GitHub App credentials in .env");
  }

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
      installationId: Number(GITHUB_INSTALLATION_ID),
    },
  });

  logger.info("Fetching workflow run", { runId, owner, repo });

  const { data: run } = await octokit.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });

  logger.info("Workflow details", {
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
  });

  const { data: jobsData } = await octokit.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });

  const outputDir = path.join(__dirname, "../logs");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let combinedLogs = "";

  const fetchJobLogs = async (job: (typeof jobsData.jobs)[0]): Promise<void> => {
    logger.info("Processing job", {
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
    });

    try {
      const { data: logs } = await octokit.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: job.id,
      });

      const logContent = typeof logs === "string" ? logs : String(logs);
      const jobLogFile = path.join(outputDir, `${runId}_${job.name.replace(/\s+/g, "_")}.log`);

      fs.writeFileSync(jobLogFile, logContent);
      logger.info("Saved job logs", { file: jobLogFile, bytes: logContent.length });

      combinedLogs += `\n\n${"=".repeat(80)}\n`;
      combinedLogs += `JOB: ${job.name} (${job.conclusion})\n`;
      combinedLogs += `${"=".repeat(80)}\n\n`;
      combinedLogs += logContent;
    } catch (error) {
      logger.error("Failed to fetch logs for job", { jobName: job.name, error });
    }
  };

  await Promise.all(jobsData.jobs.map(fetchJobLogs));

  const combinedLogFile = path.join(outputDir, `${runId}_combined.log`);
  fs.writeFileSync(combinedLogFile, combinedLogs);
  logger.info("Saved combined logs", { file: combinedLogFile, bytes: combinedLogs.length });
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    logger.info("Usage: npx ts-node scripts/fetch-ci-logs.ts <owner> <repo> <runId>");
    logger.info("Example: npx ts-node scripts/fetch-ci-logs.ts kenchiops Kenchiops 20922586134");
    process.exit(1);
  }

  const [owner, repo, runIdStr] = args;
  const runId = parseInt(runIdStr, 10);

  try {
    await fetchLogs(owner, repo, runId);
    logger.info("Done!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Error fetching logs", { message: errorMessage, stack: errorStack });
    process.exit(1);
  }
};

main();
