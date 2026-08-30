# Antigravity Kit Architecture

> Comprehensive AI Agent Capability Expansion Toolkit (OpenCode Format)

---

## Overview

Antigravity Kit is a modular system consisting of:

- **19 Specialist Agents** - Role-based AI personas
- **36 Skills** - Domain-specific knowledge modules
- **11 Commands** - Slash command procedures

---

## Directory Structure

```
.opencode/
├── ARCHITECTURE.md          # This file
├── INSTRUCTIONS.md          # Global rules (always-on)
├── agents/                  # 19 Specialist Agents
├── commands/                # 11 Slash Commands
├── skills/                  # 36 Skills (with scripts/data)
├── scripts/                 # Master Validation Scripts
├── references/              # Project-specific rules
└── .shared/                 # Shared UI/UX data
```

---

## Agents (19)

Specialist AI personas for different domains.

| Agent | Focus | Skills Used |
| ----- | ----- | ----------- |
| `orchestrator` | Multi-agent coordination | parallel-agents, behavioral-modes |
| `project-planner` | Discovery, task planning | brainstorming, plan-writing, architecture |
| `frontend-specialist` | Web UI/UX | frontend-design, react-patterns, tailwind-patterns |
| `backend-specialist` | API, business logic | api-patterns, nodejs-best-practices, database-design |
| `database-architect` | Schema, SQL | database-design |
| `mobile-developer` | iOS, Android, RN | mobile-design |
| `game-developer` | Game logic, mechanics | game-development |
| `devops-engineer` | CI/CD, Docker | deployment-procedures, server-management |
| `security-auditor` | Security compliance | vulnerability-scanner, red-team-tactics |
| `penetration-tester` | Offensive security | red-team-tactics |
| `test-engineer` | Testing strategies | testing-patterns, tdd-workflow, webapp-testing |
| `debugger` | Root cause analysis | systematic-debugging |
| `performance-optimizer` | Speed, Web Vitals | performance-profiling |
| `seo-specialist` | Ranking, visibility | seo-fundamentals, geo-fundamentals |
| `documentation-writer` | Manuals, docs | documentation-templates |
| `product-manager` | Requirements, user stories | plan-writing, brainstorming |
| `qa-automation-engineer` | E2E testing, CI pipelines | webapp-testing, testing-patterns |
| `code-archaeologist` | Legacy code, refactoring | clean-code, code-review-checklist |
| `explorer-agent` | Codebase analysis | - |

---

## Skills (36)

Modular knowledge domains that agents can load on-demand based on task context.

### Frontend & UI

| Skill | Description |
| ----- | ----------- |
| `react-patterns` | React hooks, state, performance |
| `nextjs-best-practices` | App Router, Server Components |
| `tailwind-patterns` | Tailwind CSS v4 utilities |
| `frontend-design` | UI/UX patterns, design systems |

### Backend & API

| Skill | Description |
| ----- | ----------- |
| `api-patterns` | REST, GraphQL, tRPC |
| `nodejs-best-practices` | Node.js async, modules |
| `python-patterns` | Python standards, FastAPI |

### Database

| Skill | Description |
| ----- | ----------- |
| `database-design` | Schema design, optimization |

### Cloud & Infrastructure

| Skill | Description |
| ----- | ----------- |
| `deployment-procedures` | CI/CD, deploy workflows |
| `server-management` | Infrastructure management |

### Testing & Quality

| Skill | Description |
| ----- | ----------- |
| `testing-patterns` | Jest, Vitest, strategies |
| `webapp-testing` | E2E, Playwright |
| `tdd-workflow` | Test-driven development |
| `code-review-checklist` | Code review standards |
| `lint-and-validate` | Linting, validation |

### Security

| Skill | Description |
| ----- | ----------- |
| `vulnerability-scanner` | Security auditing, OWASP |
| `red-team-tactics` | Offensive security |

### Architecture & Planning

| Skill | Description |
| ----- | ----------- |
| `app-builder` | Full-stack app scaffolding |
| `architecture` | System design patterns |
| `plan-writing` | Task planning, breakdown |
| `brainstorming` | Socratic questioning |

### Mobile

| Skill | Description |
| ----- | ----------- |
| `mobile-design` | Mobile UI/UX patterns |

### Game Development

| Skill | Description |
| ----- | ----------- |
| `game-development` | Game logic, mechanics (with sub-skills) |

### SEO & Growth

| Skill | Description |
| ----- | ----------- |
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | GenAI optimization |

### Shell/CLI

| Skill | Description |
| ----- | ----------- |
| `bash-linux` | Linux commands, scripting |
| `powershell-windows` | Windows PowerShell |

### Other

| Skill | Description |
| ----- | ----------- |
| `clean-code` | Coding standards (Global) |
| `behavioral-modes` | Agent personas |
| `parallel-agents` | Multi-agent patterns |
| `mcp-builder` | Model Context Protocol |
| `documentation-templates` | Doc formats |
| `i18n-localization` | Internationalization |
| `performance-profiling` | Web Vitals, optimization |
| `systematic-debugging` | Troubleshooting |
| `better-auth-best-practices` | Auth patterns |
| `better-auth-security-best-practices` | Auth security |
| `create-auth-skill` | Auth skill creation |
| `email-and-password-best-practices` | Credential handling |

---

## Commands (11)

Slash command procedures. Invoke with `/command`.

| Command | Description |
| ------- | ----------- |
| `/brainstorm` | Socratic discovery |
| `/create` | Create new features |
| `/debug` | Debug issues |
| `/deploy` | Deploy application |
| `/enhance` | Improve existing code |
| `/orchestrate` | Multi-agent coordination |
| `/plan` | Task breakdown |
| `/preview` | Preview changes |
| `/status` | Check project status |
| `/test` | Run tests |
| `/ui-ux-pro-max` | Design with 50+ styles |

---

## Skill Loading Protocol

```
User Request -> Skill Description Match -> Load SKILL.md
                                            |
                                    Read references/
                                            |
                                    Read scripts/
```

### Skill Structure

```
skill-name/
├── SKILL.md           # (Required) Metadata & instructions
├── scripts/           # (Optional) Python/Bash scripts
├── references/        # (Optional) Templates, docs
└── assets/            # (Optional) Images, logos
```

---

## Scripts (2)

Master validation scripts that orchestrate skill-level scripts.

### Master Scripts

| Script | Purpose | When to Use |
| ------ | ------- | ----------- |
| `checklist.py` | Priority-based validation (Core checks) | Development, pre-commit |
| `verify_all.py` | Comprehensive verification (All checks) | Pre-deployment, releases |

### Usage

```bash
# Quick validation during development
python .opencode/scripts/checklist.py .

# Full verification before deployment
python .opencode/scripts/verify_all.py . --url http://localhost:3000
```

---

## Statistics

| Metric | Value |
| ------ | ----- |
| **Total Agents** | 19 |
| **Total Skills** | 36 |
| **Total Commands** | 11 |
| **Total Scripts** | 2 (master) + 18 (skill-level) |
| **Coverage** | ~90% web/mobile development |

---

## Quick Reference

| Need | Agent | Skills |
| ---- | ----- | ------ |
| Web App | `frontend-specialist` | react-patterns, nextjs-best-practices |
| API | `backend-specialist` | api-patterns, nodejs-best-practices |
| Mobile | `mobile-developer` | mobile-design |
| Database | `database-architect` | database-design |
| Security | `security-auditor` | vulnerability-scanner |
| Testing | `test-engineer` | testing-patterns, webapp-testing |
| Debug | `debugger` | systematic-debugging |
| Plan | `project-planner` | brainstorming, plan-writing |
