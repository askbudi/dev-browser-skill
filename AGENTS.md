# AGENTS.md Session Documentation

## Current Project Configuration

**Selected Coding Agent:** claude
**Main Task:** We want to extend this project
**Project Path:** /Users/mahdiyar/Code/CA_JUNOAI/playground/dev-browser-skill
**Git Repository:** Not specified
**Configuration Date:** 2026-02-05

## Agent-Specific Instructions

### claude Configuration
- **Recommended Model:** Latest available model for claude
- **Interaction Style:** Professional and detail-oriented
- **Code Quality:** Focus on production-ready, well-documented code
- **Testing:** Comprehensive unit and integration tests required

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

## Build & Test Commands

**Environment Setup:**
```bash
# Activate virtual environment (if applicable)
source /Users/mahdiyar/Code/CA_JUNOAI/playground/dev-browser-skill/.venv_juno/bin/activate

# Navigate to project
cd /Users/mahdiyar/Code/CA_JUNOAI/playground/dev-browser-skill
```

**Testing:**
```bash
# Run tests
python -m pytest tests/ -v

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=term-missing
```

**Development Notes:**
- Keep this file updated with important learnings and optimizations
- Document any environment-specific setup requirements
- Record successful command patterns for future reference

## Session History

| Date | Agent | Task Summary | Status |
|------|-------|--------------|---------|
| 2026-02-05 | claude | Project initialization | ✅ Completed |

## Agent Performance Notes

### claude Observations:
- Initial setup: Successful
- Code quality: To be evaluated
- Test coverage: To be assessed
- Documentation: To be reviewed

*Note: Update this section with actual performance observations during development*