/**
 * Marsad Autonomous Agents — Main Export
 * Re-exports all agents and orchestrator for easy usage
 */

export { BaseAgent, AgentTask, SecurityCheckItem, AgentMemory, AgentAuditLog } from './core/BaseAgent'
export { BackendEngineer } from './backend/BackendEngineer'
export { FrontendEngineer } from './frontend/FrontendEngineer'
export { SecurityEngineer } from './security/SecurityEngineer'
export { QAEngineer } from './qa/QAEngineer'
export { AgentOrchestrator, TaskBuilder } from './orchestrator/AgentOrchestrator'

/**
 * Quick start example:
 *
 * import { AgentOrchestrator, TaskBuilder } from './agents'
 *
 * const orchestrator = new AgentOrchestrator()
 *
 * const task = new TaskBuilder('API: GET /companies/:id', 'Retrieve company details')
 *   .setPriority('high')
 *   .addSecurityCheck('injection', 'SQL Injection Prevention', 'critical')
 *   .addSecurityCheck('multi-tenant', 'Tenant Isolation', 'critical')
 *   .addSecurityCheck('auth', 'JWT Required', 'critical')
 *   .build()
 *
 * await orchestrator.assignTask(task)
 * orchestrator.printAgentStatus()
 */
