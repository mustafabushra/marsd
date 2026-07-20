import { EventEmitter } from 'events';
export interface AgentTask {
    id: string;
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    assignedTo?: string;
    status: 'pending' | 'in-progress' | 'blocked' | 'completed' | 'failed';
    securityChecklist: SecurityCheckItem[];
    dependencies: string[];
    createdAt: Date;
    completedAt?: Date;
    notes: string[];
}
export interface SecurityCheckItem {
    id: string;
    category: 'owasp-top10' | 'injection' | 'auth' | 'crypto' | 'multi-tenant' | 'logging';
    requirement: string;
    verified: boolean;
    riskLevel: 'critical' | 'high' | 'medium';
    evidence?: string;
}
export interface AgentMemory {
    decisions: AgentDecision[];
    previousTasks: AgentTask[];
    context: Map<string, any>;
    conversations: AgentConversation[];
}
export interface AgentDecision {
    timestamp: Date;
    decision: string;
    reasoning: string;
    impact: string;
    reversible: boolean;
}
export interface AgentConversation {
    timestamp: Date;
    with: string;
    message: string;
    response?: string;
}
export declare abstract class BaseAgent extends EventEmitter {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    protected memory: AgentMemory;
    protected tasks: Map<string, AgentTask>;
    protected status: 'idle' | 'thinking' | 'planning' | 'executing' | 'in-progress' | 'waiting' | 'blocked';
    protected securityMode: 'paranoid' | 'strict' | 'normal';
    protected auditLog: AgentAuditLog[];
    constructor(name: string, role: string);
    private initializeSecurityContext;
    protected validateInputSecurity(input: any, context: string): boolean;
    private sanitizeInput;
    assignTask(task: AgentTask): Promise<void>;
    private canExecuteTask;
    protected executeTask(task: AgentTask): Promise<void>;
    protected preExecutionSecurityCheck(task: AgentTask): Promise<void>;
    protected postExecutionSecurityCheck(task: AgentTask): Promise<void>;
    protected abstract executeTaskLogic(task: AgentTask): Promise<void>;
    protected verifySecurityItem(item: SecurityCheckItem, evidence: string): Promise<void>;
    protected requireSecurityCheck(category: string, requirement: string, riskLevel?: 'critical' | 'high' | 'medium'): SecurityCheckItem;
    requestHelp(agents: BaseAgent[], question: string): Promise<string>;
    answer(from: string, question: string): Promise<string>;
    private recordDecision;
    getMemory(): AgentMemory;
    private logAudit;
    getAuditLog(): AgentAuditLog[];
    getStatus(): {
        id: string;
        name: string;
        role: string;
        status: string;
        taskCount: number;
        completedCount: number;
        blockedCount: number;
        securityViolations: number;
    };
}
export interface AgentAuditLog {
    timestamp: Date;
    type: string;
    message: string;
    agentId: string;
    agentName: string;
}
//# sourceMappingURL=BaseAgent.d.ts.map