#!/usr/bin/env node
import { AgentOrchestrator, TaskBuilder } from '../../orchestrator/AgentOrchestrator';
async function dispatchDesignFixTasks() {
    console.log('\n🎯 DISPATCHING DESIGN FIX TASKS TO TEAM\n');
    console.log('='.repeat(70));
    const orchestrator = new AgentOrchestrator();
    const designFixTask = new TaskBuilder('Frontend: Fix Pixel-Perfect Design Mismatch Across All Pages', `Audit all 27 React pages against design-approved.html reference file.

CRITICAL: Match design-approved.html EXACTLY
- Colors: #1E2A52, #16A34A, #F8FAFC, #E2E8F0, #64748B, #94A3B8
- Spacing: padding 22px/24px/28px, gaps 18px/14px/10px
- Fonts: Tajawal, weights 600/700/800/900, sizes 13.5px-26px
- Borders: 1px solid #E2E8F0, 1.5px solid variants
- Grids: repeat(4,1fr), repeat(3,1fr), 1.4fr 1fr layouts
- Shadows & gradients from design file

PAGES (27 total):
Visitor: Landing, About, Pricing, Partners, FAQ, Contact, Register, Login
Company: Dashboard, Search, AddCompany, AddReport, MyReports, TrustReport, Watchlist, Compare, Users, Subscription, Profile
Admin: Dashboard, Reports, Companies, Users, Logs, Requests, BulkImport
Demo: ModalDemo`)
        .addSecurityCheck('style-injection', 'Verify no inline styles contain dynamic user input', 'critical')
        .addSecurityCheck('xss-prevention', 'Ensure all style values are hardcoded constants', 'critical')
        .addSpecRequirement('DESIGN_REF', 'File: design-approved.html')
        .addSpecRequirement('COLORS', 'Match hex values exactly from design reference')
        .addSpecRequirement('SPACING', 'Match padding, gaps, margins from design')
        .setPriority('critical')
        .setPhase(2)
        .build();
    const designAuditTask = new TaskBuilder('QA: Pixel-Perfect Design Compliance Audit', `Verify all 27 pages match design-approved.html.

AUDIT SCOPE:
✓ Color accuracy (#1E2A52, #16A34A, #F8FAFC, #E2E8F0, #64748B, #94A3B8)
✓ Spacing consistency (padding, gaps, margins)
✓ Typography (Tajawal, font sizes, font weights)
✓ Borders & shadows
✓ Grid layouts and responsive design
✓ Button & input styling
✓ Card & component styling

DELIVERABLE: Detailed mismatch report with specific page/component locations`)
        .addSecurityCheck('audit-integrity', 'Use design-approved.html as single source of truth', 'high')
        .addSpecRequirement('REFERENCE', 'design-approved.html - authoritative spec')
        .setPriority('critical')
        .setPhase(2)
        .addDependency(designFixTask.id)
        .build();
    try {
        console.log('\n📋 TASK 1: Frontend - Pixel-Perfect Design Fixes');
        console.log('-'.repeat(70));
        await orchestrator.assignTask(designFixTask);
        console.log('\n📋 TASK 2: QA - Design Compliance Audit');
        console.log('-'.repeat(70));
        await orchestrator.assignTask(designAuditTask);
        console.log('\n' + '='.repeat(70));
        const progress = orchestrator.getProgress();
        console.log(`\n📊 TEAM STATUS:`);
        console.log(`   Tasks Queued: ${progress.queued}`);
        console.log(`   Tasks Completed: ${progress.completed}`);
        console.log(`   Tasks Blocked: ${progress.blocked}`);
        console.log(`   Total Tasks: ${progress.total}`);
        console.log('\n👥 AGENT STATUS:');
        orchestrator.printAgentStatus();
        console.log('\n✅ DESIGN FIX TASKS DISPATCHED!');
        console.log('   🚀 Frontend Engineer: Fixing all 27 pages styling');
        console.log('   🧪 QA Engineer: Auditing design compliance');
    }
    catch (error) {
        console.error('\n❌ Error dispatching tasks:', error);
        process.exit(1);
    }
}
dispatchDesignFixTasks().catch(console.error);
//# sourceMappingURL=dispatch-design-fix.js.map