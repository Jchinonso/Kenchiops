# Troubleshooting: TypeScript Build Errors

## Overview

This guide helps diagnose and resolve TypeScript compilation errors in CI pipelines.

## Common Error Categories

### 1. Type Mismatch Errors

**Error Pattern:**

```
error TS2322: Type 'string' is not assignable to type 'number'.
```

**Causes:**

- Function return type changed
- API response shape changed
- Incorrect type assertion

**Resolution:**

1. Check the line number in the error
2. Verify the expected type
3. Update the value or type definition

```typescript
// Before (error)
const count: number = getData(); // returns string

// After (fixed)
const count: number = parseInt(getData(), 10);
// Or update the type
const count: string = getData();
```

### 2. Missing Property Errors

**Error Pattern:**

```
error TS2339: Property 'foo' does not exist on type 'Bar'.
```

**Causes:**

- Interface definition incomplete
- Object shape changed
- Typo in property name

**Resolution:**

```typescript
// Add missing property to interface
interface Bar {
  existingProp: string;
  foo: string; // Add this
}

// Or use optional chaining if property may not exist
const value = obj.foo ?? defaultValue;
```

### 3. Module Not Found

**Error Pattern:**

```
error TS2307: Cannot find module '@company/shared' or its corresponding type declarations.
```

**Causes:**

- Package not installed
- Incorrect import path
- Missing type definitions
- tsconfig paths not configured

**Resolution:**

```bash
# Install missing package
npm install @company/shared

# Install types if needed
npm install -D @types/package-name

# Check tsconfig.json paths
{
  "compilerOptions": {
    "paths": {
      "@company/shared": ["./packages/shared/src"]
    }
  }
}
```

### 4. Strict Null Checks

**Error Pattern:**

```
error TS2531: Object is possibly 'null'.
```

**Causes:**

- Accessing property without null check
- Function may return null/undefined
- Strict mode enabled

**Resolution:**

```typescript
// Option 1: Null check
if (user !== null) {
  console.log(user.name);
}

// Option 2: Optional chaining
console.log(user?.name);

// Option 3: Non-null assertion (use carefully)
console.log(user!.name);

// Option 4: Default value
const name = user?.name ?? "Anonymous";
```

### 5. Generic Type Errors

**Error Pattern:**

```
error TS2344: Type 'string' does not satisfy the constraint 'object'.
```

**Causes:**

- Generic constraint not met
- Incorrect type parameter
- Generic inference failed

**Resolution:**

```typescript
// Ensure type meets constraint
function process<T extends object>(data: T): T {
  return data;
}

// Correct usage
process({ key: "value" }); // OK
process("string"); // Error - string is not object
```

## CI-Specific Issues

### Incremental Build Cache Issues

**Symptoms:**

- Build fails in CI but passes locally
- Error references files that were deleted

**Resolution:**

```yaml
# Clear TypeScript cache in CI
- run: rm -rf node_modules/.cache/typescript
- run: npm run build
```

### Different TypeScript Versions

**Symptoms:**

- Build passes with one TS version, fails with another
- New errors after CI image update

**Resolution:**

```json
// Lock TypeScript version in package.json
{
  "devDependencies": {
    "typescript": "5.3.3"
  }
}
```

## Quick Fixes Checklist

- [ ] Run `npm install` to ensure dependencies are current
- [ ] Run `npx tsc --noEmit` locally to reproduce
- [ ] Check for recent changes to shared types/interfaces
- [ ] Verify tsconfig.json matches CI configuration
- [ ] Clear build cache and retry

## Related Documents

- [Build Failure Recovery](../runbooks/build-failure-recovery.md)
- [CI Configuration Guide](../internal/ci-configuration.md)

## Tags

`typescript` `build-error` `compilation` `type-checking`
