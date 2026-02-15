/**
 * Dashboard Breadcrumb
 *
 * Path-based breadcrumb navigation for all dashboard sub-pages.
 * Uses the shadcn breadcrumb primitives with route-to-label mapping.
 * Hidden on the overview page (it's the root).
 */

import { Fragment } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// ==================== Route Labels ====================

const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  cicd: "CI/CD",
  failures: "Failures",
  analyses: "Analyses",
  pipelines: "Pipelines",
  incidents: "Incidents",
  active: "Active",
  timeline: "Timeline",
  postmortems: "Postmortems",
  infra: "Infrastructure",
  iac: "IaC Reviews",
  drift: "Drift",
  cost: "Cost",
  deployments: "Deployments",
  risk: "Risk Scores",
  rollouts: "Rollouts",
  analytics: "Analytics",
  integrations: "Integrations",
  settings: "Settings",
};

// ==================== Component ====================

export const DashboardBreadcrumb = () => {
  const { pathname } = useLocation();

  if (pathname === "/dashboard") {
    return null;
  }

  const segments = pathname.replace("/dashboard/", "").split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    label: SEGMENT_LABELS[segment] ?? decodeURIComponent(segment),
    href: `/dashboard/${segments.slice(0, index + 1).join("/")}`,
  }));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
