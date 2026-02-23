/**
 * Unit tests for CIAnalysisMockup component.
 *
 * Tests:
 * - Renders the terminal header with window controls
 * - Shows CI build number and "Failed" label
 * - Displays the error message (Module not found)
 * - Displays the Kenchi Analysis section with fix suggestion
 * - Contains commit SHA reference
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CIAnalysisMockup } from "@/components/CIAnalysisMockup";

describe("CIAnalysisMockup", () => {
  it("renders the terminal header with build info", () => {
    render(<CIAnalysisMockup />);
    expect(screen.getByText(/CI Build #4821 — Failed/)).toBeInTheDocument();
  });

  it("displays the module not found error", () => {
    render(<CIAnalysisMockup />);
    expect(screen.getByText("Error: Module not found")).toBeInTheDocument();
  });

  it("shows the unresolved import path", () => {
    render(<CIAnalysisMockup />);
    expect(
      screen.getByText(/Cannot resolve '@utils\/auth' in 'src\/api\/middleware.ts'/)
    ).toBeInTheDocument();
  });

  it("renders the Kenchi Analysis section", () => {
    render(<CIAnalysisMockup />);
    expect(screen.getByText("Kenchi Analysis")).toBeInTheDocument();
  });

  it("shows the fix suggestion with commit SHA", () => {
    render(<CIAnalysisMockup />);
    expect(screen.getByText("a3f2c91")).toBeInTheDocument();
    expect(screen.getByText(/Update import to '\.\.\/\.\.\/utils\/auth'/)).toBeInTheDocument();
  });
});
