/**
 * Multi-Language CI Failure Fixtures
 *
 * Tests AI extraction of dependency changes and build config changes
 * across different programming languages and ecosystems.
 *
 * These fixtures validate the language-agnostic design of Phase 3.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { OpenAIClient } from "../../openaiClient/index.js";
import type { Event, Evidence } from "../../core/types.js";

// Mock OpenAI SDK
const mockCreate = jest.fn();

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// ============================================================================
// Multi-Language CI Failure Fixtures
// ============================================================================

/**
 * Python (pip/poetry) CI Failure
 */
const PYTHON_CI_FAILURE = {
  logs: `
Running pytest...
============================= test session starts ==============================
platform linux -- Python 3.11.5, pytest-7.4.0, pluggy-1.2.0
rootdir: /home/runner/work/myapp/myapp
collected 45 items

tests/test_api.py::TestUserAPI::test_create_user PASSED
tests/test_api.py::TestUserAPI::test_get_user FAILED
tests/test_api.py::TestUserAPI::test_delete_user PASSED
tests/test_auth.py::TestAuth::test_login FAILED
tests/test_auth.py::TestAuth::test_logout PASSED

================================== FAILURES ===================================
___________________________ TestUserAPI.test_get_user ___________________________
tests/test_api.py:45: AssertionError: Expected status 200, got 500
___________________________ TestAuth.test_login _________________________________
tests/test_auth.py:23: ConnectionError: Failed to connect to auth service
=========================== short test summary info ===========================
FAILED tests/test_api.py::TestUserAPI::test_get_user - AssertionError
FAILED tests/test_auth.py::TestAuth::test_login - ConnectionError
============================= 2 failed, 3 passed ==============================
`,
  diff: `
diff --git a/requirements.txt b/requirements.txt
index abc1234..def5678 100644
--- a/requirements.txt
+++ b/requirements.txt
@@ -1,5 +1,6 @@
-django==4.1.0
+django==4.2.0
 pytest==7.4.0
 requests==2.31.0
+redis==5.0.0
-celery==5.2.0

diff --git a/pyproject.toml b/pyproject.toml
index 111222..333444 100644
--- a/pyproject.toml
+++ b/pyproject.toml
@@ -10,6 +10,7 @@ dependencies = [
 [tool.pytest.ini_options]
 testpaths = ["tests"]
+asyncio_mode = "auto"
`,
};

/**
 * Go (go.mod) CI Failure
 */
const GO_CI_FAILURE = {
  logs: `
go test ./...
--- FAIL: TestUserService_Create (0.01s)
    user_service_test.go:45: expected status 200, got 500
--- FAIL: TestDatabaseConnection (0.02s)
    db_test.go:23: connection timeout after 5s
FAIL
FAIL    github.com/myorg/myapp/internal/user    0.032s
FAIL    github.com/myorg/myapp/internal/db      0.045s
ok      github.com/myorg/myapp/internal/utils   0.012s
FAIL
`,
  diff: `
diff --git a/go.mod b/go.mod
index aaa111..bbb222 100644
--- a/go.mod
+++ b/go.mod
@@ -3,8 +3,9 @@ module github.com/myorg/myapp
 go 1.21

 require (
-    github.com/gin-gonic/gin v1.9.0
+    github.com/gin-gonic/gin v1.9.1
     github.com/lib/pq v1.10.9
+    github.com/redis/go-redis/v9 v9.3.0
-    github.com/stretchr/testify v1.8.0
+    github.com/stretchr/testify v1.8.4
 )
`,
};

/**
 * Rust (Cargo) CI Failure
 */
const RUST_CI_FAILURE = {
  logs: `
running 15 tests
test user::tests::test_create_user ... ok
test user::tests::test_get_user ... FAILED
test auth::tests::test_login ... FAILED
test auth::tests::test_logout ... ok
test db::tests::test_connection ... ok

failures:

---- user::tests::test_get_user stdout ----
thread 'user::tests::test_get_user' panicked at 'assertion failed: response.status() == 200'
src/user.rs:145:9

---- auth::tests::test_login stdout ----
thread 'auth::tests::test_login' panicked at 'connection refused'
src/auth.rs:67:13

failures:
    user::tests::test_get_user
    auth::tests::test_login

test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out
`,
  diff: `
diff --git a/Cargo.toml b/Cargo.toml
index 123abc..456def 100644
--- a/Cargo.toml
+++ b/Cargo.toml
@@ -7,9 +7,10 @@ edition = "2021"
 [dependencies]
-actix-web = "4.3"
+actix-web = "4.4"
 serde = { version = "1.0", features = ["derive"] }
-tokio = { version = "1.32", features = ["full"] }
+tokio = { version = "1.35", features = ["full"] }
+redis = "0.24"

 [dev-dependencies]
 actix-rt = "2.9"
`,
};

/**
 * Ruby (Bundler) CI Failure
 */
const RUBY_CI_FAILURE = {
  logs: `
Running RSpec...

UserController
  #create
    creates a new user (PASSED)
  #show
    returns the user (FAILED - 1)
  #destroy
    deletes the user (PASSED)

AuthService
  #login
    authenticates user (FAILED - 2)
  #logout
    logs out user (PASSED)

Failures:

  1) UserController#show returns the user
     Failure/Error: expect(response).to have_http_status(200)
       expected the response to have status code 200 but it was 500
     # ./spec/controllers/user_controller_spec.rb:34:in 'block (3 levels) in <top>'

  2) AuthService#login authenticates user
     Failure/Error: Redis.current.get(session_key)
       Redis::CannotConnectError: Error connecting to Redis on localhost:6379
     # ./spec/services/auth_service_spec.rb:23:in 'block (3 levels) in <top>'

Finished in 0.45 seconds (files took 1.2 seconds to load)
5 examples, 2 failures
`,
  diff: `
diff --git a/Gemfile b/Gemfile
index abc123..def456 100644
--- a/Gemfile
+++ b/Gemfile
@@ -3,8 +3,9 @@ source 'https://rubygems.org'
 ruby '3.2.0'

-gem 'rails', '~> 7.0.0'
+gem 'rails', '~> 7.1.0'
 gem 'puma', '~> 6.0'
+gem 'redis', '~> 5.0'
-gem 'sidekiq', '~> 7.0'

 group :test do
   gem 'rspec-rails'
`,
};

/**
 * Java (Maven/Gradle) CI Failure
 */
const JAVA_CI_FAILURE = {
  logs: `
[INFO] Running com.myapp.UserServiceTest
[ERROR] Tests run: 5, Failures: 2, Errors: 0, Skipped: 0

[ERROR] testGetUser(com.myapp.UserServiceTest)
  Time elapsed: 0.234 s  <<< FAILURE!
  java.lang.AssertionError: expected:<200> but was:<500>
    at com.myapp.UserServiceTest.testGetUser(UserServiceTest.java:45)

[ERROR] testLogin(com.myapp.AuthServiceTest)
  Time elapsed: 0.156 s  <<< FAILURE!
  redis.clients.jedis.exceptions.JedisConnectionException: Could not get a resource from the pool
    at com.myapp.AuthServiceTest.testLogin(AuthServiceTest.java:67)

[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
`,
  diff: `
diff --git a/pom.xml b/pom.xml
index aaa111..bbb222 100644
--- a/pom.xml
+++ b/pom.xml
@@ -25,13 +25,15 @@
     <dependency>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-web</artifactId>
-      <version>3.1.0</version>
+      <version>3.2.0</version>
     </dependency>
+    <dependency>
+      <groupId>redis.clients</groupId>
+      <artifactId>jedis</artifactId>
+      <version>5.0.0</version>
+    </dependency>
-    <dependency>
-      <groupId>org.apache.kafka</groupId>
-      <artifactId>kafka-clients</artifactId>
-      <version>3.5.0</version>
-    </dependency>
   </dependencies>
 </project>
`,
};

/**
 * TypeScript/Node.js (npm) CI Failure - Reference
 */
const TYPESCRIPT_CI_FAILURE = {
  logs: `
FAIL src/__tests__/userService.test.ts
  ● UserService › getUser › should return user by ID

    expect(received).toBe(expected) // Object.is equality

    Expected: 200
    Received: 500

      44 |     const response = await userService.getUser('123');
      45 |     expect(response.status).toBe(200);
         |                             ^
      46 |   });

FAIL src/__tests__/authService.test.ts
  ● AuthService › login › should authenticate user

    Redis connection error: ECONNREFUSED

      22 |   it('should authenticate user', async () => {
      23 |     const result = await authService.login(credentials);
         |                    ^
      24 |   });

Test Suites: 2 failed, 3 passed, 5 total
Tests:       2 failed, 8 passed, 10 total
`,
  diff: `
diff --git a/package.json b/package.json
index 111222..333444 100644
--- a/package.json
+++ b/package.json
@@ -10,9 +10,10 @@
   },
   "dependencies": {
-    "express": "^4.18.0",
+    "express": "^4.19.0",
     "typescript": "^5.3.0",
+    "ioredis": "^5.3.0",
-    "bull": "^4.10.0"
   }
 }

diff --git a/tsconfig.json b/tsconfig.json
index aaa111..bbb222 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -5,6 +5,7 @@
     "strict": true,
     "esModuleInterop": true,
+    "skipLibCheck": true,
     "outDir": "./dist"
   }
 }
`,
};

// ============================================================================
// Test Helpers
// ============================================================================

const createMockEvent = (repository: string): Event => ({
  id: `evt_${Date.now()}`,
  type: "CICD_FAILURE",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: "CI Failure",
  payload: { repository, workflow: "ci.yml" },
});

const createMockEvidence = (logs: string, diff: string): Evidence => ({
  eventId: `evt_${Date.now()}`,
  logs: [{ level: "ERROR", message: logs, timestamp: new Date().toISOString(), source: "ci" }],
  gitHistory: [],
  systemState: { diff },
  collectedAt: new Date().toISOString(),
});

/**
 * Creates a mock AI response with structured extraction data.
 */
const createMockAIResponse = (
  deps: Array<{
    name: string;
    type: string;
    ecosystem: string;
    oldVersion?: string;
    newVersion?: string;
  }>,
  configs: Array<{ file: string; changeType: string; summary: string }>,
  summary: string
) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          summary,
          identifiedCause: "Test failures due to dependency/config changes",
          confidence: "high",
          reasoning: "Analysis based on logs and diff",
          recommendedActions: [
            { actionType: "investigate", description: "Check test failures", priority: "high" },
          ],
          uncertainties: [],
          evidenceUsed: [],
          relatedIncidents: [],
          nextSteps: ["Fix failing tests"],
          detectedDependencyChanges: deps,
          detectedBuildConfigChanges: configs,
        }),
      },
    },
  ],
});

// ============================================================================
// Tests
// ============================================================================

describe("Multi-Language AI Extraction", () => {
  let client: OpenAIClient;

  beforeEach(() => {
    mockCreate.mockClear();
    client = new OpenAIClient();
  });

  describe("Python (pip/poetry)", () => {
    it("should extract pip dependency changes from requirements.txt", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "django",
            type: "updated",
            ecosystem: "pip",
            oldVersion: "4.1.0",
            newVersion: "4.2.0",
          },
          { name: "redis", type: "added", ecosystem: "pip", newVersion: "5.0.0" },
          { name: "celery", type: "removed", ecosystem: "pip", oldVersion: "5.2.0" },
        ],
        [{ file: "pyproject.toml", changeType: "modified", summary: "Added asyncio_mode config" }],
        "Django upgrade and Redis addition caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/python-app");
      const evidence = createMockEvidence(PYTHON_CI_FAILURE.logs, PYTHON_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      expect(result.detectedDependencyChanges?.length).toBeGreaterThan(0);
      expect(result.detectedBuildConfigChanges).toBeDefined();
    });
  });

  describe("Go (go.mod)", () => {
    it("should extract go module dependency changes", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "github.com/gin-gonic/gin",
            type: "updated",
            ecosystem: "go",
            oldVersion: "v1.9.0",
            newVersion: "v1.9.1",
          },
          {
            name: "github.com/redis/go-redis/v9",
            type: "added",
            ecosystem: "go",
            newVersion: "v9.3.0",
          },
          {
            name: "github.com/stretchr/testify",
            type: "updated",
            ecosystem: "go",
            oldVersion: "v1.8.0",
            newVersion: "v1.8.4",
          },
        ],
        [],
        "Go module updates caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/go-app");
      const evidence = createMockEvidence(GO_CI_FAILURE.logs, GO_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      const goChanges = result.detectedDependencyChanges?.filter((d) => d.ecosystem === "go");
      expect(goChanges?.length).toBeGreaterThan(0);
    });
  });

  describe("Rust (Cargo)", () => {
    it("should extract Cargo dependency changes", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "actix-web",
            type: "updated",
            ecosystem: "cargo",
            oldVersion: "4.3",
            newVersion: "4.4",
          },
          {
            name: "tokio",
            type: "updated",
            ecosystem: "cargo",
            oldVersion: "1.32",
            newVersion: "1.35",
          },
          { name: "redis", type: "added", ecosystem: "cargo", newVersion: "0.24" },
        ],
        [],
        "Rust crate updates caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/rust-app");
      const evidence = createMockEvidence(RUST_CI_FAILURE.logs, RUST_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      const cargoChanges = result.detectedDependencyChanges?.filter((d) => d.ecosystem === "cargo");
      expect(cargoChanges?.length).toBeGreaterThan(0);
    });
  });

  describe("Ruby (Bundler)", () => {
    it("should extract Gemfile dependency changes", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "rails",
            type: "updated",
            ecosystem: "gem",
            oldVersion: "7.0.0",
            newVersion: "7.1.0",
          },
          { name: "redis", type: "added", ecosystem: "gem", newVersion: "5.0" },
          { name: "sidekiq", type: "removed", ecosystem: "gem", oldVersion: "7.0" },
        ],
        [],
        "Rails upgrade and Redis addition caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/ruby-app");
      const evidence = createMockEvidence(RUBY_CI_FAILURE.logs, RUBY_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      const gemChanges = result.detectedDependencyChanges?.filter((d) => d.ecosystem === "gem");
      expect(gemChanges?.length).toBeGreaterThan(0);
    });
  });

  describe("Java (Maven)", () => {
    it("should extract Maven dependency changes from pom.xml", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "spring-boot-starter-web",
            type: "updated",
            ecosystem: "maven",
            oldVersion: "3.1.0",
            newVersion: "3.2.0",
          },
          { name: "jedis", type: "added", ecosystem: "maven", newVersion: "5.0.0" },
          { name: "kafka-clients", type: "removed", ecosystem: "maven", oldVersion: "3.5.0" },
        ],
        [],
        "Spring Boot upgrade caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/java-app");
      const evidence = createMockEvidence(JAVA_CI_FAILURE.logs, JAVA_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      const mavenChanges = result.detectedDependencyChanges?.filter((d) => d.ecosystem === "maven");
      expect(mavenChanges?.length).toBeGreaterThan(0);
    });
  });

  describe("TypeScript/Node.js (npm)", () => {
    it("should extract npm dependency changes and tsconfig changes", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "express",
            type: "updated",
            ecosystem: "npm",
            oldVersion: "4.18.0",
            newVersion: "4.19.0",
          },
          { name: "ioredis", type: "added", ecosystem: "npm", newVersion: "5.3.0" },
          { name: "bull", type: "removed", ecosystem: "npm", oldVersion: "4.10.0" },
        ],
        [{ file: "tsconfig.json", changeType: "modified", summary: "Added skipLibCheck option" }],
        "Express upgrade and ioredis addition caused test failures"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/node-app");
      const evidence = createMockEvidence(TYPESCRIPT_CI_FAILURE.logs, TYPESCRIPT_CI_FAILURE.diff);
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      expect(result.detectedBuildConfigChanges).toBeDefined();

      const npmChanges = result.detectedDependencyChanges?.filter((d) => d.ecosystem === "npm");
      expect(npmChanges?.length).toBeGreaterThan(0);

      const tsConfig = result.detectedBuildConfigChanges?.find((c) => c.file === "tsconfig.json");
      expect(tsConfig).toBeDefined();
    });
  });

  describe("Cross-Language Validation", () => {
    it("should handle analysis without dependency changes", async () => {
      const mockResponse = createMockAIResponse([], [], "Test failures without dependency changes");

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/any-app");
      const evidence = createMockEvidence("Simple test failure", "No diff");
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toEqual([]);
      expect(result.detectedBuildConfigChanges).toEqual([]);
    });

    it("should handle mixed ecosystem detection", async () => {
      const mockResponse = createMockAIResponse(
        [
          {
            name: "lodash",
            type: "updated",
            ecosystem: "npm",
            oldVersion: "4.17.0",
            newVersion: "4.17.21",
          },
          { name: "requests", type: "added", ecosystem: "pip", newVersion: "2.31.0" },
        ],
        [
          { file: "package.json", changeType: "modified", summary: "Updated lodash" },
          { file: "requirements.txt", changeType: "modified", summary: "Added requests" },
        ],
        "Polyglot project with multiple ecosystems"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/polyglot-app");
      const evidence = createMockEvidence("Mixed failures", "Multiple config files changed");
      const result = await client.analyzeIncident(event, evidence);

      expect(result.detectedDependencyChanges).toBeDefined();
      const ecosystems = new Set(result.detectedDependencyChanges?.map((d) => d.ecosystem));
      expect(ecosystems.size).toBeGreaterThan(1);
    });

    it("should properly type dependency change fields", async () => {
      const mockResponse = createMockAIResponse(
        [
          { name: "test-pkg", type: "added", ecosystem: "npm", newVersion: "1.0.0" },
          { name: "old-pkg", type: "removed", ecosystem: "pip", oldVersion: "2.0.0" },
          {
            name: "update-pkg",
            type: "updated",
            ecosystem: "cargo",
            oldVersion: "3.0.0",
            newVersion: "4.0.0",
          },
        ],
        [],
        "Type validation test"
      );

      mockCreate.mockResolvedValueOnce(mockResponse);

      const event = createMockEvent("myorg/test-app");
      const evidence = createMockEvidence("Test", "Diff");
      const result = await client.analyzeIncident(event, evidence);

      const deps = result.detectedDependencyChanges ?? [];

      // Check added package has newVersion but optional oldVersion
      const added = deps.find((d) => d.type === "added");
      expect(added?.newVersion).toBeDefined();

      // Check removed package has oldVersion but optional newVersion
      const removed = deps.find((d) => d.type === "removed");
      expect(removed?.oldVersion).toBeDefined();

      // Check updated package has both versions
      const updated = deps.find((d) => d.type === "updated");
      expect(updated?.oldVersion).toBeDefined();
      expect(updated?.newVersion).toBeDefined();
    });
  });
});
