import { BaseAgent, AgentTask } from '../core/BaseAgent';
export declare class QAEngineer extends BaseAgent {
    constructor();
    protected executeTaskLogic(task: AgentTask): Promise<void>;
    private testIntegration;
    private testSecurity;
    private testPerformance;
    private testFlow;
    private genericQATask;
    private logInfo;
}
//# sourceMappingURL=QAEngineer.d.ts.map