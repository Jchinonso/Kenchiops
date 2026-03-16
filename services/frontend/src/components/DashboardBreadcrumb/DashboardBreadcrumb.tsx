/**
 * Dashboard Breadcrumb
 *
 * Path-based breadcrumb navigation for all dashboard sub-pages.
 * Uses the shadcn breadcrumb primitives with route-to-label mapping.
 * Shows "Dashboard" on overview, full path on sub-pages.
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
import { SEGMENT_LABELS } from "./constants";

// ==================== Component ====================

export const DashboardBreadcrumb = () => {
  const { pathname } = useLocation();

  const isOverview = pathname === "/dashboard";
  const segments = isOverview ? [] : pathname.replace("/dashboard/", "").split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    label: SEGMENT_LABELS[segment] ?? decodeURIComponent(segment),
    href: `/dashboard/${segments.slice(0, index + 1).join("/")}`,
  }));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {isOverview ? (
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          )}
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
