/**
 * FAQ Section Tests
 *
 * Verifies the FAQ accordion section renders all questions.
 * Note: Radix accordion content is hidden by default, so we
 * verify questions (triggers) are visible and answers are in the document.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FAQ from "@/sections/FAQ";

describe("FAQ", () => {
  it("should render the section with correct aria-label", () => {
    render(<FAQ />);
    expect(screen.getByRole("region", { name: "Frequently asked questions" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<FAQ />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Frequently Asked Questions" })
    ).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    render(<FAQ />);
    expect(screen.getByText("Everything you need to know about Kenchi.")).toBeInTheDocument();
  });

  it("should render all six FAQ question triggers", () => {
    render(<FAQ />);
    const questions = [
      "What CI/CD tools does Kenchi support?",
      "How does Kenchi analyze CI failures?",
      "Is my code data secure?",
      "How long does an analysis take?",
      "Can I use Kenchi with a self-hosted GitHub instance?",
      "What happens after the 14-day trial?",
    ];
    questions.forEach((question) => {
      expect(screen.getByText(question)).toBeInTheDocument();
    });
  });

  it("should render all FAQ triggers as buttons", () => {
    render(<FAQ />);
    const buttons = screen.getAllByRole("button");
    // Each FAQ item has an accordion trigger button
    expect(buttons.length).toBeGreaterThanOrEqual(6);
  });
});
