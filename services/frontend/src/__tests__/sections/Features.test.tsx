/**
 * Features Section Tests
 *
 * Verifies the features section renders the section header,
 * all four feature cards with titles, descriptions, and feature lists.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Features from "@/sections/Features";

const renderFeatures = () =>
  render(
    <MemoryRouter>
      <Features />
    </MemoryRouter>
  );

describe("Features", () => {
  it("should render the section with correct aria-label", () => {
    renderFeatures();
    expect(screen.getByRole("region", { name: "Product features" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    renderFeatures();
    expect(
      screen.getByRole("heading", { level: 2, name: "AI-Powered CI/CD Intelligence" })
    ).toBeInTheDocument();
  });

  it("should render the section description", () => {
    renderFeatures();
    expect(screen.getByText(/From failure detection to root cause analysis/i)).toBeInTheDocument();
  });

  it("should render all four feature card titles", () => {
    renderFeatures();
    const titles = [
      "CI/CD Analysis",
      "Root Cause Detection",
      "Risk Assessment",
      "RAG-Enhanced Learning",
    ];
    titles.forEach((title) => {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    });
  });

  it("should render feature descriptions for each card", () => {
    renderFeatures();
    expect(screen.getByText(/Stop wasting hours debugging failed builds/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence-scored root causes/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Catch risky changes before they break production/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Kenchi learns from your team's past fixes/i)).toBeInTheDocument();
  });

  it("should render feature list items with check marks", () => {
    renderFeatures();
    const featureItems = [
      "Intelligent log chunking pipeline",
      "Multi-model analysis for accuracy",
      "Automatic pattern recognition",
      "Confidence scoring (0-1 scale)",
      "Custom rule engine",
      "Team-specific knowledge base",
    ];
    featureItems.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  it("should render mockup content for Root Cause Detection card", () => {
    renderFeatures();
    expect(screen.getByText("Root Cause Analysis")).toBeInTheDocument();
    expect(screen.getByText("92% Confidence")).toBeInTheDocument();
  });

  it("should render PR Risk Assessment mockup", () => {
    renderFeatures();
    expect(screen.getByText("PR Risk Assessment")).toBeInTheDocument();
    expect(screen.getByText("12 files")).toBeInTheDocument();
  });

  it("should render Knowledge Base mockup", () => {
    renderFeatures();
    expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
    expect(screen.getByText("TypeScript Build Errors")).toBeInTheDocument();
  });
});
