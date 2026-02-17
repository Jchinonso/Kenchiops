/**
 * Testimonials Section Tests
 *
 * Verifies the testimonial grid renders all quotes,
 * names, roles, and avatar initials.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Testimonials from "@/sections/Testimonials";

describe("Testimonials", () => {
  it("should render the section with correct aria-label", () => {
    render(<Testimonials />);
    expect(screen.getByRole("region", { name: "Customer testimonials" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<Testimonials />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Loved by Engineering Teams" })
    ).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    render(<Testimonials />);
    expect(screen.getByText(/Hear from teams who stopped wasting hours/i)).toBeInTheDocument();
  });

  it("should render all testimonial quotes", () => {
    render(<Testimonials />);
    expect(screen.getByText(/cut our CI debugging time by 80%/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence scoring is a game-changer/i)).toBeInTheDocument();
    expect(screen.getByText(/3-hour debugging sessions to 5-minute fixes/i)).toBeInTheDocument();
  });

  it("should render all testimonial author names", () => {
    render(<Testimonials />);
    expect(screen.getByText("James K.")).toBeInTheDocument();
    expect(screen.getByText("Sarah C.")).toBeInTheDocument();
    expect(screen.getByText("Marcus W.")).toBeInTheDocument();
  });

  it("should render all testimonial author roles", () => {
    render(<Testimonials />);
    expect(screen.getByText("Staff Engineer, Series B Startup")).toBeInTheDocument();
    expect(screen.getByText("VP Engineering, FastShip")).toBeInTheDocument();
    expect(screen.getByText("Platform Lead, DeployHQ")).toBeInTheDocument();
  });

  it("should render avatar initials", () => {
    render(<Testimonials />);
    expect(screen.getByText("JK")).toBeInTheDocument();
    expect(screen.getByText("SC")).toBeInTheDocument();
    expect(screen.getByText("MW")).toBeInTheDocument();
  });
});
