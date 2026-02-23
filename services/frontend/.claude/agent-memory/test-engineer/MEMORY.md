# Frontend Test Engineer Memory

## Test Infrastructure

- **Vitest 4.x** with jsdom, setupFiles: `src/test-setup.ts`
- **Global Radix mocks**: `src/__tests__/__mocks__/radix-ui.ts` (imported by test-setup)
- **70 test files, 1017 tests** (as of Feb 2026)
- Tests live in `src/__tests__/` directory structure mirroring source

## React 18/19 Radix Conflict

Root monorepo has React 18, frontend has React 19. Radix UI packages crash in tests.

### Mock hierarchy

1. Global: `radix-ui.ts` mocks `@radix-ui/*` (raw packages)
2. Test-level: Mock `@/components/ui/*` (shadcn wrappers) when rendering components using them

### Common shadcn mock patterns needed per test:

- **Collapsible**: Use `React.createContext` for open/close state propagation
- **Command (cmdk)**: Mock `@/components/ui/command` to avoid `scrollIntoView` errors
- **Chart (recharts + chart.tsx)**: Mock both `recharts` AND `@/components/ui/chart`
- **Tooltip**: Make `TooltipContent` return `null` to prevent text duplication
- **AlertDialog**: Global mock renders trigger+content; use `getAllByText`

## Frequent "Found multiple elements" Causes

- Status filter buttons share text with table status badges (WebhookActivity)
- Stat card titles share text with section headings (RepositoryDetail)
- Severity badges share text with confidence labels (CICDFailures)
- Tooltip content duplicates trigger text (DashboardSidebar)
- AlertDialog trigger + content both show same text (Settings)
- Desktop dropdown + mobile menu show same nav items (Navbar)

## Pages That Import Navbar

Terms, Privacy (and any other page using `<Navbar />`) need:

```typescript
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ... }) }));
vi.mock("@/hooks/useTheme", () => ({ useTheme: () => ({ ... }) }));
```

These must come BEFORE the component import.

## DashboardOverview Onboarding Logic

Full "Get Set Up" card only shows when `completedCount < 2`.
Completed steps: githubConnected + slackConnected + (totalAnalyses > 0).
To test full card: set githubConnected=false, totalAnalyses=0.
