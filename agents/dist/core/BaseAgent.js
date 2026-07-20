import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
export class BaseAgent extends EventEmitter {
    constructor(name, role) {
        super();
        this.tasks = new Map();
        this.status = 'idle';
        this.securityMode = 'strict';
        this.auditLog = [];
        this.id = uuid();
        this.name = name;
        this.role = role;
        this.memory = {
            decisions: [],
            previousTasks: [],
            context: new Map(),
            conversations: [],
        };
        this.initializeSecurityContext();
    }
    initializeSecurityContext() {
        this.logAudit('INIT', `Agent ${this.name} initialized with security-first mode`);
        this.memory.context.set('securityRequirements', MARSAD_SECURITY_REQUIREMENTS);
    }
    validateInputSecurity(input, context) {
        if (!input)
            return false;
        if (typeof input !== 'object')
            return false;
        const sanitized = this.sanitizeInput(input);
        this.logAudit('INPUT_VALIDATION', `Validated input for ${context}`);
        return !!sanitized;
    }
    sanitizeInput(input) {
        const dangerous = ['<script', 'javascript:', 'onerror', 'onclick', 'DROP TABLE', 'DELETE FROM'];
        const str = JSON.stringify(input);
        for (const pattern of dangerous) {
            if (str.toLowerCase().includes(pattern.toLowerCase())) {
                this.logAudit('SECURITY_THREAT', `Dangerous pattern detected: ${pattern}`);
                return null;
            }
        }
        return input;
    }
    async assignTask(task) {
        this.logAudit('TASK_ASSIGNED', `Task: ${task.title}`);
        if (!task.securityChecklist || task.securityChecklist.length === 0) {
            this.logAudit('SECURITY_WARNING', `Task ${task.id} missing security checklist`);
            throw new Error('Task must include security checklist');
        }
        this.tasks.set(task.id, task);
        this.emit('task:assigned', task);
        if (this.canExecuteTask(task)) {
            await this.executeTask(task);
        }
        else {
            this.status = 'waiting';
            this.emit('status:changed', 'waiting');
        }
    }
    canExecuteTask(task) {
        if (task.dependencies.length === 0)
            return true;
        return task.dependencies.every(dep => {
            const depTask = this.tasks.get(dep);
            return depTask?.status === 'completed';
        });
    }
    async executeTask(task) {
        this.status = 'in-progress';
        this.emit('status:changed', 'in-progress');
        this.logAudit('EXECUTION_START', `Executing: ${task.title}`);
        try {
            await this.preExecutionSecurityCheck(task);
            await this.executeTaskLogic(task);
            await this.postExecutionSecurityCheck(task);
            task.status = 'completed';
            task.completedAt = new Date();
            this.emit('task:completed', task);
            this.recordDecision(task.title, 'Task completed successfully', `Completed ${task.title}`, true);
        }
        catch (error) {
            task.status = 'failed';
            this.logAudit('EXECUTION_FAILED', `Task failed: ${error.message}`);
            this.emit('task:failed', { task, error });
        }
        this.status = 'idle';
        this.emit('status:changed', 'idle');
    }
    async preExecutionSecurityCheck(task) {
        const criticalItems = task.securityChecklist.filter(item => item.riskLevel === 'critical' && !item.verified);
        if (criticalItems.length > 0) {
            this.logAudit('SECURITY_BLOCK', `Critical security items not verified: ${criticalItems.length}`);
            throw new Error(`Cannot execute: ${criticalItems.length} critical security items unverified`);
        }
    }
    async postExecutionSecurityCheck(task) {
        const allVerified = task.securityChecklist.every(item => item.verified);
        if (!allVerified) {
            const unverified = task.securityChecklist.filter(item => !item.verified);
            this.logAudit('SECURITY_WARNING', `Task completed but ${unverified.length} security items unverified`);
        }
    }
    async verifySecurityItem(item, evidence) {
        item.verified = true;
        item.evidence = evidence;
        this.logAudit('SECURITY_VERIFIED', `${item.category}: ${item.requirement}`);
    }
    requireSecurityCheck(category, requirement, riskLevel = 'high') {
        return {
            id: uuid(),
            category: category,
            requirement,
            verified: false,
            riskLevel,
        };
    }
    async requestHelp(agents, question) {
        this.status = 'waiting';
        this.emit('status:changed', 'waiting');
        this.logAudit('REQUEST_HELP', `Requesting help from ${agents.length} agents`);
        const responses = [];
        for (const agent of agents) {
            const response = await agent.answer(this.name, question);
            responses.push(response);
            this.memory.conversations.push({
                timestamp: new Date(),
                with: agent.name,
                message: question,
                response,
            });
        }
        this.status = 'idle';
        this.emit('status:changed', 'idle');
        return responses.join('\n---\n');
    }
    async answer(from, question) {
        this.logAudit('INCOMING_QUESTION', `From ${from}: ${question}`);
        return `${this.name} response to ${from}: I'll investigate and provide analysis.`;
    }
    recordDecision(decision, reasoning, impact, reversible) {
        this.memory.decisions.push({
            timestamp: new Date(),
            decision,
            reasoning,
            impact,
            reversible,
        });
    }
    getMemory() {
        return this.memory;
    }
    logAudit(type, message) {
        this.auditLog.push({
            timestamp: new Date(),
            type,
            message,
            agentId: this.id,
            agentName: this.name,
        });
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000);
        }
    }
    getAuditLog() {
        return this.auditLog;
    }
    getStatus() {
        const completedCount = Array.from(this.tasks.values()).filter(t => t.status === 'completed').length;
        const blockedCount = Array.from(this.tasks.values()).filter(t => t.status === 'blocked').length;
        const securityViolations = this.auditLog.filter(log => log.type.includes('SECURITY')).length;
        return {
            id: this.id,
            name: this.name,
            role: this.role,
            status: this.status,
            taskCount: this.tasks.size,
            completedCount,
            blockedCount,
            securityViolations,
        };
    }
}
const MARSAD_SECURITY_REQUIREMENTS = {
    owasp_top10: [
        'SQL Injection Prevention',
        'XSS Prevention',
        'CSRF Prevention',
        'SSRF Prevention',
        'XXE Prevention',
        'LDAP Injection Prevention',
        'Command Injection Prevention',
        'Template Injection Prevention',
        'Path Traversal Prevention',
        'IDOR Prevention',
    ],
    authentication: [
        'Argon2id password hashing',
        'JWT with expiration',
        'Refresh token rotation',
        'Multi-factor authentication support',
        'Secure session management',
    ],
    encryption: [
        'HTTPS only',
        'TLS 1.3 minimum',
        'AES-256 for sensitive data',
        'Never custom encryption',
    ],
    multiTenant: [
        'Complete tenant isolation',
        'Row-Level Security enforcement',
        'Tenant ownership validation on every request',
    ],
    logging: [
        'Never log passwords',
        'Never log tokens',
        'Never log secrets',
        'Audit trail for sensitive operations',
    ],
};
//# sourceMappingURL=BaseAgent.js.map