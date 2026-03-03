/**
 * Dashboard constants — Coming Soon page configs and route prefixes.
 */

import {
  Clock,
  FileText,
  FileCode,
  RefreshCw,
  DollarSign,
  Server,
  ShieldAlert,
  ArrowUpCircle,
  Rocket,
  BarChart3,
} from "lucide-react";

import type { ComingSoonConfig } from "./types";

export const COMING_SOON_PAGES: Readonly<Record<string, ComingSoonConfig>> = {
  // ---- Incidents ----
  "/dashboard/incidents/timeline": {
    title: "Incident Timeline",
    description:
      "Chronological incident correlation across services. See how failures cascade and identify blast radius automatically.",
    icon: <Clock className="w-8 h-8" />,
  },
  "/dashboard/incidents/postmortems": {
    title: "Automated Postmortems",
    description:
      "AI-generated postmortem drafts from incident data — root cause, timeline, and action items ready for review.",
    icon: <FileText className="w-8 h-8" />,
  },
  // ---- Infrastructure ----
  "/dashboard/infra/iac": {
    title: "IaC Reviews",
    description:
      "Automated review of Terraform, Pulumi, and CloudFormation changes before they hit production. Catch misconfigurations early.",
    icon: <FileCode className="w-8 h-8" />,
  },
  "/dashboard/infra/drift": {
    title: "Drift Detection",
    description:
      "Detect configuration drift between your IaC definitions and live infrastructure state. Stay in sync automatically.",
    icon: <RefreshCw className="w-8 h-8" />,
  },
  "/dashboard/infra/cost": {
    title: "Cost Analysis",
    description:
      "Infrastructure cost attribution and optimization recommendations. Identify underutilized resources and right-size workloads.",
    icon: <DollarSign className="w-8 h-8" />,
  },
  "/dashboard/infra": {
    title: "Infrastructure Intelligence",
    description:
      "IaC change review, drift detection, and cost analysis. Connect Terraform Cloud or your Kubernetes clusters to get started.",
    icon: <Server className="w-8 h-8" />,
    ctaLabel: "Go to Settings",
    ctaHref: "/dashboard/settings",
  },
  // ---- Deployments ----
  "/dashboard/deployments/risk": {
    title: "Deployment Risk Scores",
    description:
      "Pre-deploy risk scoring based on change scope, historical failure patterns, and dependency impact analysis.",
    icon: <ShieldAlert className="w-8 h-8" />,
  },
  "/dashboard/deployments/rollouts": {
    title: "Rollout Monitoring",
    description:
      "Canary rollout health analysis, automated rollback triggers, and progressive delivery insights across environments.",
    icon: <ArrowUpCircle className="w-8 h-8" />,
  },
  "/dashboard/deployments": {
    title: "Deployment Intelligence",
    description:
      "Pre-deploy risk scoring, canary rollout health analysis, and automated rollback triggers. Available once CI/CD data is flowing.",
    icon: <Rocket className="w-8 h-8" />,
    ctaLabel: "View CI/CD Pipelines",
    ctaHref: "/dashboard/cicd/pipelines",
  },
  // ---- Analytics & Integrations ----
  "/dashboard/analytics": {
    title: "Engineering Analytics",
    description:
      "DORA metrics, team health dashboards, and bottleneck identification — automatically calculated from your DevOps data.",
    icon: <BarChart3 className="w-8 h-8" />,
    ctaLabel: "View Analyses",
    ctaHref: "/dashboard/cicd/analyses",
  },
};

export const INVESTIGATIONS_PREFIX = "/dashboard/incidents/investigations/";
export const PIPELINES_PREFIX = "/dashboard/cicd/pipelines/";
export const ANALYSES_PREFIX = "/dashboard/cicd/analyses/";
