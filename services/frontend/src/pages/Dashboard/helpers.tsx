/**
 * Dashboard routing helpers — determine which sub-page to render.
 *
 * Route tables are ordered most-specific prefix first. The `find()` call
 * matches the first entry whose prefix starts with the given pathname,
 * then delegates to the entry's render function.
 */

import { ActiveIncidents } from "@/pages/ActiveIncidents";
import { Investigations } from "@/pages/Investigations";
import { NewInvestigation } from "@/pages/NewInvestigation";
import { InvestigationDetail } from "@/pages/InvestigationDetail";
import { CICDAnalyses } from "@/pages/CICDAnalyses";
import { CICDPipelines } from "@/pages/CICDPipelines";
import { WebhookActivity } from "@/pages/WebhookActivity";
import { RepositoryDetail } from "@/pages/RepositoryDetail";
import { AnalysisDetail } from "@/pages/AnalysisDetail";

import type { ComingSoonConfig } from "./types";
import {
  COMING_SOON_PAGES,
  INVESTIGATIONS_PREFIX,
  PIPELINES_PREFIX,
  ANALYSES_PREFIX,
} from "./constants";

type RouteResolver = (pathname: string, refreshKey: number) => React.ReactNode;

// ==================== Coming Soon ====================

export const findComingSoonConfig = (pathname: string): ComingSoonConfig | undefined =>
  COMING_SOON_PAGES[pathname] ??
  Object.entries(COMING_SOON_PAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];

// ==================== Route Predicates ====================

export const isCICDRoute = (pathname: string): boolean => pathname.startsWith("/dashboard/cicd");
export const isIncidentRoute = (pathname: string): boolean =>
  pathname.startsWith("/dashboard/incidents");

// ==================== Incident Routes ====================

const INCIDENT_ROUTES: ReadonlyArray<readonly [string, RouteResolver]> = [
  ["/dashboard/incidents/investigations/new", () => <NewInvestigation />],
  [
    INVESTIGATIONS_PREFIX,
    (pathname, refreshKey) => {
      const investigationId = decodeURIComponent(pathname.slice(INVESTIGATIONS_PREFIX.length));
      return <InvestigationDetail investigationId={investigationId} refreshKey={refreshKey} />;
    },
  ],
  [
    "/dashboard/incidents/investigations",
    (_, refreshKey) => <Investigations refreshKey={refreshKey} />,
  ],
  ["/dashboard/incidents/active", (_, refreshKey) => <ActiveIncidents refreshKey={refreshKey} />],
];

export const renderIncidentPage = (pathname: string, refreshKey: number): React.ReactNode => {
  // Exact base path → active incidents
  if (pathname === "/dashboard/incidents") {
    return <ActiveIncidents refreshKey={refreshKey} />;
  }
  const match = INCIDENT_ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1](pathname, refreshKey) : null;
};

// ==================== CI/CD Routes ====================

const CICD_ROUTES: ReadonlyArray<readonly [string, RouteResolver]> = [
  ["/dashboard/cicd/failures", (_, refreshKey) => <CICDAnalyses refreshKey={refreshKey} />],
  [
    ANALYSES_PREFIX,
    (pathname, refreshKey) => {
      const analysisId = decodeURIComponent(pathname.slice(ANALYSES_PREFIX.length));
      return <AnalysisDetail analysisId={analysisId} refreshKey={refreshKey} />;
    },
  ],
  ["/dashboard/cicd/analyses", (_, refreshKey) => <CICDAnalyses refreshKey={refreshKey} />],
  [
    PIPELINES_PREFIX,
    (pathname, refreshKey) => {
      const repoFullName = decodeURIComponent(pathname.slice(PIPELINES_PREFIX.length));
      return <RepositoryDetail repoFullName={repoFullName} refreshKey={refreshKey} />;
    },
  ],
  ["/dashboard/cicd/pipelines", () => <CICDPipelines />],
  ["/dashboard/cicd/webhooks", (_, refreshKey) => <WebhookActivity refreshKey={refreshKey} />],
];

export const renderCICDPage = (pathname: string, refreshKey: number): React.ReactNode => {
  const match = CICD_ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1](pathname, refreshKey) : <CICDAnalyses refreshKey={refreshKey} />;
};
