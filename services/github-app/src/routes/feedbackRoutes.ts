/**
 * Feedback Routes
 *
 * Handles user feedback on CI failure analyses via signed URLs.
 * Feedback is recorded with deduplication (one vote per user per analysis).
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  parseFeedbackUrl,
  createOrUpdateAnalysisFeedback,
  getLatestAnalysisByAggregationKey,
  ingestAnalysisLesson,
  getErrorMessage,
  config,
  UI_EMOJI,
  AppError,
  rateLimitByCategory,
  type AnalysisFeedbackType,
  type AnalysisLessonContext,
} from "@kenchi/shared";

const router = Router();
const feedbackLogger = createLogger("github-app");

/**
 * Feedback type mapping from URL parameter to database type.
 */
const FEEDBACK_TYPE_MAP: Readonly<Record<string, AnalysisFeedbackType>> = {
  correct: "correct",
  incorrect: "incorrect",
};

/**
 * Get the feedback signing secret from config.
 */
const getFeedbackSecret = (): string => {
  const secret = config.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError(
      "No webhook secret configured for feedback URL signing",
      "MISSING_CONFIG",
      500,
      true,
      { operation: "getFeedbackSecret" }
    );
  }
  return secret;
};

/**
 * Extract user identifier from request.
 * Uses GitHub username from OAuth if available, otherwise uses IP hash.
 */
const getUserIdentifier = (req: Request): string => {
  // Check for GitHub OAuth user (to be implemented with full OAuth flow)
  const githubUser = req.headers["x-github-user"] as string | undefined;
  if (githubUser) {
    return `github:${githubUser}`;
  }

  // Fallback to IP-based identifier (take first IP from x-forwarded-for chain)
  const raw = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const fullIp = Array.isArray(raw) ? raw[0] : raw;
  const clientIp = fullIp.split(",")[0].trim();
  return `ip:${clientIp}`.slice(0, 50);
};

/**
 * Generate HTML response for feedback confirmation.
 */
const generateFeedbackHtml = (
  isSuccess: boolean,
  message: string,
  wasUpdated: boolean = false
): string => {
  const emoji = isSuccess ? UI_EMOJI.success : UI_EMOJI.failure;
  const title = isSuccess ? "Feedback Recorded" : "Feedback Error";
  const statusMessage = wasUpdated ? " (updated your previous vote)" : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - KenchiOps</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .card {
      background: white;
      padding: 2rem 3rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    .emoji { font-size: 3rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem; color: #333; font-size: 1.5rem; }
    p { color: #666; margin: 0; line-height: 1.5; }
    .status { color: #888; font-size: 0.9rem; margin-top: 0.5rem; }
    .close-hint { margin-top: 1.5rem; font-size: 0.85rem; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${statusMessage ? `<p class="status">${statusMessage}</p>` : ""}
    <p class="close-hint">You can close this tab now.</p>
  </div>
</body>
</html>`;
};

/**
 * GET /api/feedback
 * Handle feedback submission via signed URL.
 * Records feedback with deduplication.
 */
router.get(
  "/api/feedback",
  rateLimitByCategory("standard"),
  asyncHandler(async (req: Request, res: Response) => {
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    try {
      const secret = getFeedbackSecret();
      const params = await parseFeedbackUrl(fullUrl, secret);

      if (!params) {
        feedbackLogger.warn("Invalid or expired feedback URL", {
          url: req.originalUrl,
          reconstructedUrl: fullUrl,
          hasAnalysisId: Boolean(req.query.analysisId),
          hasType: Boolean(req.query.type),
          hasExpires: Boolean(req.query.expires),
          hasSig: Boolean(req.query.sig),
        });

        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .send(generateFeedbackHtml(false, "This feedback link is invalid or has expired."));
        return;
      }

      const userId = getUserIdentifier(req);
      const feedbackType = FEEDBACK_TYPE_MAP[params.feedbackType];

      if (!feedbackType) {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .send(generateFeedbackHtml(false, "Invalid feedback type."));
        return;
      }

      // Resolve composite key (repo:commitSha) to actual analysis ID.
      // The feedback URL uses "owner/repo:commitSha" but the DB uses "ana_" IDs.
      const rawId = params.analysisId;
      const aggregationKey = rawId.includes(":") ? rawId.split(":")[0] : rawId;
      const analysis = await getLatestAnalysisByAggregationKey(aggregationKey);

      if (!analysis) {
        feedbackLogger.warn("Analysis not found for feedback", { rawId, aggregationKey });
        res
          .status(HTTP_STATUS.NOT_FOUND)
          .send(generateFeedbackHtml(false, "The analysis for this feedback was not found."));
        return;
      }

      // Record feedback with deduplication
      const tenantId = analysis.tenantId ?? req.context?.tenantId ?? "unknown";
      const result = await createOrUpdateAnalysisFeedback({
        analysisId: analysis.id,
        feedbackType,
        userId,
        tenantId,
      });

      // Trigger lesson ingestion on positive feedback
      let lessonIngested = false; // let: set to true if ingestion succeeds
      if (feedbackType === "correct") {
        try {
          const lessonContext: AnalysisLessonContext = {
            repository: analysis.aggregationKey ?? aggregationKey,
            commitSha: analysis.headSha ?? rawId.split(":")[1] ?? "unknown",
            failures: [
              {
                checkRunId: 0,
                checkName: analysis.ciProvider ?? "CI",
                conclusion: "failure",
                analysis:
                  typeof analysis.fullAnalysis === "string"
                    ? analysis.fullAnalysis
                    : JSON.stringify(analysis.fullAnalysis),
                identifiedCause: analysis.identifiedCause ?? analysis.summary,
                confidence: analysis.diagnosisConfidence ?? 0.7,
                annotations: [],
                recommendedActions: (analysis.recommendedActions ?? []).map((action) => ({
                  description: action,
                  priority: "medium" as const,
                })),
                testFailures: [],
                timestamp: analysis.createdAt,
              },
            ],
            tenantId: analysis.tenantId ?? undefined,
            confirmedBy: userId,
          };
          const lessonResult = await ingestAnalysisLesson(lessonContext);
          lessonIngested = lessonResult.success;
          feedbackLogger.info("Lesson ingested from thumbs-up", {
            analysisId: analysis.id,
            lessonsCreated: lessonResult.lessonsCreated,
          });
        } catch (lessonError: unknown) {
          feedbackLogger.warn("Lesson ingestion failed from thumbs-up", {
            analysisId: analysis.id,
            error: getErrorMessage(lessonError),
          });
        }
      }

      feedbackLogger.info("Feedback recorded via URL", {
        analysisId: analysis.id,
        aggregationKey,
        feedbackType,
        userId,
        wasUpdated: result.wasUpdated,
        lessonIngested,
      });

      const message =
        feedbackType === "correct"
          ? lessonIngested
            ? "Thanks! Your feedback has been recorded and the analysis was added to the Knowledge Base."
            : "Thanks! Your feedback helps improve our analysis accuracy."
          : "Thanks for letting us know. We'll use this to improve.";

      res.status(HTTP_STATUS.OK).send(generateFeedbackHtml(true, message, result.wasUpdated));
    } catch (error) {
      feedbackLogger.error("Failed to process feedback", {
        error: getErrorMessage(error),
        url: req.originalUrl,
      });

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send(generateFeedbackHtml(false, "An error occurred while recording your feedback."));
    }
  })
);

export { router as feedbackRoutes };
