/**
 * Unit tests for TableSkeleton component.
 *
 * Tests the loading skeleton placeholder for tables.
 *
 * Code paths:
 * - Default rows/columns (5 x 5)
 * - Custom rows/columns
 * - Renders correct number of header skeletons
 * - Renders correct number of row skeletons
 * - Each row has the correct number of cell skeletons
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import { TableSkeleton } from "@/components/TableSkeleton";

// Mock Skeleton since it's a shadcn/ui component
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { readonly className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe("TableSkeleton", () => {
  it("should render with default 5 rows and 5 columns", () => {
    const { container } = render(<TableSkeleton />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // 5 header + (5 rows * 5 columns) = 30
    expect(skeletons).toHaveLength(30);
  });

  it("should render the correct number of header skeletons", () => {
    const { container } = render(<TableSkeleton columns={3} />);

    // Header has border-b class; find the header row
    const headerRow = container.querySelector(".border-b");
    const headerSkeletons = headerRow?.querySelectorAll("[data-testid='skeleton']");
    expect(headerSkeletons).toHaveLength(3);
  });

  it("should render the correct number of row skeletons", () => {
    const { container } = render(<TableSkeleton rows={3} columns={4} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // 4 header + (3 rows * 4 columns) = 16
    expect(skeletons).toHaveLength(16);
  });

  it("should render with custom rows and columns", () => {
    const { container } = render(<TableSkeleton rows={2} columns={2} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // 2 header + (2 rows * 2 columns) = 6
    expect(skeletons).toHaveLength(6);
  });

  it("should apply max-w-[80px] to first column cells", () => {
    const { container } = render(<TableSkeleton rows={1} columns={3} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // First cell in the data row (after header skeletons)
    // Header: 3 skeletons, then row cell[0] at index 3
    const firstCellSkeleton = skeletons[3];
    expect(firstCellSkeleton.className).toContain("max-w-[80px]");
  });

  it("should apply max-w-[160px] to non-first column cells", () => {
    const { container } = render(<TableSkeleton rows={1} columns={3} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // Second cell in the data row: index 4
    const secondCellSkeleton = skeletons[4];
    expect(secondCellSkeleton.className).toContain("max-w-[160px]");
  });

  it("should render zero rows when rows=0", () => {
    const { container } = render(<TableSkeleton rows={0} columns={3} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // Only header: 3 skeletons
    expect(skeletons).toHaveLength(3);
  });

  it("should render zero columns gracefully", () => {
    const { container } = render(<TableSkeleton rows={3} columns={0} />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    // No header, no cells
    expect(skeletons).toHaveLength(0);
  });
});
