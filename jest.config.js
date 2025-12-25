/** @type {import('jest').Config} */
const isCI = process.env.CI === 'true';

const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/services'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  
  // Performance optimizations
  maxWorkers: process.env.CI ? '50%' : '100%', // Use 50% of CPUs in CI to avoid overload
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Faster test execution
  testTimeout: 10000, // 10 second timeout per test
  bail: false, // Don't bail on first failure (run all tests for better CI feedback)
  
  // Optimize transform cache
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      isolatedModules: true, // Faster compilation by skipping type checking
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022',
        moduleResolution: 'node',
        allowImportingTsExtensions: false,
      },
    }],
  },
  
  moduleNameMapper: {
    '^@kenchi/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Optimize coverage collection (only collect when needed)
  collectCoverageFrom: [
    'packages/**/*.ts',
    'services/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  // Use faster coverage reporters in CI
  coverageReporters: process.env.CI 
    ? ['text', 'lcov', 'json-summary'] // Skip HTML in CI for speed
    : ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  
  // Performance: reduce verbosity in CI
  verbose: process.env.CI !== 'true',
  silent: false,
  
  // Detect open handles (helps with the warning about async operations)
  detectOpenHandles: false, // Set to true only when debugging
  // Force exit in CI to avoid hanging
  forceExit: isCI,
};

export default config;

