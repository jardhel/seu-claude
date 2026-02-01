import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { ComplianceReporter, ComplianceControl } from './ComplianceReporter.js';
import { AuditTrail } from './AuditTrail.js';

describe('ComplianceReporter', () => {
  let testDir: string;
  let audit: AuditTrail;
  let reporter: ComplianceReporter;

  beforeEach(async () => {
    testDir = join(tmpdir(), `compliance-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    audit = new AuditTrail({ logDir: testDir });
    reporter = new ComplianceReporter({ auditTrail: audit });
  });

  afterEach(async () => {
    await audit.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates reporter with audit trail', () => {
      expect(reporter).toBeDefined();
    });

    it('creates reporter with custom framework', () => {
      const customReporter = new ComplianceReporter({
        auditTrail: audit,
        framework: 'SOC2',
      });
      expect(customReporter.getFramework()).toBe('SOC2');
    });

    it('defaults to SOC2 framework', () => {
      expect(reporter.getFramework()).toBe('SOC2');
    });
  });

  describe('control management', () => {
    it('registers compliance controls', () => {
      const control: ComplianceControl = {
        id: 'CC1.1',
        name: 'Logical Access Controls',
        description: 'Access to system is restricted to authorized users',
        category: 'Security',
        evidenceTypes: ['security_event', 'user_action'],
      };

      reporter.registerControl(control);
      expect(reporter.getControl('CC1.1')).toBeDefined();
      expect(reporter.getControl('CC1.1')?.name).toBe('Logical Access Controls');
    });

    it('lists all registered controls', () => {
      reporter.registerControl({
        id: 'CC1.1',
        name: 'Control 1',
        description: 'Desc 1',
        category: 'Security',
        evidenceTypes: ['security_event'],
      });
      reporter.registerControl({
        id: 'CC1.2',
        name: 'Control 2',
        description: 'Desc 2',
        category: 'Security',
        evidenceTypes: ['user_action'],
      });

      const controls = reporter.listControls();
      expect(controls.length).toBe(2);
      expect(controls.map(c => c.id)).toContain('CC1.1');
      expect(controls.map(c => c.id)).toContain('CC1.2');
    });

    it('groups controls by category', () => {
      reporter.registerControl({
        id: 'CC1.1',
        name: 'Control 1',
        description: 'Desc',
        category: 'Security',
        evidenceTypes: [],
      });
      reporter.registerControl({
        id: 'CC2.1',
        name: 'Control 2',
        description: 'Desc',
        category: 'Availability',
        evidenceTypes: [],
      });
      reporter.registerControl({
        id: 'CC1.2',
        name: 'Control 3',
        description: 'Desc',
        category: 'Security',
        evidenceTypes: [],
      });

      const grouped = reporter.getControlsByCategory();
      expect(grouped['Security'].length).toBe(2);
      expect(grouped['Availability'].length).toBe(1);
    });
  });

  describe('evidence collection', () => {
    beforeEach(async () => {
      // Register controls
      reporter.registerControl({
        id: 'CC6.1',
        name: 'Logical Access Security',
        description: 'Access controls are in place',
        category: 'Security',
        evidenceTypes: ['security_event'],
      });
      reporter.registerControl({
        id: 'CC7.1',
        name: 'System Operations',
        description: 'System operations are monitored',
        category: 'Operations',
        evidenceTypes: ['tool_invocation'],
      });

      // Create audit events
      await audit.log({
        type: 'security_event',
        severity: 'info',
        message: 'User authentication successful',
      });
      await audit.log({
        type: 'security_event',
        severity: 'warning',
        message: 'Failed login attempt',
      });
      await audit.log({
        type: 'tool_invocation',
        tool: 'execute_sandbox',
        params: { command: 'npm test' },
      });
    });

    it('collects evidence for controls from audit trail', async () => {
      const evidence = await reporter.collectEvidence('CC6.1');
      expect(evidence.length).toBe(2);
      expect(evidence.every(e => e.type === 'security_event')).toBe(true);
    });

    it('collects evidence within time range', async () => {
      const now = Date.now();
      const evidence = await reporter.collectEvidence('CC6.1', {
        startTime: now - 1000,
        endTime: now + 1000,
      });
      expect(evidence.length).toBe(2);
    });

    it('returns empty array for control with no evidence', async () => {
      reporter.registerControl({
        id: 'CC9.1',
        name: 'No Evidence Control',
        description: 'Desc',
        category: 'Test',
        evidenceTypes: ['file_change'],
      });

      const evidence = await reporter.collectEvidence('CC9.1');
      expect(evidence.length).toBe(0);
    });
  });

  describe('control assessment', () => {
    beforeEach(async () => {
      reporter.registerControl({
        id: 'CC6.1',
        name: 'Logical Access',
        description: 'Access controls',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      });

      await audit.log({
        type: 'security_event',
        severity: 'info',
        message: 'Access granted',
      });
    });

    it('assesses control status based on evidence', async () => {
      const status = await reporter.assessControl('CC6.1');
      expect(status.controlId).toBe('CC6.1');
      expect(status.status).toBe('compliant');
      expect(status.evidenceCount).toBeGreaterThan(0);
    });

    it('marks control as non-compliant when insufficient evidence', async () => {
      reporter.registerControl({
        id: 'CC9.1',
        name: 'Insufficient Evidence',
        description: 'Desc',
        category: 'Test',
        evidenceTypes: ['file_change'],
        minimumEvidence: 5,
      });

      const status = await reporter.assessControl('CC9.1');
      expect(status.status).toBe('non-compliant');
    });

    it('marks control as not-tested when no evidence types configured', async () => {
      reporter.registerControl({
        id: 'CC9.2',
        name: 'Not Tested',
        description: 'Desc',
        category: 'Test',
        evidenceTypes: [],
      });

      const status = await reporter.assessControl('CC9.2');
      expect(status.status).toBe('not-tested');
    });

    it('allows manual override of control status', async () => {
      await reporter.setControlStatus('CC6.1', 'non-compliant', 'Manual override for testing');
      const status = await reporter.assessControl('CC6.1');
      expect(status.status).toBe('non-compliant');
      expect(status.notes).toBe('Manual override for testing');
    });
  });

  describe('report generation', () => {
    beforeEach(async () => {
      // Register SOC2-like controls
      reporter.registerControl({
        id: 'CC1.1',
        name: 'Control Environment',
        description: 'Management demonstrates commitment',
        category: 'Control Environment',
        evidenceTypes: ['user_action'],
        minimumEvidence: 1,
      });
      reporter.registerControl({
        id: 'CC6.1',
        name: 'Logical Access',
        description: 'Access is restricted',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      });

      // Create evidence
      await audit.log({
        type: 'user_action',
        action: 'approve_plan',
        details: {},
      });
      await audit.log({
        type: 'security_event',
        severity: 'info',
        message: 'Access check passed',
      });
    });

    it('generates compliance report', async () => {
      const report = await reporter.generateReport();

      expect(report.framework).toBe('SOC2');
      expect(report.generatedAt).toBeDefined();
      expect(report.controls).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('includes control assessments in report', async () => {
      const report = await reporter.generateReport();

      expect(report.controls.length).toBe(2);
      expect(report.controls.find(c => c.controlId === 'CC1.1')).toBeDefined();
      expect(report.controls.find(c => c.controlId === 'CC6.1')).toBeDefined();
    });

    it('calculates compliance score', async () => {
      const report = await reporter.generateReport();

      expect(report.summary.totalControls).toBe(2);
      expect(report.summary.compliantCount).toBeGreaterThanOrEqual(0);
      expect(report.summary.complianceScore).toBeDefined();
      expect(report.summary.complianceScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.complianceScore).toBeLessThanOrEqual(100);
    });

    it('includes time period in report', async () => {
      const startTime = Date.now() - 86400000; // 1 day ago
      const endTime = Date.now();

      const report = await reporter.generateReport({ startTime, endTime });

      expect(report.period.startTime).toBe(startTime);
      expect(report.period.endTime).toBe(endTime);
    });
  });

  describe('export formats', () => {
    beforeEach(async () => {
      reporter.registerControl({
        id: 'CC1.1',
        name: 'Test Control',
        description: 'Test description',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      });

      await audit.log({
        type: 'security_event',
        severity: 'info',
        message: 'Test event',
      });
    });

    it('exports report as JSON', async () => {
      const json = await reporter.exportAsJson();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.framework).toBe('SOC2');
      expect(parsed.controls).toBeDefined();
    });

    it('exports report as CSV', async () => {
      const csv = await reporter.exportAsCsv();

      expect(typeof csv).toBe('string');
      expect(csv).toContain('Control ID');
      expect(csv).toContain('CC1.1');
      expect(csv).toContain('Test Control');
    });

    it('exports report as Markdown', async () => {
      const md = await reporter.exportAsMarkdown();

      expect(typeof md).toBe('string');
      expect(md).toContain('# Compliance Report');
      expect(md).toContain('SOC2');
      expect(md).toContain('CC1.1');
    });

    it('exports with filtered date range', async () => {
      const now = Date.now();
      const json = await reporter.exportAsJson({
        startTime: now - 1000,
        endTime: now + 1000,
      });

      const parsed = JSON.parse(json);
      expect(parsed.period.startTime).toBeDefined();
    });
  });

  describe('built-in SOC2 controls', () => {
    it('loads SOC2 Trust Service Criteria', () => {
      reporter.loadSOC2Controls();

      const controls = reporter.listControls();
      expect(controls.length).toBeGreaterThan(0);

      // Check for common SOC2 control categories
      const categories = [...new Set(controls.map(c => c.category))];
      expect(categories).toContain('Security');
    });

    it('includes security controls', () => {
      reporter.loadSOC2Controls();

      const securityControls = reporter.getControlsByCategory()['Security'];
      expect(securityControls).toBeDefined();
      expect(securityControls.length).toBeGreaterThan(0);
    });
  });

  describe('evidence summary', () => {
    beforeEach(async () => {
      reporter.registerControl({
        id: 'CC6.1',
        name: 'Access Control',
        description: 'Desc',
        category: 'Security',
        evidenceTypes: ['security_event', 'user_action'],
      });

      // Create varied evidence
      for (let i = 0; i < 5; i++) {
        await audit.log({
          type: 'security_event',
          severity: i % 2 === 0 ? 'info' : 'warning',
          message: `Event ${i}`,
        });
      }
      await audit.log({
        type: 'user_action',
        action: 'approve',
        details: {},
      });
    });

    it('generates evidence summary for control', async () => {
      const summary = await reporter.getEvidenceSummary('CC6.1');

      expect(summary.totalEvents).toBe(6);
      expect(summary.byType['security_event']).toBe(5);
      expect(summary.byType['user_action']).toBe(1);
    });

    it('includes severity breakdown for security events', async () => {
      const summary = await reporter.getEvidenceSummary('CC6.1');

      expect(summary.bySeverity).toBeDefined();
      expect(summary.bySeverity?.info).toBeGreaterThan(0);
      expect(summary.bySeverity?.warning).toBeGreaterThan(0);
    });
  });

  describe('compliance gaps', () => {
    beforeEach(() => {
      reporter.registerControl({
        id: 'CC1.1',
        name: 'Has Evidence',
        description: 'Desc',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      });
      reporter.registerControl({
        id: 'CC2.1',
        name: 'No Evidence',
        description: 'Desc',
        category: 'Availability',
        evidenceTypes: ['file_change'],
        minimumEvidence: 5,
      });
    });

    it('identifies compliance gaps', async () => {
      await audit.log({
        type: 'security_event',
        severity: 'info',
        message: 'Test',
      });

      const gaps = await reporter.identifyGaps();

      expect(gaps.length).toBe(1);
      expect(gaps[0].controlId).toBe('CC2.1');
      expect(gaps[0].reason).toContain('evidence');
    });

    it('provides remediation suggestions', async () => {
      const gaps = await reporter.identifyGaps();

      expect(gaps[0].remediation).toBeDefined();
      expect(typeof gaps[0].remediation).toBe('string');
    });
  });
});
