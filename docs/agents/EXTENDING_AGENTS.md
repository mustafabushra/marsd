# 🔧 How to Extend the Agent System

**Purpose:** Add new agents or modify existing ones  
**Level:** Intermediate (requires TypeScript knowledge)  
**Time:** 15-30 minutes per new agent

---

## 📋 When to Add a New Agent

Consider adding a new agent when:
- ✅ You need a specialized role (DevOps, Documentation, Code Review)
- ✅ An existing agent is overloaded with tasks
- ✅ A new development phase requires expertise
- ❌ Don't add if existing agents can handle the work

**Good candidates for new agents:**
- DevOps Engineer (container + deployment)
- Documentation Engineer (API docs + guides)
- Code Review Engineer (quality checks)
- Performance Engineer (optimization)
- Product Owner (feature prioritization)

---

## 🏗️ Step 1: Create Agent Class

Create file: `agents/{domain}/{AgentName}.ts`

**Example: DocumentationEngineer**

```typescript
import { BaseAgent, AgentTask } from '../core/BaseAgent'

export class DocumentationEngineer extends BaseAgent {
  constructor() {
    super('Documentation Engineer', 'documentation-lead')
  }

  protected async executeTaskLogic(task: AgentTask): Promise<void> {
    const taskType = task.title.toLowerCase()

    if (taskType.includes('api docs')) {
      await this.generateAPIDocs(task)
    } else if (taskType.includes('user guide')) {
      await this.generateUserGuide(task)
    } else if (taskType.includes('architecture')) {
      await this.generateArchitecture(task)
    } else {
      await this.genericDocTask(task)
    }
  }

  private async generateAPIDocs(task: AgentTask): Promise<void> {
    this.logInfo(`Generating API documentation: ${task.description}`)

    // Add security checks
    task.securityChecklist.push(
      this.requireSecurityCheck('logging', 'No Secrets in Docs', 'critical'),
      this.requireSecurityCheck('owasp-top10', 'Security Examples Correct', 'high'),
    )

    // Verify security
    await this.verifySecurityItem(
      task.securityChecklist[0],
      'No passwords/tokens shown in examples'
    )
    await this.verifySecurityItem(
      task.securityChecklist[1],
      'All OWASP examples use secure patterns'
    )

    this.logInfo(`✅ API documentation secure and complete`)
  }

  private async generateUserGuide(task: AgentTask): Promise<void> {
    this.logInfo(`Generating user guide: ${task.description}`)
    // Implementation...
    this.logInfo(`✅ User guide complete`)
  }

  private async generateArchitecture(task: AgentTask): Promise<void> {
    this.logInfo(`Generating architecture docs: ${task.description}`)
    // Implementation...
    this.logInfo(`✅ Architecture documentation complete`)
  }

  private async genericDocTask(task: AgentTask): Promise<void> {
    this.logInfo(`Documentation Task: ${task.description}`)
  }

  private logInfo(msg: string): void {
    console.log(`[${this.name}] ${msg}`)
  }
}
```

---

## 🔌 Step 2: Register Agent in Orchestrator

Edit: `agents/orchestrator/AgentOrchestrator.ts`

Add import:
```typescript
import { DocumentationEngineer } from '../documentation/DocumentationEngineer'
```

Add to `initializeAgents()`:
```typescript
private initializeAgents(): void {
  const agentInstances = [
    new BackendEngineer(),
    new FrontendEngineer(),
    new SecurityEngineer(),
    new QAEngineer(),
    new DocumentationEngineer(),  // ← Add here
  ]

  for (const agent of agentInstances) {
    this.agents.set(agent.id, agent)
    this.setupAgentListeners(agent)
  }

  console.log(`\n🚀 Agent Orchestrator Initialized — ${this.agents.size} Agents Ready\n`)
  this.printAgentStatus()
}
```

Update `routeTask()`:
```typescript
private routeTask(task: AgentTask): BaseAgent | null {
  const title = task.title.toLowerCase()
  let targetRole = 'backend-architect'

  if (title.includes('backend') || title.includes('api')) {
    targetRole = 'backend-architect'
  } else if (title.includes('frontend') || title.includes('component')) {
    targetRole = 'frontend-architect'
  } else if (title.includes('security') || title.includes('auth')) {
    targetRole = 'security-lead'
  } else if (title.includes('test') || title.includes('qa')) {
    targetRole = 'quality-assurance'
  } else if (title.includes('doc') || title.includes('guide')) {  // ← Add
    targetRole = 'documentation-lead'  // ← Add
  }

  // Rest of function unchanged...
}
```

---

## 📋 Step 3: Add CLI Commands

Edit: `agents/cli/MarsadCLI.ts`

Add to COMMANDS object:
```typescript
const COMMANDS = {
  'build-api': 'Build API endpoint with security checks',
  'build-component': 'Build React component with XSS prevention',
  'setup-db': 'Configure database with RLS and encryption',
  'run-security-audit': 'Run comprehensive security audit',
  'run-tests': 'Run integration and security tests',
  'generate-docs': 'Generate API documentation',  // ← Add
  'status': 'Show agent status and progress',
  'help': 'Show available commands',
  'exit': 'Exit CLI',
}
```

Add command handler:
```typescript
case 'generate-docs':
  await generateDocs()
  break
```

Add function:
```typescript
async function generateDocs(): Promise<void> {
  const docType = await prompt('Documentation type (api/guide/architecture): ')
  const title = await prompt('Title: ')
  const description = await prompt('Description: ')

  const task = new TaskBuilder(`Generate ${docType} docs: ${title}`, description)
    .setPriority('high')
    .addSecurityCheck('logging', 'No Secrets in Docs', 'critical')
    .addSecurityCheck('owasp-top10', 'Security Examples Correct', 'high')
    .build()

  await orchestrator.assignTask(task)
}
```

---

## 📦 Step 4: Update package.json

If new agent needs dependencies:

```json
{
  "dependencies": {
    "existing": "^1.0.0",
    "new-lib": "^2.0.0"  // ← Add if needed
  }
}
```

Then:
```bash
npm install
npm run build
```

---

## 🧪 Step 5: Test New Agent

Create temporary test file: `test-new-agent.ts`

```typescript
import { AgentOrchestrator, TaskBuilder } from './orchestrator/AgentOrchestrator'

async function testNewAgent() {
  const orchestrator = new AgentOrchestrator()

  const task = new TaskBuilder(
    'Generate docs: API Reference',
    'Document all endpoints with examples'
  )
    .setPriority('high')
    .addSecurityCheck('logging', 'No Secrets in Docs', 'critical')
    .build()

  await orchestrator.assignTask(task)

  // Check status
  console.log('\n📊 Agent Status:')
  orchestrator.printAgentStatus()

  // Get completed tasks
  const completed = orchestrator.getCompletedTasks()
  console.log(`\n✅ Completed: ${completed.length}`)
}

testNewAgent().catch(console.error)
```

Run test:
```bash
npx tsx test-new-agent.ts
```

---

## 🔒 Security Considerations for New Agents

Every agent MUST:

1. **Include security checklist in tasks**
   ```typescript
   task.securityChecklist.push(
     this.requireSecurityCheck('category', 'requirement', 'risk-level')
   )
   ```

2. **Validate input before processing**
   ```typescript
   if (!this.validateInputSecurity(input, context)) {
     throw new Error('Invalid input detected')
   }
   ```

3. **Never bypass security for speed**
   ```typescript
   // ❌ WRONG
   if (skipSecurity) { /* execute without checks */ }

   // ✅ RIGHT
   await this.preExecutionSecurityCheck(task)  // Always validate
   ```

4. **Log all sensitive operations**
   ```typescript
   this.logAudit('SENSITIVE_OP', `Operation: ${description}`)
   ```

5. **Implement pre/post execution checks**
   ```typescript
   protected async executeTaskLogic(task: AgentTask): Promise<void> {
     // Your logic here
     // Framework handles pre/post checks automatically
   }
   ```

---

## 🎯 Agent Roles & Responsibilities

When designing a new agent, define:

| Property | Example |
|----------|---------|
| **Name** | Documentation Engineer |
| **Role** | documentation-lead |
| **Task Types** | API docs, User guides, Architecture |
| **Security Focus** | No secrets logged, Accurate examples |
| **Dependencies** | Backend complete (for accurate docs) |

---

## 📚 Agent Communication

Agents can ask each other for help:

```typescript
// In DocumentationEngineer
async function documentAPI(endpoint: string): Promise<void> {
  const backendAgent = this.getAgent('backend-architect')  // Need method

  const response = await this.requestHelp(
    [backendAgent],
    `What are the security requirements for ${endpoint}?`
  )

  console.log(`Backend says: ${response}`)
}
```

Add to BaseAgent if needed:
```typescript
protected getAgent(role: string): BaseAgent | undefined {
  // Return agent by role
}
```

---

## 🚀 Adding to Bootstrap Pipeline

Edit: `agents/bootstrap.ts`

Add phase or add to existing:

```typescript
// Example: Add docs generation to Phase 4
const docsTask = new TaskBuilder(
  'Generate API Documentation',
  'Document all endpoints with security examples'
)
  .setPriority('high')
  .addDependency(performanceTests.id)  // After other tests
  .build()

await orchestrator.assignTask(docsTask)
```

---

## ✅ Checklist for New Agent

Before committing:

- [ ] Agent class created (extends BaseAgent)
- [ ] Registered in AgentOrchestrator
- [ ] CLI command added (if needed)
- [ ] Security checklist included
- [ ] Tested independently
- [ ] Integrated with bootstrap
- [ ] Documentation updated
- [ ] No console errors
- [ ] Audit logging works
- [ ] Memory persistence active

---

## 📊 Example: Complete New Agent

**DevOpsEngineer.ts**

```typescript
import { BaseAgent, AgentTask } from '../core/BaseAgent'

export class DevOpsEngineer extends BaseAgent {
  constructor() {
    super('DevOps Engineer', 'devops-lead')
  }

  protected async executeTaskLogic(task: AgentTask): Promise<void> {
    if (task.title.includes('docker')) {
      await this.setupDocker(task)
    } else if (task.title.includes('deploy')) {
      await this.setupDeployment(task)
    } else {
      await this.genericDevOpsTask(task)
    }
  }

  private async setupDocker(task: AgentTask): Promise<void> {
    this.logInfo(`Setting up Docker: ${task.description}`)

    task.securityChecklist.push(
      this.requireSecurityCheck('crypto', 'Secrets Not in Dockerfile', 'critical'),
      this.requireSecurityCheck('owasp-top10', 'Base Image Secure', 'high'),
    )

    await this.verifySecurityItem(
      task.securityChecklist[0],
      'No passwords/API keys in Dockerfile or docker-compose'
    )
    await this.verifySecurityItem(
      task.securityChecklist[1],
      'Using official, security-patched base images'
    )

    this.logInfo(`✅ Docker configured securely`)
  }

  private async setupDeployment(task: AgentTask): Promise<void> {
    this.logInfo(`Setting up deployment: ${task.description}`)

    task.securityChecklist.push(
      this.requireSecurityCheck('crypto', 'HTTPS Enforced', 'critical'),
      this.requireSecurityCheck('auth', 'Environment Secrets Secure', 'critical'),
    )

    await this.verifySecurityItem(
      task.securityChecklist[0],
      'SSL/TLS enabled in production'
    )
    await this.verifySecurityItem(
      task.securityChecklist[1],
      'Secrets stored in secure environment (not in code)'
    )

    this.logInfo(`✅ Deployment configured securely`)
  }

  private async genericDevOpsTask(task: AgentTask): Promise<void> {
    this.logInfo(`DevOps Task: ${task.description}`)
  }

  private logInfo(msg: string): void {
    console.log(`[${this.name}] ${msg}`)
  }
}
```

---

## 🎓 Best Practices

1. **Keep agents focused** — One agent = one specialty
2. **Use security checklist** — Every task must verify security
3. **Log everything** — Audit trail is critical
4. **Test independently** — Verify agent works alone
5. **Document clearly** — Future developers need to understand
6. **Follow patterns** — Use existing agents as templates
7. **Never bypass checks** — Security first, always
8. **Communicate clearly** — Use logInfo for visibility

---

## 📞 Questions?

Refer to:
- **BaseAgent.ts** — Core functionality
- **BackendEngineer.ts** — Complex agent example
- **AgentOrchestrator.ts** — Registration and routing
- **agents/README.md** — User guide

---

**Ready to extend?** Follow steps 1-5 above and your new agent will integrate seamlessly into the system! 🚀
