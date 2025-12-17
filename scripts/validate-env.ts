#!/usr/bin/env tsx
/**
 * Environment variable validation script.
 * Checks that all required environment variables are set.
 */

import { config } from '../packages/shared/src/config.js';

interface RequiredVar {
  name: string;
  value: string;
  required: boolean;
}

const requiredVars: RequiredVar[] = [
  { name: 'OPENAI_API_KEY', value: config.OPENAI_API_KEY, required: true },
  { name: 'SLACK_BOT_TOKEN', value: config.SLACK_BOT_TOKEN, required: false },
  { name: 'SLACK_SIGNING_SECRET', value: config.SLACK_SIGNING_SECRET, required: false },
  { name: 'GITHUB_APP_ID', value: config.GITHUB_APP_ID, required: false },
  { name: 'GITHUB_APP_PRIVATE_KEY', value: config.GITHUB_APP_PRIVATE_KEY, required: false },
  { name: 'DATABASE_URL', value: config.DATABASE_URL, required: false },
];

function validateEnv(): boolean {
  const missing: string[] = [];
  const warnings: string[] = [];

  console.log('🔍 Validating environment variables...\n');

  for (const envVar of requiredVars) {
    if (envVar.value) {
      const masked = envVar.value.length > 8 
        ? `${envVar.value.substring(0, 4)}...${envVar.value.substring(envVar.value.length - 4)}`
        : '***';
      console.log(`✅ ${envVar.name}: ${masked}`);
    } else {
      if (envVar.required) {
        missing.push(envVar.name);
        console.log(`❌ ${envVar.name}: MISSING (required)`);
      } else {
        warnings.push(envVar.name);
        console.log(`⚠️  ${envVar.name}: not set (optional)`);
      }
    }
  }

  console.log('');

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(name => console.error(`   - ${name}`));
    console.error('\nPlease set these variables in your .env file.');
    return false;
  }

  if (warnings.length > 0) {
    console.log('⚠️  Optional environment variables not set:');
    warnings.forEach(name => console.log(`   - ${name}`));
    console.log('These may be needed depending on which services you use.\n');
  }

  console.log('✅ Environment validation passed!\n');
  return true;
}

if (!validateEnv()) {
  process.exit(1);
}

