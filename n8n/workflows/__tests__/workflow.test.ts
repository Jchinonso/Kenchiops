import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('n8n Workflow Validation', () => {
  const workflowPath = join(__dirname, '../ci-failure-analysis.json');
  let workflow: any;

  beforeAll(() => {
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    workflow = JSON.parse(workflowContent);
  });

  describe('Workflow Structure', () => {
    it('should have a valid workflow structure', () => {
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CI Failure Analysis Workflow');
      expect(workflow.nodes).toBeInstanceOf(Array);
      expect(workflow.connections).toBeDefined();
    });

    it('should have required nodes', () => {
      const nodeNames = workflow.nodes.map((node: any) => node.name);
      
      expect(nodeNames).toContain('Webhook - CI Failure');
      expect(nodeNames).toContain('HTTP Request - OpenAI Analysis');
      expect(nodeNames).toContain('HTTP Request - Post to Slack');
      expect(nodeNames).toContain('Respond to Webhook');
    });

    it('should have a webhook trigger node', () => {
      const webhookNode = workflow.nodes.find(
        (node: any) => node.type === 'n8n-nodes-base.webhook'
      );
      
      expect(webhookNode).toBeDefined();
      expect(webhookNode.parameters.path).toBe('ci-failure');
      expect(webhookNode.parameters.httpMethod).toBe('POST');
    });

    it('should have proper node connections', () => {
      expect(workflow.connections['Webhook - CI Failure']).toBeDefined();
      expect(workflow.connections['HTTP Request - OpenAI Analysis']).toBeDefined();
      expect(workflow.connections['HTTP Request - Post to Slack']).toBeDefined();
    });
  });

  describe('Workflow Configuration', () => {
    it('should have OpenAI analysis HTTP request configured', () => {
      const openaiNode = workflow.nodes.find(
        (node: any) => node.name === 'HTTP Request - OpenAI Analysis'
      );

      expect(openaiNode).toBeDefined();
      // Uses Docker service name for container-to-container communication
      expect(openaiNode.parameters.url).toBe('http://api:3000/api/analyze');
      expect(openaiNode.parameters.method).toBe('POST');
      expect(openaiNode.parameters.sendBody).toBe(true);
    });

    it('should have Slack notification HTTP request configured', () => {
      const slackNode = workflow.nodes.find(
        (node: any) => node.name === 'HTTP Request - Post to Slack'
      );

      expect(slackNode).toBeDefined();
      // Uses Docker service name for container-to-container communication
      expect(slackNode.parameters.url).toBe('http://slack-bot:3001/slack/message');
      expect(slackNode.parameters.method).toBe('POST');
    });

    it('should have response node configured', () => {
      const responseNode = workflow.nodes.find(
        (node: any) => node.name === 'Respond to Webhook'
      );
      
      expect(responseNode).toBeDefined();
      expect(responseNode.parameters.respondWith).toBe('json');
    });
  });

  describe('Workflow Flow', () => {
    it('should have correct flow: Webhook → OpenAI → Slack → Response', () => {
      const connections = workflow.connections;
      
      // Webhook connects to OpenAI
      expect(connections['Webhook - CI Failure'].main[0][0].node).toBe(
        'HTTP Request - OpenAI Analysis'
      );
      
      // OpenAI connects to Slack
      expect(connections['HTTP Request - OpenAI Analysis'].main[0][0].node).toBe(
        'HTTP Request - Post to Slack'
      );
      
      // Slack connects to Response
      expect(connections['HTTP Request - Post to Slack'].main[0][0].node).toBe(
        'Respond to Webhook'
      );
    });
  });

  describe('Workflow Data Flow', () => {
    it('should extract failure_log from webhook body', () => {
      const openaiNode = workflow.nodes.find(
        (node: any) => node.name === 'HTTP Request - OpenAI Analysis'
      );
      
      const failureLogParam = openaiNode.parameters.bodyParameters.parameters.find(
        (p: any) => p.name === 'failure_log'
      );
      
      expect(failureLogParam).toBeDefined();
      expect(failureLogParam.value).toBe('={{ $json.body.log }}');
    });

    it('should extract repository from webhook body', () => {
      const openaiNode = workflow.nodes.find(
        (node: any) => node.name === 'HTTP Request - OpenAI Analysis'
      );
      
      const repoParam = openaiNode.parameters.bodyParameters.parameters.find(
        (p: any) => p.name === 'repository'
      );
      
      expect(repoParam).toBeDefined();
      expect(repoParam.value).toBe('={{ $json.body.repository }}');
    });

    it('should pass analysis result to Slack', () => {
      const slackNode = workflow.nodes.find(
        (node: any) => node.name === 'HTTP Request - Post to Slack'
      );

      const messageParam = slackNode.parameters.bodyParameters.parameters.find(
        (p: any) => p.name === 'message'
      );

      expect(messageParam).toBeDefined();
      // The message includes formatted analysis with summary, cause, and actions
      expect(messageParam.value).toContain('CI Failure Analysis');
      expect(messageParam.value).toContain('$json.analysis');
      expect(messageParam.value).toContain('$json.repository');
      expect(messageParam.value).toContain('$json.confidence');
    });
  });
});

