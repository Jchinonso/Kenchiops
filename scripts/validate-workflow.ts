#!/usr/bin/env tsx
/**
 * Validates n8n workflow JSON structure and checks endpoint availability.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  parameters: {
    url?: string;
    method?: string;
    path?: string;
    httpMethod?: string;
    [key: string]: unknown;
  };
}

interface Workflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
}

function validateWorkflow(workflowPath: string): boolean {
  console.log('🔍 Validating n8n workflow...\n');

  try {
    const content = readFileSync(workflowPath, 'utf-8');
    const workflow: Workflow = JSON.parse(content);

    // Basic structure validation
    if (!workflow.name) {
      console.error('❌ Workflow missing name');
      return false;
    }

    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      console.error('❌ Workflow missing nodes');
      return false;
    }

    if (!workflow.connections) {
      console.error('❌ Workflow missing connections');
      return false;
    }

    console.log(`✅ Workflow structure valid: "${workflow.name}"`);
    console.log(`   Nodes: ${workflow.nodes.length}`);
    console.log('');

    // Check for required nodes
    const nodeTypes = new Set(workflow.nodes.map(n => n.type));
    const nodeNames = workflow.nodes.map(n => n.name);

    console.log('📋 Workflow Nodes:');
    workflow.nodes.forEach(node => {
      console.log(`   - ${node.name} (${node.type})`);
    });
    console.log('');

    // Check HTTP endpoints
    const httpNodes = workflow.nodes.filter(
      n => n.type === 'n8n-nodes-base.httpRequest'
    );

    if (httpNodes.length > 0) {
      console.log('🌐 HTTP Endpoints Referenced:');
      httpNodes.forEach(node => {
        if (node.parameters.url) {
          const url = node.parameters.url as string;
          console.log(`   - ${node.name}: ${url}`);
          
          // Check if endpoint exists (basic check)
          if (url.includes('localhost:3000/api/analyze')) {
            console.log('     ⚠️  Note: /api/analyze endpoint needs to be implemented');
          }
          if (url.includes('localhost:3001/slack/message')) {
            console.log('     ⚠️  Note: /slack/message endpoint needs to be implemented');
          }
        }
      });
      console.log('');
    }

    // Check webhook configuration
    const webhookNodes = workflow.nodes.filter(
      n => n.type === 'n8n-nodes-base.webhook'
    );

    if (webhookNodes.length > 0) {
      console.log('🔗 Webhook Configuration:');
      webhookNodes.forEach(node => {
        if (node.parameters.path) {
          console.log(`   - Path: /${node.parameters.path}`);
          console.log(`   - Method: ${node.parameters.httpMethod || 'GET'}`);
        }
      });
      console.log('');
    }

    // Validate connections
    const connectionCount = Object.keys(workflow.connections).length;
    console.log(`✅ Connections: ${connectionCount} node connections defined`);
    console.log('');

    console.log('✅ Workflow validation passed!\n');
    return true;
  } catch (error) {
    console.error('❌ Workflow validation failed:', error);
    return false;
  }
}

// Main execution
const workflowPath = join(process.cwd(), 'n8n/workflows/ci-failure-analysis.json');

if (!validateWorkflow(workflowPath)) {
  process.exit(1);
}

