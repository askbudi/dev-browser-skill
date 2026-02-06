# Claude Code Session Documentation

## Current Project Configuration

**Selected Coding Agent:** claude
**Main Task:** We want to extend this project
**Project Path:** /Users/mahdiyar/Code/CA_JUNOAI/playground/dev-browser-skill
**Git Repository:** Not specified
**Configuration Date:** 2026-02-05

## Kanban Task Management

```bash
# List tasks
./.juno_task/scripts/kanban.sh list --limit 5 --sort asc 
./.juno_task/scripts/kanban.sh list --status [backlog|todo|in_progress|done] --sort asc

# Task operations
./.juno_task/scripts/kanban.sh get {TASK_ID}
./.juno_task/scripts/kanban.sh mark [in_progress|done|todo] --id {TASK_ID} --response "message"
./.juno_task/scripts/kanban.sh update {TASK_ID} --commit {COMMIT_HASH}
```

When a task on kanban, has related_tasks key, you need to get the task to understand the complete picture of tasks related to the current current task, you can get all the context through
`./.juno_task/scripts/kanban.sh get {TASK_ID}`

When creating a task, relevant to another task, you can add the following format anywhere in the body of the task : `[task_id]{Ref_TASK_ID}[/task_id]` , using ref task id, help kanban organize dependecies between tasks better. 

Important: You need to get maximum 3 tasks done in one go. 

## Agent-Specific Instructions

### claude Configuration
- **Recommended Model:** Latest available model for claude
- **Interaction Style:** Professional and detail-oriented
- **Code Quality:** Focus on production-ready, well-documented code
- **Testing:** Comprehensive unit and integration tests required

## Build & Test Commands

**Install Dependencies:**
```bash
cd skills/dev-browser && npm install
cd extension && npm install
```

**Testing:**
```bash
# Skill tests
cd skills/dev-browser && npx vitest run

# Extension tests (requires wxt prepare to generate .wxt/tsconfig.json)
cd extension && npx wxt prepare && npx vitest run
```

**Formatting:**
```bash
# Format check (from root)
npm run format:check

# Format fix (from root)
npm run format
```

**Start Server:**
```bash
# Using server script
./skills/dev-browser/server.sh [OPTIONS]

# Using npx
cd skills/dev-browser && npx tsx scripts/start-server.ts [OPTIONS]

# Available flags:
# --help, --headless, --headful, --port, --cdp-port, --profile-dir,
# --label, --cookies, --status, --stop, --stop-all, --install
```

**Development Notes:**
- Keep this file updated with important learnings and optimizations
- Document any environment-specific setup requirements
- Record successful command patterns for future reference