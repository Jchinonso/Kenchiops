#!/usr/bin/env tsx
/**
 * End-to-end test for n8n workflow.
 * Tests the complete workflow by making actual HTTP requests.
 */

import http from 'http';

const API_URL = 'http://localhost:3000';
const SLACK_BOT_URL = 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  response?: unknown;
}

/**
 * Make HTTP request
 */
function httpRequest(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ statusCode?: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, data });
        });
      }
    );

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Test API analyze endpoint
 */
async function testAPIAnalyze(): Promise<TestResult> {
  try {
    const response = await httpRequest(`${API_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        failure_log: 'Error: Test failed\n  at test.js:10',
        repository: 'test-repo',
      }),
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.data);
      return {
        name: 'API /api/analyze endpoint',
        passed: true,
        message: 'Endpoint responded successfully',
        response: data,
      };
    } else {
      return {
        name: 'API /api/analyze endpoint',
        passed: false,
        message: `Unexpected status: ${response.statusCode}`,
        response: response.data,
      };
    }
  } catch (error) {
    return {
      name: 'API /api/analyze endpoint',
      passed: false,
      message: `Request failed: ${error}`,
    };
  }
}

/**
 * Test Slack message endpoint
 */
async function testSlackMessage(): Promise<TestResult> {
  try {
    const response = await httpRequest(`${SLACK_BOT_URL}/slack/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#devops',
        message: 'Test message from workflow',
      }),
    });

    if (response.statusCode === 200) {
      const data = JSON.parse(response.data);
      return {
        name: 'Slack /slack/message endpoint',
        passed: true,
        message: 'Endpoint responded successfully',
        response: data,
      };
    } else {
      return {
        name: 'Slack /slack/message endpoint',
        passed: false,
        message: `Unexpected status: ${response.statusCode}`,
        response: response.data,
      };
    }
  } catch (error) {
    return {
      name: 'Slack /slack/message endpoint',
      passed: false,
      message: `Request failed: ${error}`,
    };
  }
}

/**
 * Test workflow flow simulation
 */
async function testWorkflowFlow(): Promise<TestResult> {
  try {
    // Step 1: Call analyze endpoint
    const analyzeResponse = await httpRequest(`${API_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        failure_log: 'Error: CI test failed',
        repository: 'kenchi',
      }),
    });

    if (analyzeResponse.statusCode !== 200) {
      return {
        name: 'Workflow flow simulation',
        passed: false,
        message: 'Analyze endpoint failed',
      };
    }

    const analysis = JSON.parse(analyzeResponse.data);

    // Step 2: Call Slack endpoint with analysis result
    const slackResponse = await httpRequest(`${SLACK_BOT_URL}/slack/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#devops',
        message: analysis.analysis || 'Analysis completed',
      }),
    });

    if (slackResponse.statusCode === 200) {
      return {
        name: 'Workflow flow simulation',
        passed: true,
        message: 'Complete workflow flow executed successfully',
        response: {
          analysis: analysis.analysis,
          slackStatus: JSON.parse(slackResponse.data),
        },
      };
    } else {
      return {
        name: 'Workflow flow simulation',
        passed: false,
        message: 'Slack endpoint failed',
      };
    }
  } catch (error) {
    return {
      name: 'Workflow flow simulation',
      passed: false,
      message: `Workflow test failed: ${error}`,
    };
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  console.log('🧪 n8n Workflow End-to-End Test\n');
  console.log('='.repeat(50));
  console.log('');

  const results: TestResult[] = [];

  // Test individual endpoints
  console.log('1. Testing API analyze endpoint...');
  const apiResult = await testAPIAnalyze();
  results.push(apiResult);
  console.log(`   ${apiResult.passed ? '✅' : '❌'} ${apiResult.name}`);
  console.log(`   ${apiResult.message}`);
  if (apiResult.response) {
    console.log(`   Response: ${JSON.stringify(apiResult.response, null, 2).split('\n').join('\n   ')}`);
  }
  console.log('');

  console.log('2. Testing Slack message endpoint...');
  const slackResult = await testSlackMessage();
  results.push(slackResult);
  console.log(`   ${slackResult.passed ? '✅' : '❌'} ${slackResult.name}`);
  console.log(`   ${slackResult.message}`);
  if (slackResult.response) {
    console.log(`   Response: ${JSON.stringify(slackResult.response, null, 2).split('\n').join('\n   ')}`);
  }
  console.log('');

  // Test complete workflow flow
  console.log('3. Testing complete workflow flow...');
  const flowResult = await testWorkflowFlow();
  results.push(flowResult);
  console.log(`   ${flowResult.passed ? '✅' : '❌'} ${flowResult.name}`);
  console.log(`   ${flowResult.message}`);
  if (flowResult.response) {
    console.log(`   Flow result: ${JSON.stringify(flowResult.response, null, 2).split('\n').join('\n   ')}`);
  }
  console.log('');

  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log('='.repeat(50));
  console.log(`\n📊 Test Summary: ${passed}/${total} tests passed\n`);

  if (passed === total) {
    console.log('✅ All tests passed! Workflow endpoints are functional.');
    console.log('\n📝 Next steps:');
    console.log('   1. Start n8n: docker-compose -f ../n8n/docker-compose.yml up');
    console.log('   2. Import workflow: n8n/workflows/ci-failure-analysis.json');
    console.log('   3. Activate workflow and test via webhook URL');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please check the service status:');
    console.log('   - API service: npm run dev:api');
    console.log('   - Slack bot: npm run dev:slack-bot');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

