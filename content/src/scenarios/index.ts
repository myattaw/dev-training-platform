import type { ScenarioSource } from '@pracstack/content-model';
import { cicdPipelineFailure } from './cicd-pipeline-failure';
import { employeeManagementApi } from './employee-management-api';
import { leaveApprovalWorkflow } from './leave-approval-workflow';
import { legacyModernization } from './legacy-modernization';
import { secureCustomerApi } from './secure-customer-api';
import { sqlPerformanceInvestigation } from './sql-performance-investigation';
import { transactionProcessing } from './transaction-processing';

/** All Enterprise Scenarios, in catalog order. */
export const SCENARIOS: readonly ScenarioSource[] = [
  employeeManagementApi,
  transactionProcessing,
  sqlPerformanceInvestigation,
  secureCustomerApi,
  leaveApprovalWorkflow,
  cicdPipelineFailure,
  legacyModernization,
];
