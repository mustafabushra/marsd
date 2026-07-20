import { MARSAD_SPECIFICATION } from './SPECIFICATION_MANIFEST';
export interface ValidationResult {
    compliant: boolean;
    category: string;
    requirement: string;
    status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_TESTED';
    evidence?: string;
    violatedRules?: string[];
    recommendation?: string;
}
export declare class SpecificationValidator {
    private results;
    validateScreenExists(screenId: number, screenName: string, path: string): ValidationResult;
    validateAllScreensDeployed(): ValidationResult;
    validateFR(frCode: keyof typeof MARSAD_SPECIFICATION.functionalRequirements, implemented: boolean, evidence?: string): ValidationResult;
    validateAllFRsImplemented(): ValidationResult;
    validateBR(brCode: keyof typeof MARSAD_SPECIFICATION.businessRules, implemented: boolean, evidence?: string): ValidationResult;
    validateOWASPCoverage(vector: string, implemented: boolean, evidence?: string): ValidationResult;
    validateMultiTenantIsolation(rlsEnforced: boolean, noBypassed: boolean): ValidationResult;
    validateReporterAnonymity(identity_not_exposed: boolean, aggregated_only: boolean): ValidationResult;
    validateAuditLogging(immutable: boolean, comprehensive: boolean): ValidationResult;
    validateTrustScoreFormula(officialWeight: number, communityWeight: number): ValidationResult;
    validateTrustScoreTiers(): ValidationResult;
    validateDesignCompliance(screenId: number, usedFont: string, direction: string, colorUsageCorrect: boolean): ValidationResult;
    validateMilestone(week: 1 | 2 | 3 | 4, milestone: string, achieved: boolean, evidence?: string): ValidationResult;
    validateLaunchReadiness(): ValidationResult[];
    getComplianceReport(): {
        totalChecks: number;
        passed: number;
        failed: number;
        partial: number;
        notTested: number;
        compliancePercentage: number;
        results: ValidationResult[];
    };
    printReport(): void;
    resetResults(): void;
}
//# sourceMappingURL=SpecificationValidator.d.ts.map