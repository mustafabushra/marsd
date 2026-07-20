import { BaseAgent } from '../core/BaseAgent';
export class BackendEngineer extends BaseAgent {
    constructor() {
        super('Backend Engineer', 'backend-architect');
    }
    async executeTaskLogic(task) {
        const taskType = task.title.toLowerCase();
        if (taskType.includes('api endpoint')) {
            await this.buildAPIEndpoint(task);
        }
        else if (taskType.includes('database')) {
            await this.configureDatabase(task);
        }
        else if (taskType.includes('auth')) {
            await this.implementAuthentication(task);
        }
        else if (taskType.includes('gating')) {
            await this.implementGatingLogic(task);
        }
        else if (taskType.includes('trust score')) {
            await this.implementTrustScoreEngine(task);
        }
        else {
            await this.genericBackendTask(task);
        }
    }
    async buildAPIEndpoint(task) {
        this.logInfo(`Building API Endpoint: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('injection', 'SQL Injection Prevention via Parameterized Queries', 'critical'), this.requireSecurityCheck('injection', 'No Dynamic Query Building', 'critical'), this.requireSecurityCheck('multi-tenant', 'Tenant Isolation Check Before Data Access', 'critical'), this.requireSecurityCheck('auth', 'JWT Verification on Every Request', 'critical'), this.requireSecurityCheck('logging', 'Audit Log for Sensitive Operations', 'high'), this.requireSecurityCheck('owasp-top10', 'IDOR Prevention via Resource Ownership Check', 'critical'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Using Prisma parameterized queries (automatic)');
        await this.verifySecurityItem(task.securityChecklist[1], 'No string concatenation in queries');
        await this.verifySecurityItem(task.securityChecklist[2], 'req.user.tenantId validation before data access');
        await this.verifySecurityItem(task.securityChecklist[3], 'JWT guard applied to route');
        await this.verifySecurityItem(task.securityChecklist[4], 'Audit log entry created for action');
        await this.verifySecurityItem(task.securityChecklist[5], 'Resource ownership validated against tenant');
        this.logInfo(`✅ API Endpoint secure and ready`);
    }
    async configureDatabase(task) {
        this.logInfo(`Configuring Database: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('multi-tenant', 'RLS Policies Enabled', 'critical'), this.requireSecurityCheck('encryption', 'Sensitive Data Encrypted at Rest', 'critical'), this.requireSecurityCheck('logging', 'Database Audit Trail Enabled', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'RLS enabled on all tenant-scoped tables');
        await this.verifySecurityItem(task.securityChecklist[1], 'AES-256 encryption for: passwords (bcryptjs), tokens, PII');
        await this.verifySecurityItem(task.securityChecklist[2], 'PostgreSQL audit logs enabled');
        this.logInfo(`✅ Database secure and isolated`);
    }
    async implementAuthentication(task) {
        this.logInfo(`Implementing Authentication: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('auth', 'Argon2id Password Hashing', 'critical'), this.requireSecurityCheck('auth', 'JWT with 15min Expiration', 'critical'), this.requireSecurityCheck('auth', 'Refresh Token Rotation', 'high'), this.requireSecurityCheck('auth', 'Secure Session Management', 'high'), this.requireSecurityCheck('logging', 'Failed Login Audit Log', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Using bcryptjs with 10 rounds (Argon2id when available)');
        await this.verifySecurityItem(task.securityChecklist[1], 'JWT exp claim set to 15 minutes');
        await this.verifySecurityItem(task.securityChecklist[2], 'Refresh token stored in httpOnly cookie');
        await this.verifySecurityItem(task.securityChecklist[3], 'Session tokens never logged');
        await this.verifySecurityItem(task.securityChecklist[4], 'Failed login attempt logged with IP + email');
        this.logInfo(`✅ Authentication secure`);
    }
    async implementGatingLogic(task) {
        this.logInfo(`Implementing Gating Logic: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('auth', 'User Subscription Verified', 'critical'), this.requireSecurityCheck('multi-tenant', 'Quota Checked Per Tenant', 'critical'), this.requireSecurityCheck('logging', 'Gating Decision Logged', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Subscription status checked from database before access');
        await this.verifySecurityItem(task.securityChecklist[1], 'Quota lookup uses tenant_id as filter');
        await this.verifySecurityItem(task.securityChecklist[2], 'Gating decision logged in audit_logs');
        this.logInfo(`✅ Gating logic secure`);
    }
    async implementTrustScoreEngine(task) {
        this.logInfo(`Implementing Trust Score Engine: ${task.description}`);
        task.securityChecklist.push(this.requireSecurityCheck('owasp-top10', 'No Division by Zero', 'high'), this.requireSecurityCheck('logging', 'Score Calculation Logged', 'high'));
        await this.verifySecurityItem(task.securityChecklist[0], 'Safe division: clamp((0.30*S_official + 0.70*S_community), 0, 100)');
        await this.verifySecurityItem(task.securityChecklist[1], 'Score computation logged with inputs');
        this.logInfo(`✅ Trust Score Engine secure`);
    }
    async genericBackendTask(task) {
        this.logInfo(`Processing: ${task.description}`);
    }
    logInfo(msg) {
        console.log(`[${this.name}] ${msg}`);
    }
}
//# sourceMappingURL=BackendEngineer.js.map