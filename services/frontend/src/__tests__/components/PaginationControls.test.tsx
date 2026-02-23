/**
 * Unit tests for PaginationControls component.
 *
 * Tests pagination navigation behavior including:
 * - Display of page info (range or page number)
 * - Previous/Next button enabled/disabled states
 * - Button click callbacks
 * - Page size selector visibility and interaction
 * - Accessibility (nav element, aria labels)
 *
 * Note: Radix UI Select is mocked to avoid dual-React issues in monorepo.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaginationControls } from "@/components/PaginationControls";

// Mock Radix UI Select to avoid dual-React in monorepo tests
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <select
      data-testid="page-size-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

describe("PaginationControls", () => {
  const defaultProps = {
    currentPage: 2,
    totalPages: 5,
    hasPrev: true,
    hasNext: true,
    onPrev: vi.fn(),
    onNext: vi.fn(),
  };

  describe("page info display", () => {
    it("should display 'Page X of Y' when totalItems/pageSize are not provided", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
    });

    it("should display item range when totalItems and pageSize are provided", () => {
      render(<PaginationControls {...defaultProps} totalItems={100} pageSize={20} />);

      expect(screen.getByText(/21.*40 of 100/)).toBeInTheDocument();
    });

    it("should cap range end to totalItems on last page", () => {
      render(
        <PaginationControls
          {...defaultProps}
          currentPage={5}
          totalPages={5}
          totalItems={95}
          pageSize={20}
        />
      );

      expect(screen.getByText(/81.*95 of 95/)).toBeInTheDocument();
    });

    it("should show range starting at 1 on first page", () => {
      render(
        <PaginationControls {...defaultProps} currentPage={1} totalItems={50} pageSize={20} />
      );

      expect(screen.getByText(/1.*20 of 50/)).toBeInTheDocument();
    });
  });

  describe("navigation buttons", () => {
    it("should have accessible aria labels on prev/next buttons", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
    });

    it("should call onPrev when Prev button is clicked", async () => {
      const user = userEvent.setup();
      const onPrev = vi.fn();
      render(<PaginationControls {...defaultProps} onPrev={onPrev} />);

      await user.click(screen.getByLabelText("Go to previous page"));

      expect(onPrev).toHaveBeenCalledOnce();
    });

    it("should call onNext when Next button is clicked", async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      render(<PaginationControls {...defaultProps} onNext={onNext} />);

      await user.click(screen.getByLabelText("Go to next page"));

      expect(onNext).toHaveBeenCalledOnce();
    });

    it("should disable Prev button when hasPrev is false", () => {
      render(<PaginationControls {...defaultProps} hasPrev={false} />);

      expect(screen.getByLabelText("Go to previous page")).toBeDisabled();
    });

    it("should disable Next button when hasNext is false", () => {
      render(<PaginationControls {...defaultProps} hasNext={false} />);

      expect(screen.getByLabelText("Go to next page")).toBeDisabled();
    });

    it("should enable both buttons when on a middle page", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.getByLabelText("Go to previous page")).toBeEnabled();
      expect(screen.getByLabelText("Go to next page")).toBeEnabled();
    });

    it("should display button text 'Prev' and 'Next'", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.getByText("Prev")).toBeInTheDocument();
      expect(screen.getByText("Next")).toBeInTheDocument();
    });
  });

  describe("page size selector", () => {
    it("should not render page size selector when onPageSizeChange is not provided", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.queryByText("Show")).not.toBeInTheDocument();
    });

    it("should not render page size selector when pageSize is not provided", () => {
      render(<PaginationControls {...defaultProps} onPageSizeChange={vi.fn()} />);

      expect(screen.queryByText("Show")).not.toBeInTheDocument();
    });

    it("should render page size selector when onPageSizeChange and pageSize are provided", () => {
      render(<PaginationControls {...defaultProps} pageSize={20} onPageSizeChange={vi.fn()} />);

      expect(screen.getByText("Show")).toBeInTheDocument();
    });

    it("should call onPageSizeChange with numeric value when page size is changed", async () => {
      const user = userEvent.setup();
      const onPageSizeChange = vi.fn();

      render(
        <PaginationControls {...defaultProps} pageSize={20} onPageSizeChange={onPageSizeChange} />
      );

      const select = screen.getByTestId("page-size-select");
      await user.selectOptions(select, "50");

      expect(onPageSizeChange).toHaveBeenCalledWith(50);
    });

    it("should render default page size options (10, 20, 50)", () => {
      render(<PaginationControls {...defaultProps} pageSize={20} onPageSizeChange={vi.fn()} />);

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("should render custom page size options when provided", () => {
      render(
        <PaginationControls
          {...defaultProps}
          pageSize={25}
          onPageSizeChange={vi.fn()}
          pageSizeOptions={[25, 100]}
        />
      );

      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.queryByText("10")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have a nav element with aria-label 'Pagination'", () => {
      render(<PaginationControls {...defaultProps} />);

      expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    });
  });
});
