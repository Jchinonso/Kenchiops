/**
 * Unit tests for formatting/testFrameworkDetection.ts
 *
 * Tests language-agnostic test framework detection with confidence scoring.
 */
import { describe, it, expect } from "@jest/globals";
import {
  detectTestFramework,
  detectTestFrameworkSimple,
} from "../../formatting/testFrameworkDetection.js";

describe("Test Framework Detection", () => {
  describe("detectTestFramework", () => {
    describe("Python Frameworks", () => {
      it("should detect pytest", () => {
        const content = `
============================= test session starts ==============================
collected 42 items
FAILED tests/test_api.py::test_login
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("pytest");
        expect(result?.language).toBe("Python");
        expect(result?.confidence).toBeGreaterThan(0.5);
      });

      it("should detect unittest", () => {
        const content = `
test_something (tests.test_module.TestCase) ... ok
Ran 5 tests in 0.123s
OK
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("unittest");
        expect(result?.language).toBe("Python");
      });
    });

    describe("JavaScript/TypeScript Frameworks", () => {
      it("should detect Jest", () => {
        const content = `
FAIL src/components/Button.test.tsx
  ● Button › should render correctly

    expect(received).toEqual(expected)

    Expected: "Click me"
    Received: "Click"
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("jest");
        expect(result?.language).toBe("JavaScript/TypeScript");
        expect(result?.assertionHint).toContain("Expected");
        expect(result?.assertionHint).toContain("Received");
      });

      it("should detect Vitest", () => {
        const content = `
 ✓ src/utils.test.ts (3 tests) 12ms
 ✕ src/api.test.ts (1 test) 45ms
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("vitest");
      });

      it("should detect Mocha", () => {
        // Use mocha-specific patterns that don't overlap with vitest
        const content = `
  describe('Component', function() {
    it('should mount', function() {
    });
  });

  2 passing (1s)
  1 failing
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("mocha");
      });
    });

    describe("Rust Frameworks", () => {
      it("should detect cargo test", () => {
        // Use Rust-specific output patterns (avoid ::test_ which matches pytest)
        const content = `
running 10 tests
test my_module::parse_input ... ok
test my_module::validate_data ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

thread 'my_module::check_value' panicked at src/lib.rs:42:
assertion \`left == right\` failed
  left: \`42\`,
 right: \`43\`
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("cargo-test");
        expect(result?.language).toBe("Rust");
        expect(result?.assertionHint).toContain("left");
        expect(result?.assertionHint).toContain("right");
      });
    });

    describe("Go Frameworks", () => {
      it("should detect go test", () => {
        const content = `
=== RUN   TestHandler
--- FAIL: TestHandler (0.00s)
    handler_test.go:42: got "error", want "success"
FAIL
exit status 1
FAIL	example.com/pkg	0.012s
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("go-test");
        expect(result?.language).toBe("Go");
        expect(result?.assertionHint).toContain("got");
        expect(result?.assertionHint).toContain("want");
      });
    });

    describe("Java Frameworks", () => {
      it("should detect JUnit", () => {
        const content = `
[INFO] Running com.example.AppTest
[ERROR] Tests run: 5, Failures: 1, Errors: 0
java.lang.AssertionError: expected:<true> but was:<false>
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("junit");
        expect(result?.language).toBe("Java");
      });

      it("should detect Maven", () => {
        const content = `
[INFO] BUILD FAILURE
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("maven");
      });

      it("should detect Gradle", () => {
        const content = `
> Task :test FAILED
BUILD FAILED in 45s
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("gradle");
      });
    });

    describe("C#/.NET Frameworks", () => {
      it("should detect NUnit", () => {
        const content = `
Test Run Successful.
Total tests: 42
     Passed: 40
     Failed: 2
Assert.AreEqual failed. Expected: 10, But was: 5
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("nunit");
        expect(result?.language).toBe("C#");
      });

      it("should detect xUnit", () => {
        const content = `
  Failed Tests.UnitTest1.TestMethod1
  Assert.Equal() Failure
  Expected: 42
  Actual:   24
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("xunit");
      });
    });

    describe("Ruby Frameworks", () => {
      it("should detect RSpec", () => {
        const content = `
Finished in 2.3 seconds (files took 0.5 seconds to load)
10 examples, 2 failures

Failed examples:

rspec ./spec/models/user_spec.rb:42
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("rspec");
        expect(result?.language).toBe("Ruby");
      });

      it("should detect Minitest", () => {
        const content = `
Run options: --seed 12345
10 runs, 15 assertions, 1 failures, 0 errors
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("minitest");
      });
    });

    describe("Other Frameworks", () => {
      it("should detect PHPUnit", () => {
        const content = `
PHPUnit 9.5.0
Tests: 20, Assertions: 45, Failures: 1
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("phpunit");
        expect(result?.language).toBe("PHP");
      });

      it("should detect ExUnit (Elixir)", () => {
        // Use ExUnit-specific pattern
        const content = `
ExUnit.start()
Finished in 0.2 seconds (0.1s async, 0.1s sync)
5 tests, 0 failures
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("exunit");
        expect(result?.language).toBe("Elixir");
      });

      it("should detect XCTest (Swift)", () => {
        const content = `
Test Suite 'All tests' started
XCTAssertEqual failed: ("10") is not equal to ("5")
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("xctest");
        expect(result?.language).toBe("Swift");
      });

      it("should detect Google Test (C++)", () => {
        // Use GTest-specific patterns like EXPECT_EQ and Google Test markers
        const content = `
[==========] Running 5 tests from 2 test suites.
[----------] Global test environment set-up.
[----------] 3 tests from TestCase
[ RUN      ] TestCase.TestName
[       OK ] TestCase.TestName (0 ms)
[ RUN      ] TestCase.AnotherTest
EXPECT_EQ(expected, actual)
/src/test.cpp:42: Failure
Expected equality of these values:
  expected
    Which is: 42
  actual
    Which is: 0
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("gtest");
        expect(result?.language).toBe("C/C++");
      });

      it("should detect Catch2", () => {
        const content = `
test case 'Factorial'
  REQUIRE( factorial(5) == 120 )
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
test cases: 10 | 9 passed | 1 failed
`;
        const result = detectTestFramework(content);

        expect(result?.name).toBe("catch2");
      });
    });

    describe("Confidence Scoring", () => {
      it("should return higher confidence for multiple pattern matches", () => {
        const pytestLogs = `
============================= test session starts ==============================
collected 10 items
FAILED tests/test_api.py::test_login
FAILED tests/test_api.py::test_logout
`;
        const result = detectTestFramework(pytestLogs);

        expect(result?.confidence).toBeGreaterThan(0.8);
      });

      it("should return lower confidence for ambiguous logs", () => {
        const ambiguousLogs = "PASS tests completed";
        const result = detectTestFramework(ambiguousLogs);

        // Either no detection or low confidence
        if (result) {
          expect(result.confidence).toBeLessThan(0.9);
        }
      });

      it("should cap confidence at maximum", () => {
        const content = `
pytest collected 100 items
FAILED tests/test_one.py::test_a
FAILED tests/test_two.py::test_b
`;
        const result = detectTestFramework(content);

        expect(result?.confidence).toBeLessThanOrEqual(0.95);
      });
    });

    describe("Edge Cases", () => {
      it("should return undefined for logs without test framework indicators", () => {
        const content = "Building application...\nDeploy successful.";
        const result = detectTestFramework(content);

        expect(result).toBeUndefined();
      });

      it("should return undefined for empty content", () => {
        const result = detectTestFramework("");

        expect(result).toBeUndefined();
      });

      it("should handle logs with mixed framework indicators", () => {
        // In practice, logs typically have one framework
        // but if mixed, we should pick the strongest match
        const content = `
FAIL src/test.ts
Finished in 0.5 seconds
5 tests, 1 failure
`;
        const result = detectTestFramework(content);

        // Should detect something, preference may vary
        expect(result).toBeDefined();
      });
    });
  });

  describe("detectTestFrameworkSimple", () => {
    it("should return framework info without confidence", () => {
      const content = "pytest collected 5 items\nFAILED tests/test.py::test_x";
      const result = detectTestFrameworkSimple(content);

      expect(result?.name).toBe("pytest");
      expect(result?.language).toBe("Python");
      expect(result?.assertionHint).toBeDefined();
      // Should NOT have confidence property
      expect((result as Record<string, unknown>)?.confidence).toBeUndefined();
    });

    it("should return undefined for no match", () => {
      const result = detectTestFrameworkSimple("No framework here");

      expect(result).toBeUndefined();
    });
  });

  describe("Advisory Nature (Language Agnostic)", () => {
    it("should provide hints, not assertions about expected/actual", () => {
      const content = "pytest FAILED tests/test.py::test_x";
      const result = detectTestFramework(content);

      // assertionHint should describe the convention, not parse values
      expect(result?.assertionHint).toContain("==");
      // It should NOT contain actual values from the logs
      expect(result?.assertionHint).not.toContain("test_x");
    });

    it("should not infer programming language from file extensions", () => {
      // Framework detection is based on output patterns, not file paths
      const content = "running tests\nsome output";
      const result = detectTestFramework(content);

      // Without framework-specific patterns, should return undefined
      expect(result).toBeUndefined();
    });
  });
});
