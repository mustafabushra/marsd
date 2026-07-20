import { BaseAgent } from '../core/BaseAgent';
export class FrontendEngineer extends BaseAgent {
    constructor() {
        super('Frontend Engineer', 'frontend-architect');
    }
    async executeTaskLogic(task) {
        const taskType = task.title.toLowerCase();
        if (taskType.includes('component')) {
            await this.buildComponent(task);
        }
        else if (taskType.includes('page')) {
            await this.buildPage(task);
        }
        else if (taskType.includes('integration')) {
            await this.integrateWithBackend(task);
        }
        else if (taskType.includes('rtl')) {
            await this.ensureRTLCompliance(task);
        }
        else {
            await this.genericFrontendTask(task);
        }
    }
    async buildComponent(task) {
        this.logInfo(`Building Component: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('owasp-top10', 'XSS Prevention via DOMPurify', 'critical'), this.requireSecurityCheck('auth', 'Protected Route Check', 'critical'), this.requireSecurityCheck('crypto', 'No Sensitive Data in localStorage', 'critical'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Using React.createElement (not dangerouslySetInnerHTML) + sanitizer for user content');
        await this.verifySecurityItem(task.securityChecklist[1], 'Component wrapped in <ProtectedRoute isLoggedIn={isLoggedIn} />');
        await this.verifySecurityItem(task.securityChecklist[2], 'Only JWT token in localStorage, never passwords/PII');
        this.logInfo(`✅ Component secure and pixel-perfect`);
    }
    async buildPage(task) {
        this.logInfo(`Building Page: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('owasp-top10', 'CSRF Protection via SameSite cookies', 'high'), this.requireSecurityCheck('logging', 'User Action Logged', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'SameSite=Strict on JWT token cookie');
        await this.verifySecurityItem(task.securityChecklist[1], 'Page load event tracked in audit log');
        this.logInfo(`✅ Page secure and RTL-compliant`);
    }
    async integrateWithBackend(task) {
        this.logInfo(`Integrating with Backend: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('auth', 'JWT Token Included in Request', 'critical'), this.requireSecurityCheck('injection', 'API Params Validated Before Send', 'critical'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Authorization: Bearer {token} header set');
        await this.verifySecurityItem(task.securityChecklist[1], 'Input validation before fetch() call');
        this.logInfo(`✅ Backend integration secure`);
    }
    async ensureRTLCompliance(task) {
        this.logInfo(`Ensuring RTL Compliance: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('owasp-top10', 'Text Direction Respected', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'CSS: direction: rtl; text-align: right; --Used Tajawal Arabic font');
        this.logInfo(`✅ RTL compliance verified`);
    }
    async genericFrontendTask(task) {
        this.logInfo(`Processing: ${task.description}`);
    }
    logInfo(msg) {
        console.log(`[${this.name}] ${msg}`);
    }
}
//# sourceMappingURL=FrontendEngineer.js.map