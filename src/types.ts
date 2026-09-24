// TypeScript mirrors of the agent output schemas in /schemas that code consumes.
// The JSON Schemas are the source of truth; outputs are validated against them before use.

export type RiskTier = 'low' | 'medium' | 'high';
export type Readiness = 'ready' | 'needs-clarification' | 'blocked';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  dimension: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  suggestion: string;
  evidence?: string;
}

export interface ReqAnalysis {
  workItemId: number;
  riskTier: RiskTier;
  readiness: Readiness;
  summary: string;
  findings: Finding[];
  proposedAcceptanceCriteria: string[];
  openQuestions: string[];
}

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestCaseDraft {
  title: string;
  priority: 1 | 2 | 3 | 4;
  type: string;
  technique: string;
  surface: string;
  automationCandidate: boolean;
  acceptanceCriterionRef: string;
  preconditions: string[];
  steps: TestStep[];
}

export interface ReleaseVerdict {
  releaseId: string;
  recommendation: 'go' | 'go-with-risks' | 'no-go';
  confidence: number;
  summary: string;
  blockingIssues: string[];
  risks: { description: string; severity: string; mitigation: string }[];
  evidenceReviewed: { source: string; status: 'pass' | 'fail' | 'missing' | 'stale'; note?: string }[];
  dimensionCoverage: { dimension: string; status: string; note?: string }[];
}

export interface TestCaseSet {
  workItemId: number;
  testCases: TestCaseDraft[];
  coverageNotes: string;
}
