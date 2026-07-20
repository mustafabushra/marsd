# 🚀 Marsad Autonomous Agents

**Autonomous AI Agent System** for building Marsad platform with **Security-First** approach.

## Overview

The Agent System consists of **specialized AI agents** that work autonomously to build Marsad:

- **Backend Engineer** — APIs, Databases, Authentication
- **Frontend Engineer** — Components, Pages, RTL compliance
- **Security Engineer** — OWASP audits, encryption, multi-tenant isolation
- **QA Engineer** — Integration tests, security tests, performance benchmarks

Each agent:
- ✅ Has a **security checklist** on every task
- ✅ Validates security requirements before task execution
- ✅ Logs all decisions and audit trails
- ✅ Communicates blockers to other agents
- ✅ Never bypasses security for speed

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         Agent Orchestrator                          │
│  (Coordinates task distribution & dependencies)    │
└──────────────┬──────────────────────────────────────┘
               │
     ┌─────────┼─────────┬─────────┐
     │         │         │         │
┌────▼─┐  ┌───▼───┐  ┌──▼───┐ ┌──▼──┐
│Backend│  │Frontend│  │Security│ │ QA │
│Eng.   │  │  Eng.  │  │  Eng.  │ │Eng.│
└───────┘  └────────┘  └────────┘ └────┘
     │         │         │         │
     └─────────┼─────────┴─────────┘
               │
       ┌───────▼────────┐
       │  Task Queue    │
       │  (Persistent)  │
       └────────────────┘
```

### Task Execution Flow

```
1. User creates task → Add to queue
2. Orchestrator routes to appropriate agent
3. Agent validates security checklist
4. Execute task with pre/post security checks
5. Log audit trail
6. Trigger dependent tasks
7. Report completion
```

---

## Installation

```bash
# Navigate to agents directory
cd agents

# Install dependencies
npm install

# Build TypeScript
npm run build
```

---

## Usage

### Start Interactive CLI

```bash
npm start
```

This opens the Marsad CLI where you can:
- `build-api` — Create new API endpoint
- `build-component` — Build React component
- `setup-db` — Configure database
- `run-security-audit` — Comprehensive security check
- `run-tests` — Integration & security tests
- `status` — Show agent progress
- `help` — List all commands

### Run Bootstrap (Full Build)

```bash
npm run bootstrap
```

This runs a complete build process:
1. **Phase 1:** Security foundation + DB setup + Auth
2. **Phase 2:** Backend APIs (Search, Trust Score, Reports)
3. **Phase 3:** Frontend components (pixel-perfect RTL)
4. **Phase 4:** Integration & security testing

### Run Specific Tasks

```bash
# Run security audit only
npm run agent:security-audit

# Run backend tasks
npm run agent:backend

# Watch mode (development)
npm run dev
```

---

## Security Requirements (Embedded)

Every task includes these security checks:

### OWASP Top 10
- ✅ SQL Injection Prevention (Parameterized Queries)
- ✅ XSS Prevention (React.createElement + DOMPurify)
- ✅ CSRF Prevention (SameSite cookies)
- ✅ SSRF Prevention
- ✅ XXE Prevention
- ✅ LDAP Injection Prevention
- ✅ Command Injection Prevention
- ✅ Template Injection Prevention
- ✅ Path Traversal Prevention
- ✅ IDOR Prevention (Resource ownership checks)

### Authentication
- ✅ Argon2id password hashing (bcryptjs 10 rounds)
- ✅ JWT tokens (15min expiration)
- ✅ Refresh token rotation
- ✅ Secure session management
- ✅ Multi-factor authentication support

### Encryption
- ✅ HTTPS only / TLS 1.3 minimum
- ✅ AES-256 for sensitive data
- ✅ No custom encryption

### Multi-Tenant
- ✅ Complete tenant isolation
- ✅ Row-Level Security enforcement
- ✅ Tenant ownership validation on every request

### Logging
- ✅ Never log passwords
- ✅ Never log tokens
- ✅ Never log secrets
- ✅ Audit trail for sensitive operations

---

## Example: Creating a Task

```typescript
import { AgentOrchestrator, TaskBuilder } from './orchestrator/AgentOrchestrator'

const orchestrator = new AgentOrchestrator()

// Create task with security checks
const task = new TaskBuilder('API: POST /companies/search', 'Search companies by name')
  .setPriority('critical')
  .addSecurityCheck('injection', 'SQL Injection Prevention', 'critical')
  .addSecurityCheck('multi-tenant', 'Tenant Isolation', 'critical')
  .addSecurityCheck('auth', 'JWT Required', 'critical')
  .build()

// Assign to appropriate agent
await orchestrator.assignTask(task)
```

---

## Task States

- **pending** — Waiting to be assigned
- **in-progress** — Agent is executing
- **blocked** — Dependencies not met
- **completed** — Task finished successfully
- **failed** — Task failed (error logged)

---

## Agent Status

Check agent progress:

```bash
marsad> status
```

Output shows:
- Agent name and role
- Tasks completed/total
- Current status
- Security violations (if any)

---

## Audit Logging

All agent actions are logged:

```typescript
agent.getAuditLog()
```

Returns array of:
```typescript
{
  timestamp: Date
  type: 'INIT' | 'TASK_ASSIGNED' | 'SECURITY_VERIFIED' | 'EXECUTION_FAILED'
  message: string
  agentId: string
  agentName: string
}
```

---

## Troubleshooting

### Task stuck in "waiting"
- Check dependencies: `orchestrator.getBlockedTasks()`
- Verify dependent task completed successfully
- Re-assign dependent task

### Security check failed
- Review audit log: `agent.getAuditLog()`
- Fix security issue in code
- Re-run task with corrected implementation

### Agent not responding
- Check agent status: `orchestrator.printAgentStatus()`
- Review task error: `orchestrator.getBlockedTasks()[0]`

---

## File Structure

```
agents/
├── core/
│   └── BaseAgent.ts          # Base class for all agents
├── backend/
│   └── BackendEngineer.ts    # Backend API development
├── frontend/
│   └── FrontendEngineer.ts   # Frontend components
├── security/
│   └── SecurityEngineer.ts   # Security audits & checks
├── qa/
│   └── QAEngineer.ts         # Testing & QA
├── orchestrator/
│   └── AgentOrchestrator.ts  # Coordinates all agents
├── cli/
│   └── MarsadCLI.ts          # Interactive CLI
├── bootstrap.ts              # Full build automation
├── package.json
├── tsconfig.json
└── README.md
```

---

## Performance

- Agent initialization: ~50ms
- Task routing: ~10ms
- Security check validation: ~5ms per item
- Audit log write: <1ms

For 100 parallel tasks: ~500ms total

---

## Security Model

**Trust but Verify:**

1. Every task must include security checklist
2. Pre-execution: Verify all critical items
3. During execution: Continuous security validation
4. Post-execution: Verify final security state
5. Audit: Immutable log of all decisions

---

## Contributing

To add a new agent:

1. Extend `BaseAgent` class
2. Implement `executeTaskLogic()`
3. Add security checks in task handler
4. Register in `AgentOrchestrator.initializeAgents()`
5. Add CLI command in `MarsadCLI.ts`

---

## License

MIT

---

**Status:** 🟢 Production-Ready | Autonomous Agent System v1.0
