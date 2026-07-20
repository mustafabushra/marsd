import { BaseAgent, AgentTask } from '../core/BaseAgent';
export declare class SecurityEngineer extends BaseAgent {
    constructor();
    protected executeTaskLogic(task: AgentTask): Promise<void>;
    private performSecurityAudit;
    private preventInjection;
    private enforceMultiTenantIsolation;
    private implementEncryption;
    private enforceRowLevelSecurity;
    private genericSecurityTask;
    private logInfo;
}
//# sourceMappingURL=SecurityEngineer.d.ts.map