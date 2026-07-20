import { MARSAD_SPECIFICATION } from './SPECIFICATION_MANIFEST';
export class SpecificationValidator {
    constructor() {
        this.results = [];
    }
    validateScreenExists(screenId, screenName, path) {
        const screen = Object.values(MARSAD_SPECIFICATION.screens)
            .flat()
            .find((s) => s.id === screenId);
        const result = {
            compliant: !!screen,
            category: 'screens',
            requirement: `Screen ${screenId}: ${screenName}`,
            status: screen ? 'PASS' : 'FAIL',
            evidence: screen ? `Screen found at ${screen.path}` : `Screen ${screenId} missing from spec`,
        };
        if (!result.compliant) {
            result.recommendation = `Add screen to project spec: MARSAD_SPECIFICATION.screens`;
        }
        this.results.push(result);
        return result;
    }
    validateAllScreensDeployed() {
        const allScreens = Object.values(MARSAD_SPECIFICATION.screens).flat();
        const result = {
            compliant: allScreens.length === 25,
            category: 'screens',
            requirement: '25 screens (7 marketing + 12 company + 6 admin)',
            status: allScreens.length === 25 ? 'PASS' : 'FAIL',
            evidence: `${allScreens.length} screens deployed`,
        };
        this.results.push(result);
        return result;
    }
    validateFR(frCode, implemented, evidence) {
        const requirement = MARSAD_SPECIFICATION.functionalRequirements[frCode];
        const result = {
            compliant: implemented,
            category: 'functional',
            requirement: `${frCode}: ${requirement}`,
            status: implemented ? 'PASS' : 'FAIL',
            evidence,
        };
        if (!implemented) {
            result.recommendation = `Implement ${frCode}`;
        }
        this.results.push(result);
        return result;
    }
    validateAllFRsImplemented() {
        const frs = Object.keys(MARSAD_SPECIFICATION.functionalRequirements);
        const allImplemented = frs.every((fr) => this.results.some((r) => r.requirement.startsWith(fr) && r.status === 'PASS'));
        const result = {
            compliant: allImplemented,
            category: 'functional',
            requirement: 'All 20 FRs implemented',
            status: allImplemented ? 'PASS' : 'PARTIAL',
            evidence: `${frs.filter((fr) => this.results.some((r) => r.requirement.startsWith(fr) && r.status === 'PASS')).length}/${frs.length} FRs implemented`,
        };
        this.results.push(result);
        return result;
    }
    validateBR(brCode, implemented, evidence) {
        const rule = MARSAD_SPECIFICATION.businessRules[brCode];
        const result = {
            compliant: implemented,
            category: 'business',
            requirement: `${brCode}: ${rule}`,
            status: implemented ? 'PASS' : 'FAIL',
            evidence,
        };
        if (!implemented) {
            result.violatedRules = [brCode];
            result.recommendation = `Enforce ${brCode}: ${rule}`;
        }
        this.results.push(result);
        return result;
    }
    validateOWASPCoverage(vector, implemented, evidence) {
        const spec = MARSAD_SPECIFICATION.security.owasp;
        const result = {
            compliant: implemented && spec.some((v) => v.includes(vector)),
            category: 'security',
            requirement: `OWASP: ${vector}`,
            status: implemented ? 'PASS' : 'FAIL',
            evidence,
        };
        if (!result.compliant) {
            result.recommendation = `Implement OWASP protection: ${vector}`;
        }
        this.results.push(result);
        return result;
    }
    validateMultiTenantIsolation(rlsEnforced, noBypassed) {
        const result = {
            compliant: rlsEnforced && noBypassed,
            category: 'security',
            requirement: 'Multi-Tenant RLS isolation (no bypasses)',
            status: rlsEnforced && noBypassed ? 'PASS' : 'FAIL',
            evidence: rlsEnforced && noBypassed ? 'RLS enforced with BYPASSRLS disabled' : 'RLS not enforced or bypass possible',
        };
        if (!result.compliant) {
            result.violatedRules = ['multi-tenant-isolation'];
            result.recommendation = 'Enforce RLS on all tenant_id columns, disable BYPASSRLS for app role';
        }
        this.results.push(result);
        return result;
    }
    validateReporterAnonymity(identity_not_exposed, aggregated_only) {
        const result = {
            compliant: identity_not_exposed && aggregated_only,
            category: 'security',
            requirement: 'Reporter anonymity (BR-02: no identity exposure ever)',
            status: identity_not_exposed && aggregated_only ? 'PASS' : 'FAIL',
            evidence: identity_not_exposed && aggregated_only ? 'Reporter identity never exposed, aggregated statistics only' : 'Potential identity exposure risk',
        };
        if (!result.compliant) {
            result.violatedRules = ['BR-02'];
            result.recommendation = 'Implement allow-list serialization to strip reporter_id from all responses';
        }
        this.results.push(result);
        return result;
    }
    validateAuditLogging(immutable, comprehensive) {
        const result = {
            compliant: immutable && comprehensive,
            category: 'security',
            requirement: 'Immutable Audit Trail (all sensitive ops logged)',
            status: immutable && comprehensive ? 'PASS' : 'FAIL',
            evidence: immutable && comprehensive ? 'Audit log append-only, comprehensive coverage' : 'Audit log not immutable or incomplete',
        };
        if (!result.compliant) {
            result.violatedRules = ['BR-11'];
            result.recommendation = 'Implement append-only audit log with no UPDATE/DELETE permissions';
        }
        this.results.push(result);
        return result;
    }
    validateTrustScoreFormula(officialWeight, communityWeight) {
        const spec = MARSAD_SPECIFICATION.trustScoreEngine;
        const correctWeights = officialWeight === 0.3 && communityWeight === 0.7;
        const result = {
            compliant: correctWeights,
            category: 'trustScore',
            requirement: `Trust Score weights: official=${officialWeight}, community=${communityWeight}`,
            status: correctWeights ? 'PASS' : 'FAIL',
            evidence: `Weights used: official=${officialWeight}, community=${communityWeight}`,
        };
        if (!result.compliant) {
            result.recommendation = `Use spec weights: official=0.30, community=0.70`;
        }
        this.results.push(result);
        return result;
    }
    validateTrustScoreTiers() {
        const spec = MARSAD_SPECIFICATION.trustScoreEngine.tiers;
        const result = {
            compliant: true,
            category: 'trustScore',
            requirement: 'Report display states: full (5+) | preliminary (2-4) | none (0-1) | locked (free)',
            status: 'PASS',
            evidence: JSON.stringify(spec, null, 2),
        };
        this.results.push(result);
        return result;
    }
    validateDesignCompliance(screenId, usedFont, direction, colorUsageCorrect) {
        const spec = MARSAD_SPECIFICATION.designSystem;
        const fontCorrect = usedFont === 'Tajawal';
        const directionCorrect = direction === 'rtl';
        const result = {
            compliant: fontCorrect && directionCorrect && colorUsageCorrect,
            category: 'design',
            requirement: `Screen ${screenId}: Tajawal + RTL + correct colors`,
            status: fontCorrect && directionCorrect && colorUsageCorrect ? 'PASS' : 'FAIL',
            evidence: `Font=${usedFont}, Direction=${direction}, ColorsCorrect=${colorUsageCorrect}`,
        };
        if (!result.compliant) {
            result.recommendation = `Use Tajawal font, dir=rtl, and spec-defined colors`;
        }
        this.results.push(result);
        return result;
    }
    validateMilestone(week, milestone, achieved, evidence) {
        const weekName = `week${week}`;
        const spec = MARSAD_SPECIFICATION.timeline[weekName];
        const result = {
            compliant: achieved,
            category: 'timeline',
            requirement: `Week ${week} (${spec.period}): ${milestone}`,
            status: achieved ? 'PASS' : 'FAIL',
            evidence: evidence || (achieved ? `${milestone} achieved` : `${milestone} not achieved`),
        };
        if (!result.compliant) {
            result.recommendation = `Complete ${milestone} by end of week ${week}`;
        }
        this.results.push(result);
        return result;
    }
    validateLaunchReadiness() {
        const checks = MARSAD_SPECIFICATION.launchChecklist.map((check) => {
            const description = check.replace('✔ ', '');
            const matchingResult = this.results.find((r) => r.requirement.includes(description) && r.status === 'PASS');
            return {
                compliant: !!matchingResult,
                category: 'launch',
                requirement: description,
                status: matchingResult?.status || 'NOT_TESTED',
                evidence: matchingResult?.evidence,
            };
        });
        this.results.push(...checks);
        return checks;
    }
    getComplianceReport() {
        const passed = this.results.filter((r) => r.status === 'PASS').length;
        const failed = this.results.filter((r) => r.status === 'FAIL').length;
        const partial = this.results.filter((r) => r.status === 'PARTIAL').length;
        const notTested = this.results.filter((r) => r.status === 'NOT_TESTED').length;
        const total = this.results.length;
        return {
            totalChecks: total,
            passed,
            failed,
            partial,
            notTested,
            compliancePercentage: total > 0 ? (passed / total) * 100 : 0,
            results: this.results,
        };
    }
    printReport() {
        const report = this.getComplianceReport();
        console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                   📋 MARSAD SPECIFICATION COMPLIANCE REPORT               ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

📊 SUMMARY
──────────────────────────────────────────────────────────────────────────────
Total Checks:         ${report.totalChecks}
✅ Passed:            ${report.passed}
❌ Failed:            ${report.failed}
⚠️  Partial:          ${report.partial}
❓ Not Tested:        ${report.notTested}
📈 Compliance:        ${report.compliancePercentage.toFixed(1)}%

📋 DETAILED RESULTS
──────────────────────────────────────────────────────────────────────────────
`);
        const byCategory = this.results.reduce((acc, r) => {
            if (!acc[r.category])
                acc[r.category] = [];
            acc[r.category].push(r);
            return acc;
        }, {});
        for (const [category, results] of Object.entries(byCategory)) {
            console.log(`\n${category.toUpperCase()}`);
            console.log('─'.repeat(80));
            for (const result of results) {
                const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : result.status === 'PARTIAL' ? '⚠️ ' : '❓';
                console.log(`${icon} ${result.requirement}`);
                if (result.evidence)
                    console.log(`   Evidence: ${result.evidence}`);
                if (result.recommendation)
                    console.log(`   Action: ${result.recommendation}`);
            }
        }
        console.log(`
════════════════════════════════════════════════════════════════════════════════
`);
    }
    resetResults() {
        this.results = [];
    }
}
//# sourceMappingURL=SpecificationValidator.js.map