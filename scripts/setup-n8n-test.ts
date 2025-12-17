#!/usr/bin/env tsx
/**
 * Setup script for n8n workflow testing.
 * Helps set up the environment for functional testing.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('🔧 n8n Workflow Test Setup\n');
console.log('='.repeat(50));
console.log('');

console.log('📋 Prerequisites Checklist:\n');

const checks = [
  {
    name: 'API Service',
    command: 'npm run dev:api',
    port: 3000,
    endpoint: '/health',
  },
  {
    name: 'Slack Bot Service',
    command: 'npm run dev:slack-bot',
    port: 3001,
    endpoint: '/health (if implemented)',
  },
  {
    name: 'n8n Instance',
    command: 'docker-compose -f ../n8n/docker-compose.yml up',
    port: 5678,
    endpoint: 'http://localhost:5678',
  },
];

checks.forEach((check, index) => {
  console.log(`${index + 1}. ${check.name}`);
  console.log(`   Command: ${check.command}`);
  console.log(`   Port: ${check.port}`);
  console.log(`   Endpoint: ${check.endpoint}`);
  console.log('');
});

console.log('📝 Workflow Testing Steps:\n');
console.log('1. Start all required services (see above)');
console.log('2. Open n8n UI at http://localhost:5678');
console.log('3. Import workflow:');
console.log('   - Click "Workflows" → "Import from File"');
console.log('   - Select: n8n/workflows/ci-failure-analysis.json');
console.log('4. Activate the workflow');
console.log('5. Get the webhook URL from the webhook node');
console.log('6. Test the workflow:');
console.log('   curl -X POST <webhook-url> \\');
console.log('     -H "Content-Type: application/json" \\');
console.log('     -d \'{"log": "Error: test", "repository": "test-repo"}\'');
console.log('');

console.log('🧪 Run functional test:');
console.log('   npm run test:workflow-functional');
console.log('');

console.log('📚 For more details, see: n8n/workflows/README.md');
console.log('');

