/**
 * GitHub App Setup Routes
 *
 * Handles the post-installation redirect from GitHub.
 * When a user installs the GitHub App from a Slack-provided link,
 * the state parameter contains the Slack workspace ID for tenant linking.
 */

import { Router, type Request, type Response } from "express";
import {
  createLogger,
  HTTP_STATUS,
  GITHUB_SETUP_CONFIG,
  findBySlackWorkspace,
  findByGitHubInstallation,
  linkSlackWorkspace,
  getErrorMessage,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("github-app");

/**
 * Build success HTML page
 */
const buildSuccessHtml = (
  orgName: string,
  workspaceName: string | null,
  isLinked: boolean
): string => `
<!DOCTYPE html>
<html>
<head>
  <title>Kenchi - GitHub App Installed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .success { color: #22c55e; }
    .pending { color: #f59e0b; }
    h1 { margin-top: 0; }
    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #4A154B;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      margin-top: 16px;
    }
    .btn:hover { background: #611f69; }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="success">GitHub App Installed!</h1>

    <div class="status-item">
      <span>&#x2705;</span>
      <span><strong>GitHub:</strong> ${orgName}</span>
    </div>

    <div class="status-item">
      <span>${isLinked ? "&#x2705;" : "&#x23F3;"}</span>
      <span><strong>Slack:</strong> ${isLinked ? workspaceName : "Pending connection"}</span>
    </div>

    ${
      isLinked
        ? `<p>Kenchi is now active! CI failure alerts will be sent to your Slack workspace.</p>`
        : `<p>To complete setup, install the Slack app in your workspace.</p>
         <a href="/slack/install" class="btn">Install Slack App</a>`
    }
  </div>
</body>
</html>
`;

/**
 * GET /github/setup
 *
 * GitHub redirects here after app installation.
 * Query params:
 * - installation_id: The new GitHub App installation ID
 * - setup_action: "install" or "update"
 * - state: Optional Slack workspace ID for tenant linking
 */
router.get("/github/setup", async (req: Request, res: Response) => {
  const { installation_id, setup_action, state } = req.query;

  logger.info("GitHub App setup redirect received", {
    installationId: installation_id,
    setupAction: setup_action,
    hasState: !!state,
  });

  // Validate installation_id
  if (!installation_id || typeof installation_id !== "string") {
    res.status(HTTP_STATUS.BAD_REQUEST).send(`
      <html>
        <body>
          <h1>Invalid Setup Request</h1>
          <p>Missing installation ID. Please try installing again.</p>
        </body>
      </html>
    `);
    return;
  }

  const installationIdNum = parseInt(installation_id, 10);
  if (Number.isNaN(installationIdNum)) {
    res.status(HTTP_STATUS.BAD_REQUEST).send(`
      <html>
        <body>
          <h1>Invalid Installation ID</h1>
          <p>Please try installing again.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    // Find the tenant that was just created by the installation webhook
    const tenant = await findByGitHubInstallation(installationIdNum);

    if (!tenant) {
      // Webhook hasn't been processed yet, or installation failed
      logger.warn("Tenant not found for installation", { installationId: installationIdNum });
      res.status(HTTP_STATUS.OK).send(`
        <html>
          <body>
            <h1>Installation Processing</h1>
            <p>Your installation is being processed. Please wait a moment and refresh.</p>
            <script>setTimeout(() => location.reload(), ${GITHUB_SETUP_CONFIG.RELOAD_DELAY_MS});</script>
          </body>
        </html>
      `);
      return;
    }

    let isLinked = !!tenant.slackWorkspaceId;
    let { slackTeamName } = tenant;

    // If state contains Slack workspace ID and tenant isn't already linked
    if (state && typeof state === "string" && !tenant.slackWorkspaceId) {
      const slackWorkspaceId = state;

      // Find Slack workspace tenant (if installed Slack first)
      const slackTenant = await findBySlackWorkspace(slackWorkspaceId);

      if (slackTenant && slackTenant.slackBotToken) {
        // We have both! Link them together by updating the GitHub tenant with Slack info
        // This handles the case where Slack was installed first
        logger.info("Linking GitHub installation to existing Slack workspace", {
          githubTenantId: tenant.id,
          slackTenantId: slackTenant.id,
          slackWorkspaceId,
        });

        // Update the GitHub tenant with Slack details
        // Note: slackWorkspaceId must exist since we found slackTenant by it
        // slackBotToken was checked in the if condition above
        await linkSlackWorkspace({
          tenantId: tenant.id,
          slackWorkspaceId: slackTenant.slackWorkspaceId ?? slackWorkspaceId,
          slackTeamName: slackTenant.slackTeamName ?? "",
          slackBotToken: slackTenant.slackBotToken,
          slackBotUserId: slackTenant.slackBotUserId || undefined,
        });

        isLinked = true;
        slackTeamName = slackTenant.slackTeamName;

        logger.info("Successfully linked GitHub and Slack", {
          tenantId: tenant.id,
          githubOrg: tenant.githubOrg,
          slackWorkspace: slackWorkspaceId,
        });
      } else {
        // Store the Slack workspace ID for later linking
        // The tenant service will pick this up when Slack is installed
        logger.info("Slack workspace not found, will link when Slack is installed", {
          tenantId: tenant.id,
          slackWorkspaceId,
        });
      }
    }

    // Send success page
    const html = buildSuccessHtml(tenant.githubOrg, slackTeamName || null, isLinked);
    res.status(HTTP_STATUS.OK).send(html);
  } catch (error) {
    logger.error("Error processing GitHub setup", {
      error: getErrorMessage(error),
      installationId: installationIdNum,
    });

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(`
      <html>
        <body>
          <h1>Setup Error</h1>
          <p>An error occurred during setup. Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

export { router as setupRoutes };
