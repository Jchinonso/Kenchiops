/**
 * Unit tests for formatting/anchorSelection.ts
 *
 * Tests the tiered anchor selection strategy for CI log truncation.
 */
import { describe, it, expect } from "@jest/globals";
import { findBestAnchor, findBestErrorPosition } from "../../formatting/preprocessing/index.js";

describe("Anchor Selection", () => {
  describe("findBestAnchor", () => {
    describe("Tier 1: CI Boundary Markers", () => {
      it("should detect GitHub Actions error annotation", () => {
        const content = "Running tests...\n##[error] Test failed\nDone.";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
        expect(result.totalMatches).toBeGreaterThan(0);
      });

      it("should detect process exit code failure", () => {
        const content = "npm test\nProcess completed with exit code 1\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
      });

      it("should detect job failed markers", () => {
        const content = "Installing deps...\nJob failed: Build error\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
      });

      it("should detect GitLab CI failure marker", () => {
        const content = "Running script...\nERROR: Job failed: exit code 1\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
      });

      it("should prefer LATEST Tier 1 match", () => {
        const content =
          "##[error] First error\n" +
          "A".repeat(10000) +
          "\n##[error] Second error\n" +
          "B".repeat(1000);
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
        // Position should be closer to the second error
        expect(result.position).toBeGreaterThan(10000);
      });
    });

    describe("Tier 2: Infrastructure Failures", () => {
      it("should detect out of memory / OOM killed", () => {
        const content = "Running build...\nKilled\nexit code 137";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect timeout / deadline exceeded", () => {
        const content = "Fetching data...\ncontext deadline exceeded\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect disk full errors", () => {
        const content = "Writing file...\nNo space left on device\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect DNS/network failures", () => {
        const content = "Connecting to api...\ngetaddrinfo ENOTFOUND api.example.com\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect TLS/SSL certificate errors", () => {
        const content = "Connecting...\ncertificate has expired\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect permission denied errors", () => {
        const content = "Opening file...\nEACCES: permission denied\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect rate limiting (429)", () => {
        const content = "API call...\n429 Too Many Requests\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should detect segmentation fault", () => {
        const content = "Running binary...\nSegmentation fault (core dumped)\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });
    });

    describe("Tier 3: Stack Traces and Exceptions", () => {
      it("should detect stack trace with file:line", () => {
        const content =
          "Error occurred\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });

      it("should detect Python traceback", () => {
        const content = 'Traceback (most recent call last):\n  File "app.py", line 42\n';
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });

      it("should detect Rust panic", () => {
        const content = "thread 'main' panicked at 'assertion failed'\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });

      it("should detect assertion failures", () => {
        const content = "Running tests...\nAssertionError: expected true got false\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });

      it("should detect test failure counts in assertion context", () => {
        // Note: bare "X failed, Y passed" patterns are now detected as test summaries (tier 0)
        // This tests assertion-style failures that don't match summary patterns
        const content = "Running tests...\nAssertionError: 5 tests failed\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });
    });

    describe("Tier 4: Generic Error Indicators", () => {
      it("should detect ERROR level in structured logs", () => {
        const content = "[ERROR]: Database connection failed\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(4);
      });

      it("should detect npm ERR!", () => {
        const content = "Installing...\nnpm ERR! missing dependency\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(4);
      });

      it("should detect TypeScript errors", () => {
        const content = "Compiling...\nerror TS2304: Cannot find name 'foo'\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(4);
      });
    });

    describe("Tier Priority", () => {
      it("should prefer Tier 1 over Tier 2", () => {
        const content = "Killed\n##[error] Job failed";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(1);
      });

      it("should prefer Tier 2 over Tier 3", () => {
        const content = "AssertionError: test\nNo space left on device";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(2);
      });

      it("should prefer Tier 3 over Tier 4", () => {
        const content = "npm ERR! failed\nAssertionError: expected true";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(3);
      });
    });

    describe("Test Summary Priority", () => {
      it("should detect test summary pattern", () => {
        const content = "A".repeat(50000) + "\nTests: 5 failed, 10 passed\n" + "B".repeat(1000);
        const result = findBestAnchor(content);

        expect(result.tier).toBe(0); // Test summary is tier 0 (highest priority)
      });

      it("should prefer test summary over Tier 1 markers", () => {
        const content = "##[error] Error annotation\n" + "A".repeat(10000) + "\nTests: 3 failed\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(0);
      });
    });

    describe("Fallback Behavior", () => {
      it("should fall back to generic ERROR/FAILED strings", () => {
        const content = "Starting...\nSomething ERROR happened\n";
        const result = findBestAnchor(content);

        expect(result.tier).toBe(-1); // Fallback tier
        expect(result.totalMatches).toBeGreaterThan(0);
      });

      it("should return position 0 when no indicators found", () => {
        // Content without any error-like words
        const content = "All systems nominal. Build completed successfully.";
        const result = findBestAnchor(content);

        expect(result.position).toBe(0);
        expect(result.tier).toBe(-1);
        expect(result.totalMatches).toBe(0);
      });
    });

    describe("Latest Match Preference", () => {
      it("should select latest match within same tier for multiple Tier 1 matches", () => {
        const firstError = "##[error] First";
        const secondError = "##[error] Second";
        const content = firstError + "\n" + "X".repeat(5000) + "\n" + secondError;

        const result = findBestAnchor(content);

        // Position should be near the second error
        expect(result.position).toBeGreaterThan(firstError.length + 2000);
      });

      it("should select latest match for infrastructure failures", () => {
        const content = "timeout error\n" + "X".repeat(3000) + "\ndeadline exceeded";

        const result = findBestAnchor(content);
        expect(result.tier).toBe(2);
        // Should be near the second match
        expect(result.position).toBeGreaterThan(3000);
      });
    });
  });

  describe("findBestErrorPosition", () => {
    it("should return just the position (backward compatible interface)", () => {
      const content = "##[error] Test failed";
      const result = findBestErrorPosition(content);

      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should return 0 for content without any indicators", () => {
      // Content without error-like words
      const result = findBestErrorPosition("Build completed successfully");

      expect(result).toBe(0);
    });
  });

  describe("Raw Match Index (Double-Subtraction Regression)", () => {
    it("should return position at or near the error marker (not pre-shifted)", () => {
      // Build content where we know approximate position of the error marker
      const prefix = "A".repeat(1000);
      const errorMarker = "##[error] Job failed";
      const suffix = "B".repeat(500);
      const content = prefix + errorMarker + suffix;

      const result = findBestAnchor(content);

      // Position should be at or very close to the start of the error marker
      // (within the marker itself, not shifted hundreds of chars before)
      // The key is: NOT shifted by CONTEXT_BEFORE_ANCHOR constant (which was 500)
      expect(result.position).toBeGreaterThanOrEqual(1000);
      expect(result.position).toBeLessThan(1000 + errorMarker.length);
      expect(result.tier).toBe(1);
    });

    it("should return position at or near test summary (not pre-shifted)", () => {
      const prefix = "X".repeat(5000);
      const summary = "Tests: 5 failed, 10 passed";
      const suffix = "Y".repeat(1000);
      const content = prefix + summary + suffix;

      const result = findBestAnchor(content);

      // Position should be within the summary region
      // The key is: NOT shifted backwards by CONTEXT_BEFORE_ANCHOR
      expect(result.position).toBeGreaterThanOrEqual(5000);
      expect(result.position).toBeLessThan(5000 + summary.length);
      expect(result.tier).toBe(0);
    });

    it("should not double-shift when truncation applies its own offset", () => {
      // This regression test ensures findBestAnchor returns raw position
      // and truncateWithErrorContext applies the ONLY offset
      const content = "A".repeat(2000) + "ERROR: Test failure" + "B".repeat(2000);
      const result = findBestAnchor(content);

      // The position should be at or near 2000 (not shifted by CONTEXT_BEFORE_ANCHOR)
      // Fallback tier uses lastIndexOf which returns exact match position
      expect(result.position).toBe(2000);
    });
  });

  describe("Fallback Latest Occurrence", () => {
    it("should use lastIndexOf for fallback tier - anchors on LATEST ERROR", () => {
      // Build content with multiple generic ERROR strings (no tier 1-4 patterns)
      const content =
        "Generic log ERROR happened here\n" + "X".repeat(5000) + "\nAnother ERROR at end";

      const result = findBestAnchor(content);

      // Should be fallback tier (no structured patterns matched)
      expect(result.tier).toBe(-1);
      // Should anchor near the LATEST "ERROR", not the first one
      expect(result.position).toBeGreaterThan(5000);
    });

    it("should use lastIndexOf for fallback tier - anchors on LATEST FAILED", () => {
      const content =
        "First FAILED mention early\n" + "X".repeat(8000) + "\nLast FAILED mention at end";

      const result = findBestAnchor(content);

      expect(result.tier).toBe(-1);
      // Should anchor near the last FAILED, not the first
      expect(result.position).toBeGreaterThan(8000);
    });

    it("should find latest position across multiple different indicators", () => {
      // Content with ERROR early and FAILED later
      const content =
        "Early ERROR in setup\n" +
        "X".repeat(3000) +
        "\nSome WARNING in middle\n" +
        "Y".repeat(3000) +
        "\nFinal FAILED at end";

      const result = findBestAnchor(content);

      expect(result.tier).toBe(-1);
      // Should anchor on "FAILED" which appears latest
      expect(result.position).toBeGreaterThan(6000);
    });
  });

  describe("Test Summary Pattern Coverage", () => {
    it("should detect Jest/Vitest style: Tests: X failed", () => {
      const content = "Running...\nTests: 3 failed, 10 passed\nDone";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should detect pytest style summary with equals bars", () => {
      const content = "Running...\n===== 2 failed, 8 passed in 5.0s =====\nDone";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should detect Go test style: FAIL\\t<pkg>", () => {
      const content = "Running tests...\nFAIL\tgithub.com/example/pkg\t1.234s\nDone";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should detect Rust/cargo style: test result: FAILED", () => {
      const content = "Running tests...\ntest result: FAILED. 2 passed; 1 failed\nDone";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should detect generic X tests, Y failures", () => {
      const content = "Test run complete\n50 tests, 3 failures\nCleanup...";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should detect Ran X tests in Y format", () => {
      const content = "Test output...\nRan 25 tests in 3.45s\nCleanup...";
      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
    });

    it("should prefer LATEST test summary when multiple exist", () => {
      const content =
        "Tests: 1 failed\n" + "X".repeat(5000) + "\nTests: 2 failed\n" + "Y".repeat(1000);

      const result = findBestAnchor(content);

      expect(result.tier).toBe(0);
      // Should anchor on the LATEST summary
      expect(result.position).toBeGreaterThan(5000);
    });
  });
});
