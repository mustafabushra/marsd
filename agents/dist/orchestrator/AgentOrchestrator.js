import { BackendEngineer } from '../backend/BackendEngineer';
import { FrontendEngineer } from '../frontend/FrontendEngineer';
import { SecurityEngineer } from '../security/SecurityEngineer';
import { QAEngineer } from '../qa/QAEngineer';
import { v4 as uuid } from 'uuid';
export class AgentOrchestrator {
    constructor() {
        this.agents = new Map();
        this.taskQueue = [];
        this.completedTasks = [];
        this.blockedTasks = [];
        this.initializeAgents();
    }
    initializeAgents() {
        const agentInstances = [
            new BackendEngineer(),
            new FrontendEngineer(),
            new SecurityEngineer(),
            new QAEngineer(),
        ];
        for (const agent of agentInstances) {
            this.agents.set(agent.id, agent);
            this.setupAgentListeners(agent);
        }
        console.log(`\n🚀 Agent Orchestrator Initialized — ${this.agents.size} Agents Ready\n`);
        this.printAgentStatus();
    }
    setupAgentListeners(agent) {
        agent.on('task:completed', (task) => {
            this.onTaskCompleted(agent, task);
        });
        agent.on('task:failed', ({ task, error }) => {
            this.onTaskFailed(agent, task, error);
        });
        agent.on('status:changed', (status) => {
            console.log(`[${agent['name']}] Status: ${status}`);
        });
    }
    async assignTask(task) {
        if (!task.securityChecklist || task.securityChecklist.length === 0) {
            throw new Error('❌ Task must include security checklist');
        }
        this.taskQueue.push(task);
        console.log(`\n📋 Task Queued: ${task.title}`);
        const agent = this.routeTask(task);
        if (!agent) {
            this.blockedTasks.push(task);
            console.log(`⚠️ No agent available for: ${task.title}`);
            return;
        }
        await agent.assignTask(task);
    }
    routeTask(task) {
        const title = task.title.toLowerCase();
        let targetRole = 'backend-architect';
        if (title.includes('backend') || title.includes('api') || title.includes('database')) {
            targetRole = 'backend-architect';
        }
        else if (title.includes('frontend') || title.includes('component') || title.includes('ui')) {
            targetRole = 'frontend-architect';
        }
        else if (title.includes('security') || title.includes('auth') || title.includes('encryption')) {
            targetRole = 'security-lead';
        }
        else if (title.includes('test') || title.includes('qa')) {
            targetRole = 'quality-assurance';
        }
        for (const agent of this.agents.values()) {
            if (agent['role'] === targetRole) {
                return agent;
            }
        }
        return null;
    }
    onTaskCompleted(agent, task) {
        this.completedTasks.push(task);
        this.taskQueue = this.taskQueue.filter(t => t.id !== task.id);
        console.log(`\n✅ ${agent['name']} completed: ${task.title}`);
        console.log(`   Status: COMPLETED | Duration: ${this.calculateDuration(task)}`);
        for (const blocked of this.blockedTasks) {
            if (blocked.dependencies.includes(task.id)) {
                this.blockedTasks = this.blockedTasks.filter(t => t.id !== blocked.id);
                this.assignTask(blocked);
            }
        }
    }
    onTaskFailed(agent, task, error) {
        console.log(`\n❌ ${agent['name']} failed: ${task.title}`);
        console.log(`   Error: ${error.message}`);
    }
    calculateDuration(task) {
        if (!task.completedAt)
            return 'N/A';
        const duration = task.completedAt.getTime() - task.createdAt.getTime();
        return `${duration}ms`;
    }
    printAgentStatus() {
        console.log('📊 Agent Status:');
        for (const agent of this.agents.values()) {
            const status = agent.getStatus();
            console.log(`   ${status.name} (${status.role})`);
            console.log(`      Tasks: ${status.completedCount}/${status.taskCount}`);
            console.log(`      Status: ${status.status}`);
            console.log(`      Security Violations: ${status.securityViolations}`);
        }
    }
    getProgress() {
        return {
            queued: this.taskQueue.length,
            completed: this.completedTasks.length,
            blocked: this.blockedTasks.length,
            total: this.taskQueue.length + this.completedTasks.length + this.blockedTasks.length,
        };
    }
    getCompletedTasks() {
        return this.completedTasks;
    }
    getBlockedTasks() {
        return this.blockedTasks;
    }
    getAgents() {
        return this.agents;
    }
}
export class TaskBuilder {
    constructor(title, description) {
        this.specRequirements = new Map();
        this.task = {
            id: uuid(),
            title,
            description,
            priority: 'high',
            status: 'pending',
            securityChecklist: [],
            dependencies: [],
            createdAt: new Date(),
            notes: [],
        };
    }
    addSecurityCheck(category, requirement, riskLevel = 'high') {
        this.task.securityChecklist.push({
            id: uuid(),
            category: category,
            requirement,
            verified: false,
            riskLevel,
        });
        return this;
    }
    addDependency(taskId) {
        this.task.dependencies.push(taskId);
        return this;
    }
    setPriority(priority) {
        this.task.priority = priority;
        return this;
    }
    setPhase(phase) {
        this.phase = phase;
        this.task.notes.push(`[PHASE ${phase}] Marsad Development Phase ${phase}`);
        return this;
    }
    addSpecRequirement(code, requirement) {
        this.specRequirements.set(code, requirement);
        this.task.notes.push(`[SPEC] ${code}: ${requirement}`);
        return this;
    }
    build() {
        return this.task;
    }
}
//# sourceMappingURL=AgentOrchestrator.js.map