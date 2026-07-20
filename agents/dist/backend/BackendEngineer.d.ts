import { BaseAgent, AgentTask } from '../core/BaseAgent';
export declare class BackendEngineer extends BaseAgent {
    constructor();
    protected executeTaskLogic(task: AgentTask): Promise<void>;
    private buildAPIEndpoint;
    private configureDatabase;
    private implementAuthentication;
    private implementGatingLogic;
    private implementTrustScoreEngine;
    private genericBackendTask;
    private logInfo;
}
//# sourceMappingURL=BackendEngineer.d.ts.map