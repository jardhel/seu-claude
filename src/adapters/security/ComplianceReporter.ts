import { AuditTrail, AuditEvent, AuditQueryOptions } from './AuditTrail.js';

/**
 * Control status types
 */
export type ControlStatus = 'compliant' | 'non-compliant' | 'not-tested';

/**
 * Compliance control definition
 */
export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  evidenceTypes: string[];
  minimumEvidence?: number;
}

/**
 * Control assessment result
 */
export interface ControlAssessment {
  controlId: string;
  controlName: string;
  status: ControlStatus;
  evidenceCount: number;
  lastEvidenceAt?: number;
  notes?: string;
}

/**
 * Compliance report summary
 */
export interface ComplianceSummary {
  totalControls: number;
  compliantCount: number;
  nonCompliantCount: number;
  notTestedCount: number;
  complianceScore: number;
}

/**
 * Report time period
 */
export interface ReportPeriod {
  startTime?: number;
  endTime?: number;
}

/**
 * Full compliance report
 */
export interface ComplianceReport {
  framework: string;
  generatedAt: number;
  period: ReportPeriod;
  controls: ControlAssessment[];
  summary: ComplianceSummary;
}

/**
 * Evidence summary
 */
export interface EvidenceSummary {
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity?: Record<string, number>;
}

/**
 * Compliance gap
 */
export interface ComplianceGap {
  controlId: string;
  controlName: string;
  reason: string;
  remediation: string;
}

/**
 * Reporter options
 */
export interface ComplianceReporterOptions {
  auditTrail: AuditTrail;
  framework?: string;
}

/**
 * Report generation options
 */
export interface ReportOptions {
  startTime?: number;
  endTime?: number;
}

/**
 * Internal control status override
 */
interface ControlOverride {
  status: ControlStatus;
  notes?: string;
}

/**
 * ComplianceReporter - SOC2-style compliance report generation
 *
 * Features:
 * - Control management and registration
 * - Evidence collection from audit trail
 * - Automated control assessment
 * - Multiple export formats (JSON, CSV, Markdown)
 * - Built-in SOC2 controls
 * - Compliance gap identification
 */
export class ComplianceReporter {
  private readonly auditTrail: AuditTrail;
  private readonly framework: string;
  private controls: Map<string, ComplianceControl> = new Map();
  private overrides: Map<string, ControlOverride> = new Map();

  constructor(options: ComplianceReporterOptions) {
    this.auditTrail = options.auditTrail;
    this.framework = options.framework ?? 'SOC2';
  }

  /**
   * Get the compliance framework name
   */
  getFramework(): string {
    return this.framework;
  }

  /**
   * Register a compliance control
   */
  registerControl(control: ComplianceControl): void {
    this.controls.set(control.id, control);
  }

  /**
   * Get a control by ID
   */
  getControl(id: string): ComplianceControl | undefined {
    return this.controls.get(id);
  }

  /**
   * List all registered controls
   */
  listControls(): ComplianceControl[] {
    return Array.from(this.controls.values());
  }

  /**
   * Group controls by category
   */
  getControlsByCategory(): Record<string, ComplianceControl[]> {
    const grouped: Record<string, ComplianceControl[]> = {};

    for (const control of this.controls.values()) {
      if (!grouped[control.category]) {
        grouped[control.category] = [];
      }
      grouped[control.category].push(control);
    }

    return grouped;
  }

  /**
   * Collect evidence for a control from the audit trail
   */
  async collectEvidence(controlId: string, options?: ReportOptions): Promise<AuditEvent[]> {
    const control = this.controls.get(controlId);
    if (!control || control.evidenceTypes.length === 0) {
      return [];
    }

    const allEvidence: AuditEvent[] = [];

    for (const eventType of control.evidenceTypes) {
      const queryOptions: AuditQueryOptions = {
        type: eventType as AuditEvent['type'],
        startTime: options?.startTime,
        endTime: options?.endTime,
      };

      const events = await this.auditTrail.query(queryOptions);
      allEvidence.push(...events);
    }

    // Sort by timestamp
    return allEvidence.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }

  /**
   * Assess a control's compliance status
   */
  async assessControl(controlId: string, options?: ReportOptions): Promise<ControlAssessment> {
    const control = this.controls.get(controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    // Check for manual override
    const override = this.overrides.get(controlId);
    if (override) {
      const evidence = await this.collectEvidence(controlId, options);
      return {
        controlId,
        controlName: control.name,
        status: override.status,
        evidenceCount: evidence.length,
        lastEvidenceAt: evidence.length > 0 ? evidence[evidence.length - 1].timestamp : undefined,
        notes: override.notes,
      };
    }

    // Check if control has no evidence types (not tested)
    if (control.evidenceTypes.length === 0) {
      return {
        controlId,
        controlName: control.name,
        status: 'not-tested',
        evidenceCount: 0,
      };
    }

    // Collect evidence
    const evidence = await this.collectEvidence(controlId, options);
    const minimumEvidence = control.minimumEvidence ?? 1;

    // Determine status
    let status: ControlStatus;
    if (evidence.length >= minimumEvidence) {
      status = 'compliant';
    } else {
      status = 'non-compliant';
    }

    return {
      controlId,
      controlName: control.name,
      status,
      evidenceCount: evidence.length,
      lastEvidenceAt: evidence.length > 0 ? evidence[evidence.length - 1].timestamp : undefined,
    };
  }

  /**
   * Set manual override for control status
   */
  async setControlStatus(controlId: string, status: ControlStatus, notes?: string): Promise<void> {
    this.overrides.set(controlId, { status, notes });
  }

  /**
   * Generate compliance report
   */
  async generateReport(options?: ReportOptions): Promise<ComplianceReport> {
    const controlAssessments: ControlAssessment[] = [];

    for (const controlId of this.controls.keys()) {
      const assessment = await this.assessControl(controlId, options);
      controlAssessments.push(assessment);
    }

    // Calculate summary
    const totalControls = controlAssessments.length;
    const compliantCount = controlAssessments.filter(c => c.status === 'compliant').length;
    const nonCompliantCount = controlAssessments.filter(c => c.status === 'non-compliant').length;
    const notTestedCount = controlAssessments.filter(c => c.status === 'not-tested').length;

    // Compliance score: compliant / (total - not-tested) * 100
    const testedControls = totalControls - notTestedCount;
    const complianceScore = testedControls > 0 ? (compliantCount / testedControls) * 100 : 0;

    return {
      framework: this.framework,
      generatedAt: Date.now(),
      period: {
        startTime: options?.startTime,
        endTime: options?.endTime,
      },
      controls: controlAssessments,
      summary: {
        totalControls,
        compliantCount,
        nonCompliantCount,
        notTestedCount,
        complianceScore: Math.round(complianceScore * 100) / 100,
      },
    };
  }

  /**
   * Export report as JSON
   */
  async exportAsJson(options?: ReportOptions): Promise<string> {
    const report = await this.generateReport(options);
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV
   */
  async exportAsCsv(options?: ReportOptions): Promise<string> {
    const report = await this.generateReport(options);

    const headers = ['Control ID', 'Control Name', 'Status', 'Evidence Count', 'Last Evidence At', 'Notes'];
    const rows = report.controls.map(c => [
      c.controlId,
      c.controlName,
      c.status,
      c.evidenceCount.toString(),
      c.lastEvidenceAt ? new Date(c.lastEvidenceAt).toISOString() : '',
      c.notes ?? '',
    ]);

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ];

    return csvLines.join('\n');
  }

  /**
   * Export report as Markdown
   */
  async exportAsMarkdown(options?: ReportOptions): Promise<string> {
    const report = await this.generateReport(options);

    const lines: string[] = [
      '# Compliance Report',
      '',
      `**Framework:** ${report.framework}`,
      `**Generated:** ${new Date(report.generatedAt).toISOString()}`,
      '',
      '## Summary',
      '',
      `- Total Controls: ${report.summary.totalControls}`,
      `- Compliant: ${report.summary.compliantCount}`,
      `- Non-Compliant: ${report.summary.nonCompliantCount}`,
      `- Not Tested: ${report.summary.notTestedCount}`,
      `- **Compliance Score: ${report.summary.complianceScore}%**`,
      '',
      '## Control Assessments',
      '',
      '| Control ID | Name | Status | Evidence Count |',
      '|------------|------|--------|----------------|',
    ];

    for (const control of report.controls) {
      const statusEmoji = control.status === 'compliant' ? 'Pass' : control.status === 'non-compliant' ? 'Fail' : 'N/A';
      lines.push(`| ${control.controlId} | ${control.controlName} | ${statusEmoji} | ${control.evidenceCount} |`);
    }

    return lines.join('\n');
  }

  /**
   * Load built-in SOC2 Trust Service Criteria controls
   */
  loadSOC2Controls(): void {
    const soc2Controls: ComplianceControl[] = [
      // Security (Common Criteria)
      {
        id: 'CC1.1',
        name: 'COSO Principle 1',
        description: 'The entity demonstrates a commitment to integrity and ethical values',
        category: 'Control Environment',
        evidenceTypes: ['user_action'],
        minimumEvidence: 1,
      },
      {
        id: 'CC6.1',
        name: 'Logical and Physical Access Controls',
        description: 'The entity implements logical access security software, infrastructure, and architectures',
        category: 'Security',
        evidenceTypes: ['security_event', 'user_action'],
        minimumEvidence: 1,
      },
      {
        id: 'CC6.2',
        name: 'System Access Restrictions',
        description: 'Prior to issuing system credentials, the entity registers and authorizes new users',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      },
      {
        id: 'CC6.3',
        name: 'Credential Management',
        description: 'The entity authorizes, modifies, or removes access to data based on roles',
        category: 'Security',
        evidenceTypes: ['security_event', 'user_action'],
        minimumEvidence: 1,
      },
      {
        id: 'CC6.6',
        name: 'Transmission Security',
        description: 'The entity implements controls to prevent unauthorized access during transmission',
        category: 'Security',
        evidenceTypes: ['security_event'],
        minimumEvidence: 1,
      },
      {
        id: 'CC7.1',
        name: 'Detection and Monitoring',
        description: 'The entity uses detection and monitoring procedures to identify anomalies',
        category: 'Operations',
        evidenceTypes: ['tool_invocation', 'security_event'],
        minimumEvidence: 1,
      },
      {
        id: 'CC7.2',
        name: 'Incident Response',
        description: 'The entity monitors system components and detects anomalies indicating malicious acts',
        category: 'Operations',
        evidenceTypes: ['security_event', 'error'],
        minimumEvidence: 1,
      },
      {
        id: 'CC8.1',
        name: 'Change Management',
        description: 'The entity authorizes, designs, develops, and implements changes',
        category: 'Change Management',
        evidenceTypes: ['file_change', 'tool_invocation'],
        minimumEvidence: 1,
      },
    ];

    for (const control of soc2Controls) {
      this.registerControl(control);
    }
  }

  /**
   * Get evidence summary for a control
   */
  async getEvidenceSummary(controlId: string, options?: ReportOptions): Promise<EvidenceSummary> {
    const evidence = await this.collectEvidence(controlId, options);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const event of evidence) {
      // Count by type
      byType[event.type] = (byType[event.type] ?? 0) + 1;

      // Count severity for security events
      if (event.type === 'security_event' && 'severity' in event) {
        const severity = (event as AuditEvent & { severity?: string }).severity ?? 'unknown';
        bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
      }
    }

    return {
      totalEvents: evidence.length,
      byType,
      bySeverity: Object.keys(bySeverity).length > 0 ? bySeverity : undefined,
    };
  }

  /**
   * Identify compliance gaps
   */
  async identifyGaps(options?: ReportOptions): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];

    for (const [controlId, control] of this.controls) {
      const assessment = await this.assessControl(controlId, options);

      if (assessment.status === 'non-compliant') {
        const minimumEvidence = control.minimumEvidence ?? 1;
        gaps.push({
          controlId,
          controlName: control.name,
          reason: `Insufficient evidence: found ${assessment.evidenceCount}, required ${minimumEvidence}`,
          remediation: `Generate ${minimumEvidence - assessment.evidenceCount} more ${control.evidenceTypes.join(' or ')} events to meet compliance requirements for this control.`,
        });
      }
    }

    return gaps;
  }
}
