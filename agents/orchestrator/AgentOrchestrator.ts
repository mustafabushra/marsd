import { BaseAgent, AgentTask } from '../core/BaseAgent'
import { BackendEngineer } from '../backend/BackendEngineer'
import { FrontendEngineer } from '../frontend/FrontendEngineer'
import { SecurityEngineer } from '../security/SecurityEngineer'
import { QAEngineer } from '../qa/QAEngineer'
import { v4 as uuid } from 'uuid'

/**
 * Orchestrator — Manages all Autonomous Agents
 * Coordinates task distribution, ensures security-first approach
 */
export class AgentOrchestrator {
  private agents: Map<string, BaseAgent> = new Map()
  private taskQueue: AgentTask[] = []
  private completedTasks: AgentTask[] = []
  private blockedTasks: AgentTask[] = []

  constructor() {
    this.initializeAgents()
  }

  private initializeAgents(): void {
    const agentInstances = [
      new BackendEngineer(),
      new FrontendEngineer(),
      new SecurityEngineer(),
      new QAEngineer(),
    ]

    for (const agent of agentInstances) {
      this.agents.set(agent.id, agent)
      this.setupAgentListeners(agent)
    }

    console.log(`\n🚀 Agent Orchestrator Initialized — ${this.agents.size} Agents Ready\n`)
    this.printAgentStatus()
  }

  private setupAgentListeners(agent: BaseAgent): void {
    agent.on('task:completed', (task: AgentTask) => {
      this.onTaskCompleted(agent, task)
    })

    agent.on('task:failed', ({ task, error }: any) => {
      this.onTaskFailed(agent, task, error)
    })

    agent.on('status:changed', (status: string) => {
      console.log(`[${agent['name']}] Status: ${status}`)
    })
  }

  async assignTask(task: AgentTask): Promise<void> {
    // Validate task has security checklist
    if (!task.securityChecklist || task.securityChecklist.length === 0) {
      throw new Error('❌ Task must include security checklist')
    }

    this.taskQueue.push(task)
    console.log(`\n📋 Task Queued: ${task.title}`)

    // Route to appropriate agent
    const agent = this.routeTask(task)
    if (!agent) {
      this.blockedTasks.push(task)
      console.log(`⚠️ No agent available for: ${task.title}`)
      return
    }

    await agent.assignTask(task)
  }

  private routeTask(task: AgentTask): BaseAgent | null {
    const title = task.title.toLowerCase()
    let targetRole = 'backend-architect'

    if (title.includes('backend') || title.includes('api') || title.includes('database')) {
      targetRole = 'backend-architect'
    } else if (title.includes('frontend') || title.includes('component') || title.includes('ui')) {
      targetRole = 'frontend-architect'
    } else if (title.includes('security') || title.includes('auth') || title.includes('encryption')) {
      targetRole = 'security-lead'
    } else if (title.includes('test') || title.includes('qa')) {
      targetRole = 'quality-assurance'
    }

    // Find agent by role
    for (const agent of this.agents.values()) {
      if (agent['role'] === targetRole) {
        return agent
      }
    }

    return null
  }

  private onTaskCompleted(agent: BaseAgent, task: AgentTask): void {
    this.completedTasks.push(task)
    this.taskQueue = this.taskQueue.filter(t => t.id !== task.id)

    console.log(`\n✅ ${agent['name']} completed: ${task.title}`)
    console.log(`   Status: COMPLETED | Duration: ${this.calculateDuration(task)}`)

    // Trigger dependent tasks
    for (const blocked of this.blockedTasks) {
      if (blocked.dependencies.includes(task.id)) {
        this.blockedTasks = this.blockedTasks.filter(t => t.id !== blocked.id)
        this.assignTask(blocked)
      }
    }
  }

  private onTaskFailed(agent: BaseAgent, task: AgentTask, error: Error): void {
    console.log(`\n❌ ${agent['name']} failed: ${task.title}`)
    console.log(`   Error: ${error.message}`)
  }

  private calculateDuration(task: AgentTask): string {
    if (!task.completedAt) return 'N/A'
    const duration = task.completedAt.getTime() - task.createdAt.getTime()
    return `${duration}ms`
  }

  printAgentStatus(): void {
    console.log('📊 Agent Status:')
    for (const agent of this.agents.values()) {
      const status = agent.getStatus()
      console.log(`   ${status.name} (${status.role})`)
      console.log(`      Tasks: ${status.completedCount}/${status.taskCount}`)
      console.log(`      Status: ${status.status}`)
      console.log(`      Security Violations: ${status.securityViolations}`)
    }
  }

  getProgress(): {
    queued: number
    completed: number
    blocked: number
    total: number
  } {
    return {
      queued: this.taskQueue.length,
      completed: this.completedTasks.length,
      blocked: this.blockedTasks.length,
      total: this.taskQueue.length + this.completedTasks.length + this.blockedTasks.length,
    }
  }

  getCompletedTasks(): AgentTask[] {
    return this.completedTasks
  }

  getBlockedTasks(): AgentTask[] {
    return this.blockedTasks
  }

  getAgents(): Map<string, BaseAgent> {
    return this.agents
  }
}

// ============================================================================
// Task Builders
// ============================================================================

export class TaskBuilder {
  private task: AgentTask
  private phase?: number
  private specRequirements: Map<string, string> = new Map()

  constructor(title: string, description: string) {
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
    }
  }

  addSecurityCheck(category: string, requirement: string, riskLevel: 'critical' | 'high' | 'medium' = 'high'): TaskBuilder {
    this.task.securityChecklist.push({
      id: uuid(),
      category: category as any,
      requirement,
      verified: false,
      riskLevel,
    })
    return this
  }

  addDependency(taskId: string): TaskBuilder {
    this.task.dependencies.push(taskId)
    return this
  }

  setPriority(priority: 'critical' | 'high' | 'medium' | 'low'): TaskBuilder {
    this.task.priority = priority
    return this
  }

  setPhase(phase: number): TaskBuilder {
    this.phase = phase
    this.task.notes.push(`[PHASE ${phase}] Marsad Development Phase ${phase}`)
    return this
  }

  addSpecRequirement(code: string, requirement: string): TaskBuilder {
    this.specRequirements.set(code, requirement)
    this.task.notes.push(`[SPEC] ${code}: ${requirement}`)
    return this
  }

  build(): AgentTask {
    return this.task
  }
}
