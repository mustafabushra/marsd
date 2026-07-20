/**
 * Base Agent Class
 *
 * Every autonomous agent inherits from this base.
 * Ensures Security-First, Marsad-Focused approach.
 */

import { EventEmitter } from 'events'
import { v4 as uuid } from 'uuid'

export interface AgentTask {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  assignedTo?: string
  status: 'pending' | 'in-progress' | 'blocked' | 'completed' | 'failed'
  securityChecklist: SecurityCheckItem[]
  dependencies: string[]
  createdAt: Date
  completedAt?: Date
  notes: string[]
}

export interface SecurityCheckItem {
  id: string
  category: 'owasp-top10' | 'injection' | 'auth' | 'crypto' | 'multi-tenant' | 'logging'
  requirement: string
  verified: boolean
  riskLevel: 'critical' | 'high' | 'medium'
  evidence?: string
}

export interface AgentMemory {
  decisions: AgentDecision[]
  previousTasks: AgentTask[]
  context: Map<string, any>
  conversations: AgentConversation[]
}

export interface AgentDecision {
  timestamp: Date
  decision: string
  reasoning: string
  impact: string
  reversible: boolean
}

export interface AgentConversation {
  timestamp: Date
  with: string
  message: string
  response?: string
}

export abstract class BaseAgent extends EventEmitter {
  readonly id: string
  readonly name: string
  readonly role: string
  protected memory: AgentMemory
  protected tasks: Map<string, AgentTask> = new Map()
  protected status: 'idle' | 'thinking' | 'planning' | 'executing' | 'in-progress' | 'waiting' | 'blocked' = 'idle'

  // Security-First Properties
  protected securityMode: 'paranoid' | 'strict' | 'normal' = 'strict'
  protected auditLog: AgentAuditLog[] = []

  constructor(name: string, role: string) {
    super()
    this.id = uuid()
    this.name = name
    this.role = role
    this.memory = {
      decisions: [],
      previousTasks: [],
      context: new Map(),
      conversations: [],
    }
    this.initializeSecurityContext()
  }

  // ============================================================================
  // SECURITY-FIRST FOUNDATION
  // ============================================================================

  private initializeSecurityContext(): void {
    this.logAudit('INIT', `Agent ${this.name} initialized with security-first mode`)
    // Load Marsad Security Requirements
    this.memory.context.set('securityRequirements', MARSAD_SECURITY_REQUIREMENTS)
  }

  protected validateInputSecurity(input: any, context: string): boolean {
    // Never trust input - always validate
    if (!input) return false

    // Type validation
    if (typeof input !== 'object') return false

    // Sanitize and validate
    const sanitized = this.sanitizeInput(input)
    this.logAudit('INPUT_VALIDATION', `Validated input for ${context}`)
    return !!sanitized
  }

  private sanitizeInput(input: any): any {
    // Remove dangerous patterns
    const dangerous = ['<script', 'javascript:', 'onerror', 'onclick', 'DROP TABLE', 'DELETE FROM']
    const str = JSON.stringify(input)
    for (const pattern of dangerous) {
      if (str.toLowerCase().includes(pattern.toLowerCase())) {
        this.logAudit('SECURITY_THREAT', `Dangerous pattern detected: ${pattern}`)
        return null
      }
    }
    return input
  }

  // ============================================================================
  // TASK ASSIGNMENT & EXECUTION
  // ============================================================================

  async assignTask(task: AgentTask): Promise<void> {
    this.logAudit('TASK_ASSIGNED', `Task: ${task.title}`)

    // Validate task has security checklist
    if (!task.securityChecklist || task.securityChecklist.length === 0) {
      this.logAudit('SECURITY_WARNING', `Task ${task.id} missing security checklist`)
      throw new Error('Task must include security checklist')
    }

    this.tasks.set(task.id, task)
    this.emit('task:assigned', task)

    // Auto-execute if dependencies satisfied
    if (this.canExecuteTask(task)) {
      await this.executeTask(task)
    } else {
      this.status = 'waiting'
      this.emit('status:changed', 'waiting')
    }
  }

  private canExecuteTask(task: AgentTask): boolean {
    if (task.dependencies.length === 0) return true
    return task.dependencies.every(dep => {
      const depTask = this.tasks.get(dep)
      return depTask?.status === 'completed'
    })
  }

  protected async executeTask(task: AgentTask): Promise<void> {
    this.status = 'in-progress'
    this.emit('status:changed', 'in-progress')
    this.logAudit('EXECUTION_START', `Executing: ${task.title}`)

    try {
      // Pre-execution security check
      await this.preExecutionSecurityCheck(task)

      // Execute task logic
      await this.executeTaskLogic(task)

      // Post-execution security verification
      await this.postExecutionSecurityCheck(task)

      task.status = 'completed'
      task.completedAt = new Date()
      this.emit('task:completed', task)

      // Record decision
      this.recordDecision(task.title, 'Task completed successfully', `Completed ${task.title}`, true)
    } catch (error) {
      task.status = 'failed'
      this.logAudit('EXECUTION_FAILED', `Task failed: ${(error as Error).message}`)
      this.emit('task:failed', { task, error })
    }

    this.status = 'idle'
    this.emit('status:changed', 'idle')
  }

  protected async preExecutionSecurityCheck(task: AgentTask): Promise<void> {
    // Verify all critical security items before execution
    const criticalItems = task.securityChecklist.filter(
      item => item.riskLevel === 'critical' && !item.verified
    )

    if (criticalItems.length > 0) {
      this.logAudit('SECURITY_BLOCK', `Critical security items not verified: ${criticalItems.length}`)
      throw new Error(`Cannot execute: ${criticalItems.length} critical security items unverified`)
    }
  }

  protected async postExecutionSecurityCheck(task: AgentTask): Promise<void> {
    // Verify security requirements were met
    const allVerified = task.securityChecklist.every(item => item.verified)

    if (!allVerified) {
      const unverified = task.securityChecklist.filter(item => !item.verified)
      this.logAudit('SECURITY_WARNING', `Task completed but ${unverified.length} security items unverified`)
    }
  }

  // Abstract method - each agent implements their own logic
  protected abstract executeTaskLogic(task: AgentTask): Promise<void>

  // ============================================================================
  // SECURITY CHECKLIST VERIFICATION
  // ============================================================================

  protected async verifySecurityItem(item: SecurityCheckItem, evidence: string): Promise<void> {
    item.verified = true
    item.evidence = evidence
    this.logAudit('SECURITY_VERIFIED', `${item.category}: ${item.requirement}`)
  }

  protected requireSecurityCheck(category: string, requirement: string, riskLevel: 'critical' | 'high' | 'medium' = 'high'): SecurityCheckItem {
    return {
      id: uuid(),
      category: category as any,
      requirement,
      verified: false,
      riskLevel,
    }
  }

  // ============================================================================
  // COMMUNICATION & COLLABORATION
  // ============================================================================

  async requestHelp(agents: BaseAgent[], question: string): Promise<string> {
    this.status = 'waiting'
    this.emit('status:changed', 'waiting')
    this.logAudit('REQUEST_HELP', `Requesting help from ${agents.length} agents`)

    const responses: string[] = []
    for (const agent of agents) {
      const response = await agent.answer(this.name, question)
      responses.push(response)
      this.memory.conversations.push({
        timestamp: new Date(),
        with: agent.name,
        message: question,
        response,
      })
    }

    this.status = 'idle'
    this.emit('status:changed', 'idle')
    return responses.join('\n---\n')
  }

  async answer(from: string, question: string): Promise<string> {
    this.logAudit('INCOMING_QUESTION', `From ${from}: ${question}`)
    return `${this.name} response to ${from}: I'll investigate and provide analysis.`
  }

  // ============================================================================
  // MEMORY MANAGEMENT
  // ============================================================================

  private recordDecision(decision: string, reasoning: string, impact: string, reversible: boolean): void {
    this.memory.decisions.push({
      timestamp: new Date(),
      decision,
      reasoning,
      impact,
      reversible,
    })
  }

  getMemory(): AgentMemory {
    return this.memory
  }

  // ============================================================================
  // AUDIT & LOGGING
  // ============================================================================

  private logAudit(type: string, message: string): void {
    this.auditLog.push({
      timestamp: new Date(),
      type,
      message,
      agentId: this.id,
      agentName: this.name,
    })

    // Prevent log from growing unbounded
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000)
    }
  }

  getAuditLog(): AgentAuditLog[] {
    return this.auditLog
  }

  // ============================================================================
  // STATUS & REPORTING
  // ============================================================================

  getStatus(): {
    id: string
    name: string
    role: string
    status: string
    taskCount: number
    completedCount: number
    blockedCount: number
    securityViolations: number
  } {
    const completedCount = Array.from(this.tasks.values()).filter(t => t.status === 'completed').length
    const blockedCount = Array.from(this.tasks.values()).filter(t => t.status === 'blocked').length
    const securityViolations = this.auditLog.filter(log => log.type.includes('SECURITY')).length

    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status: this.status,
      taskCount: this.tasks.size,
      completedCount,
      blockedCount,
      securityViolations,
    }
  }
}

export interface AgentAuditLog {
  timestamp: Date
  type: string
  message: string
  agentId: string
  agentName: string
}

// ============================================================================
// MARSAD SECURITY REQUIREMENTS (EMBEDDED)
// ============================================================================

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
}
