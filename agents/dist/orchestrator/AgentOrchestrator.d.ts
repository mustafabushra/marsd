import { BaseAgent, AgentTask } from '../core/BaseAgent';
export declare class AgentOrchestrator {
    private agents;
    private taskQueue;
    private completedTasks;
    private blockedTasks;
    constructor();
    private initializeAgents;
    private setupAgentListeners;
    assignTask(task: AgentTask): Promise<void>;
    private routeTask;
    private onTaskCompleted;
    private onTaskFailed;
    private calculateDuration;
    printAgentStatus(): void;
    getProgress(): {
        queued: number;
        completed: number;
        blocked: number;
        total: number;
    };
    getCompletedTasks(): AgentTask[];
    getBlockedTasks(): AgentTask[];
    getAgents(): Map<string, BaseAgent>;
}
export declare class TaskBuilder {
    private task;
    private phase?;
    private specRequirements;
    constructor(title: string, description: string);
    addSecurityCheck(category: string, requirement: string, riskLevel?: 'critical' | 'high' | 'medium'): TaskBuilder;
    addDependency(taskId: string): TaskBuilder;
    setPriority(priority: 'critical' | 'high' | 'medium' | 'low'): TaskBuilder;
    setPhase(phase: number): TaskBuilder;
    addSpecRequirement(code: string, requirement: string): TaskBuilder;
    build(): AgentTask;
}
//# sourceMappingURL=AgentOrchestrator.d.ts.map