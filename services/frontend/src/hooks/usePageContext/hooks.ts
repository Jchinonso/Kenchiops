/**
 * Page Context Hook
 *
 * Reads the current route and returns a ChatPageContext object
 * describing the page the user is viewing. Used by the Copilot
 * Drawer to provide relevant context to the chat backend.
 */

import { useMemo } from "react";
import { useLocation } from "react-router-dom";

interface ChatPageContext {
  readonly pageType: "analysis" | "incident" | "knowledge-base" | "overview" | "failures";
  readonly entityId?: string;
}

/**
 * Parses the current route pathname into a ChatPageContext.
 * Pure function — no side effects, deterministic output.
 */
const parsePageContext = (pathname: string): ChatPageContext => {
  // /dashboard/cicd/analyses/:id
  const analysisMatch = /^\/dashboard\/cicd\/analyses\/([^/]+)/.exec(pathname);
  if (analysisMatch) {
    return { pageType: "analysis", entityId: analysisMatch[1] };
  }

  // /dashboard/incidents/:id
  const incidentMatch = /^\/dashboard\/incidents\/([^/]+)/.exec(pathname);
  if (incidentMatch) {
    return { pageType: "incident", entityId: incidentMatch[1] };
  }

  // /dashboard/knowledge-base
  if (pathname.startsWith("/dashboard/knowledge-base")) {
    return { pageType: "knowledge-base" };
  }

  // /dashboard/cicd/failures
  if (pathname.startsWith("/dashboard/cicd/failures")) {
    return { pageType: "failures" };
  }

  return { pageType: "overview" };
};

export const usePageContext = (): ChatPageContext => {
  const { pathname } = useLocation();

  return useMemo(() => parsePageContext(pathname), [pathname]);
};
