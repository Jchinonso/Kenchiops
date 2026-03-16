/**
 * Unit tests for AnalysisDetailContent components.
 *
 * Tests for SectionCard, ConfidenceBar, DetailSkeleton, and DetailContent.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import {
  SectionCard,
  ConfidenceBar,
  DetailSkeleton,
  DetailContent,
} from "@/components/AnalysisDetailContent";

// Mock FeedbackSection to avoid render-loop from useMyFeedback in React 19
vi.mock("@/components/FeedbackSection", () => ({
  FeedbackSection: () => <div data-testid="feedback-section">Feedback</div>,
}));

// Mock Collapsible at the shadcn wrapper level using React context
vi.mock("@/components/ui/collapsible", () => {
  const CollapsibleCtx = React.createContext<{
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }>({});

  const Collapsible = ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <CollapsibleCtx.Provider value={{ open, onOpenChange }}>
      <div data-open={open}>{children}</div>
    </CollapsibleCtx.Provider>
  );

  const CollapsibleTrigger = ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { open, onOpenChange } = React.useContext(CollapsibleCtx);
    return (
      <button type="button" {...props} onClick={() => onOpenChange?.(!open)}>
        {children}
      </button>
    );
  };

  const CollapsibleContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = React.useContext(CollapsibleCtx);
    return open ? <div>{children}</div> : null;
  };

  return { Collapsible, CollapsibleTrigger, CollapsibleContent };
});

// Mock formatters
vi.mock("@/lib/formatters", () => ({
  getConfidenceLabel: (value: number) => (value >= 0.8 ? "High" : value >= 0.5 ? "Medium" : "Low"),
  getConfidenceStyle: (value: number) =>
    value >= 0.8 ? "text-green-700" : value >= 0.5 ? "text-amber-700" : "text-red-700",
  flattenSignalEntries: (signals: Record<string, unknown>) =>
    Object.entries(signals).map(([k, v]) => [k, String(v)]),
}));

const mockAnalysis = {
  id: "analysis-1",
  tenantId: "tenant-1",
  aggregationKey: "repo:org/repo",
  summary: "Test summary of the analysis",
  identifiedCause: "Memory leak in auth module",
  diagnosisConfidence: 0.85,
  actionConfidence: 0.72,
  recommendedActions: ["Increase memory limit", "Fix leak in auth.ts"],
  confidenceSignals: { logQuality: "good", errorClarity: "high" },
  eventId: "event-123",
  fullAnalysis: { raw: "data" },
  createdAt: "2026-02-17T00:00:00Z",
  severity: "high" as const,
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe("SectionCard", () => {
  it("renders icon, title, and children", () => {
    render(
      <SectionCard icon={<span data-testid="icon">I</span>} title="Test Section">
        <p>Section content</p>
      </SectionCard>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Test Section")).toBeInTheDocument();
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });
});

describe("ConfidenceBar", () => {
  it("renders label and percentage", () => {
    render(<ConfidenceBar label="Diagnosis" value={0.85} />);
    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });

  it("renders low confidence correctly", () => {
    render(<ConfidenceBar label="Action" value={0.3} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText(/Low/)).toBeInTheDocument();
    expect(screen.getByText(/30%/)).toBeInTheDocument();
  });
});

describe("DetailSkeleton", () => {
  it("renders skeleton elements", () => {
    const { container } = render(<DetailSkeleton />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });
});

describe("DetailContent", () => {
  it("renders summary section", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Test summary of the analysis")).toBeInTheDocument();
  });

  it("renders root cause section", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Root Cause")).toBeInTheDocument();
    expect(screen.getByText("Memory leak in auth module")).toBeInTheDocument();
  });

  it("shows 'No root cause identified' when identifiedCause is null", () => {
    render(
      <Wrapper>
        <DetailContent analysis={{ ...mockAnalysis, identifiedCause: null }} />
      </Wrapper>
    );
    expect(screen.getByText("No root cause identified")).toBeInTheDocument();
  });

  it("renders confidence bars", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("hides action confidence when null", () => {
    render(
      <Wrapper>
        <DetailContent analysis={{ ...mockAnalysis, actionConfidence: null }} />
      </Wrapper>
    );
    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("renders recommended actions as ordered list", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Recommended Actions")).toBeInTheDocument();
    expect(screen.getByText("Increase memory limit")).toBeInTheDocument();
    expect(screen.getByText("Fix leak in auth.ts")).toBeInTheDocument();
  });

  it("hides recommended actions when empty", () => {
    render(
      <Wrapper>
        <DetailContent analysis={{ ...mockAnalysis, recommendedActions: [] }} />
      </Wrapper>
    );
    expect(screen.queryByText("Recommended Actions")).not.toBeInTheDocument();
  });

  it("renders confidence signals", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Confidence Signals")).toBeInTheDocument();
    expect(screen.getByText("logQuality")).toBeInTheDocument();
    expect(screen.getByText("good")).toBeInTheDocument();
  });

  it("hides confidence signals when not provided", () => {
    render(
      <Wrapper>
        <DetailContent analysis={{ ...mockAnalysis, confidenceSignals: null }} />
      </Wrapper>
    );
    expect(screen.queryByText("Confidence Signals")).not.toBeInTheDocument();
  });

  it("shows linked event ID without link by default", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("event-123")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "event-123" })).not.toBeInTheDocument();
  });

  it("shows linked event ID as link when showLinkedEventLink is true", () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} showLinkedEventLink />
      </Wrapper>
    );
    const link = screen.getByRole("link", { name: "event-123" });
    expect(link).toHaveAttribute("href", "/dashboard/cicd/analyses");
  });

  it("hides event section when no eventId", () => {
    render(
      <Wrapper>
        <DetailContent analysis={{ ...mockAnalysis, eventId: null }} />
      </Wrapper>
    );
    expect(screen.queryByText(/Linked to failure event/)).not.toBeInTheDocument();
  });

  it("renders collapsible raw analysis data section", async () => {
    render(
      <Wrapper>
        <DetailContent analysis={mockAnalysis} />
      </Wrapper>
    );
    expect(screen.getByText("Raw Analysis Data")).toBeInTheDocument();
    // Initially collapsed — JSON not visible
    expect(screen.queryByText(/"raw"/)).not.toBeInTheDocument();

    // Click to expand
    const user = userEvent.setup();
    await user.click(screen.getByText("Raw Analysis Data"));
    expect(screen.getByText(/"raw"/)).toBeInTheDocument();
  });
});
