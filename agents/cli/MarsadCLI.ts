#!/usr/bin/env node

import { AgentOrchestrator, TaskBuilder } from '../orchestrator/AgentOrchestrator'
import * as readline from 'readline'

/**
 * Marsad CLI — Command-line interface for Autonomous Agents
 * Usage: node cli/MarsadCLI.ts
 */

const orchestrator = new AgentOrchestrator()
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const COMMANDS = {
  'build-api': 'Build API endpoint with security checks',
  'build-component': 'Build React component with XSS prevention',
  'setup-db': 'Configure database with RLS and encryption',
  'run-security-audit': 'Run comprehensive security audit',
  'run-tests': 'Run integration and security tests',
  'status': 'Show agent status and progress',
  'help': 'Show available commands',
  'exit': 'Exit CLI',
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                     🚀 MARSAD AUTONOMOUS AGENTS                          ║
║                   Security-First Platform Builder                         ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

📖 Type 'help' for available commands.

  `)

  await startREPL()
}

async function startREPL(): Promise<void> {
  while (true) {
    const command = await prompt('marsad> ')

    switch (command.trim().toLowerCase()) {
      case 'build-api':
        await buildAPI()
        break
      case 'build-component':
        await buildComponent()
        break
      case 'setup-db':
        await setupDatabase()
        break
      case 'run-security-audit':
        await runSecurityAudit()
        break
      case 'run-tests':
        await runTests()
        break
      case 'status':
        orchestrator.printAgentStatus()
        break
      case 'help':
        printHelp()
        break
      case 'exit':
        console.log('👋 Goodbye!')
        rl.close()
        process.exit(0)
      default:
        console.log('❓ Unknown command. Type "help" for available commands.')
    }
  }
}

async function buildAPI(): Promise<void> {
  const title = await prompt('API Endpoint name (e.g., "POST /companies/search"): ')
  const description = await prompt('Description: ')

  const task = new TaskBuilder(title, description)
    .setPriority('critical')
    .addSecurityCheck('injection', 'SQL Injection Prevention via Parameterized Queries', 'critical')
    .addSecurityCheck('multi-tenant', 'Tenant Isolation Check Before Data Access', 'critical')
    .addSecurityCheck('auth', 'JWT Verification on Every Request', 'critical')
    .addSecurityCheck('logging', 'Audit Log for Sensitive Operations', 'high')
    .build()

  await orchestrator.assignTask(task)
}

async function buildComponent(): Promise<void> {
  const name = await prompt('Component name (e.g., "SearchBar"): ')
  const description = await prompt('Description: ')

  const task = new TaskBuilder(`Build Component: ${name}`, description)
    .setPriority('high')
    .addSecurityCheck('owasp-top10', 'XSS Prevention via DOMPurify', 'critical')
    .addSecurityCheck('auth', 'Protected Route Check', 'critical')
    .addSecurityCheck('crypto', 'No Sensitive Data in localStorage', 'critical')
    .build()

  await orchestrator.assignTask(task)
}

async function setupDatabase(): Promise<void> {
  const dbName = await prompt('Database name (e.g., "marsad_prod"): ')

  const task = new TaskBuilder('Configure Database', `Setup ${dbName} with RLS and encryption`)
    .setPriority('critical')
    .addSecurityCheck('multi-tenant', 'RLS Policies Enabled', 'critical')
    .addSecurityCheck('encryption', 'Sensitive Data Encrypted at Rest', 'critical')
    .addSecurityCheck('logging', 'Database Audit Trail Enabled', 'high')
    .build()

  await orchestrator.assignTask(task)
}

async function runSecurityAudit(): Promise<void> {
  console.log('\n🔒 Starting Security Audit...')

  const task = new TaskBuilder('Security Audit', 'Comprehensive OWASP + Multi-tenant audit')
    .setPriority('critical')
    .addSecurityCheck('owasp-top10', 'OWASP Top 10 Coverage', 'critical')
    .addSecurityCheck('multi-tenant', 'Tenant Isolation Verified', 'critical')
    .addSecurityCheck('auth', 'Auth Mechanisms Verified', 'critical')
    .addSecurityCheck('crypto', 'Encryption Standards Met', 'critical')
    .addSecurityCheck('logging', 'Sensitive Data Never Logged', 'critical')
    .build()

  await orchestrator.assignTask(task)
}

async function runTests(): Promise<void> {
  console.log('\n🧪 Starting Tests...')

  const integrationTask = new TaskBuilder('Integration Testing', 'End-to-end flow tests')
    .setPriority('high')
    .addSecurityCheck('auth', 'End-to-End Auth Flow', 'high')
    .addSecurityCheck('multi-tenant', 'Tenant Isolation Verified', 'high')
    .build()

  const securityTask = new TaskBuilder('Security Testing', 'OWASP Top 10 tests')
    .setPriority('critical')
    .addDependency(integrationTask.id)
    .addSecurityCheck('owasp-top10', 'OWASP Tests Passed', 'critical')
    .addSecurityCheck('injection', 'Injection Tests Passed', 'critical')
    .build()

  await orchestrator.assignTask(integrationTask)
  await orchestrator.assignTask(securityTask)
}

function printHelp(): void {
  console.log('\n📖 Available Commands:\n')
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(20)} - ${desc}`)
  }
  console.log()
}

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve)
  })
}

// Start CLI
main().catch(console.error)
