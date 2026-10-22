---
name: unattended-delivery
description: "Use when a job must run to completion with no clarifying questions and survive model quota exhaustion: log assumptions, hand off to the next enabled model, verify, and report. The system-safety gate outranks autonomy: steps failing the gate stop the run. See the `opencode` skill for plugin mechanics."
license: MIT
---

# Unattended Delivery

Finish the whole job in one pass. Ask nothing, assume deliberately, verify before claiming, and keep going when the model behind the session runs out of capacity.

## Use When

- The operator hands over a task and expects a finished result, not a plan or a menu of options.
- A long run may outlive one model's quota, so the session must survive a mid-task hand-off.
- The request is already specific enough that a reasonable engineer would start without a meeting.

## Do Not Use When

- The request is a genuine either/or where the two answers produce incompatible artefacts; that is a scoping conversation, not execution. Ask once, in one message, then run this skill.
- The work is a read-only review or audit; use `code-review` or `security-audit`, which report instead of changing things.
- The operator explicitly asked for a plan, a proposal, or options to choose from.

## Contract

0. **Safety gate first, every time.** Before any mutating action, answer the check below. If it fails, do not do the step and continue with what is safe instead.
1. **Never ask a question the work can answer.** Read the repository, the config, the logs, the tests. A question is the last resort, not the first move.
2. **Assume in writing, not silently.** When two readings are both defensible, take the one that changes less, keep it reversible, and record it in the decision log.
3. **Deliver the whole job.** Inspect, decide, implement, verify. Do not stop after analysis, and do not return a plan when the request was an action.
4. **Never claim an unrun check.** Anything not executed is reported as `NOT VERIFIED` with the reason.
5. **One blocker, one message.** If a stop condition is hit, say what is blocked, what is already done, and the single action needed to continue.

### Safety gate (runs before every mutation)

The gate lives in the operator's global instructions file (`~/.config/opencode/AGENTS.md`, the "never damage the system" section) and outranks every rule in this file. In short, before a shell command, edit, write, config change, package/service operation, network change, or push:

1. Name what the action touches and whether it is reversible without a backup.
2. No backup, no dry-run, no easy undo on a destructive step → do not run it; take the reversible path.
3. Never use `sudo`/`su`/`doas`/`pkexec`, remove packages, wipe disks, edit `/etc`/`/boot`/system units, kill services, force-push, or pipe remote content to a shell without the operator naming that exact action.
4. Anything that could break boot, login, network, storage, or firewall reachability → stop the run and report; this is the one place autonomy yields.
5. Read-only inspection is always allowed and is the right first move when unsure.

## Workflow

1. **Restate the job as a checklist.** One line per deliverable, including the verification step for each. Keep it in the todo tool when available.
2. **Inspect before deciding.** Existing config, conventions, tests, and versions outrank your preferences.
3. **Resolve ambiguity with defaults.** Apply the table below, keep the change reversible, continue.
4. **Execute in dependency order.** Finish one item before starting the next; update the checklist as state changes.
5. **Verify with the real thing.** Run the build, the test, the command, the request. Read the output, not just the exit code.
6. **Report once, at the end**, in the shape given under Reporting.

### Default decisions

| Ambiguity | Default |
|---|---|
| Two valid file locations | The one the surrounding code already uses |
| New dependency vs standard library | Standard library |
| Refactor scope | Touch only what the task requires |
| Naming or formatting | Match the nearest neighbouring file |
| Destructive shortcut vs safe migration | Safe migration, even if slower |
| Uncertain external API shape | Check the docs or the installed types, do not guess |
| Test framework missing | Add the project's existing pattern; if none exists, report `NOT VERIFIED` |

## Model Failover

A session can lose its model mid-task when a free-tier quota or rate limit is reached. The `model-failover` plugin handles the switch:

- On a quota, rate-limit, or billing error, it moves the session to the next model in the configured chain and retries the failed request.
- Context-window overflow is **not** a failover case; OpenCode compacts the conversation instead.
- Because the switch is session-scoped, the conversation, tool history, and todo list stay intact.

Conduct rules for a hand-off:

1. Do not restart the job, re-plan it, or re-read everything. Read the last tool results and continue from the next unfinished checklist item.
2. Do not narrate the switch as a problem. One line at most: the previous model ran out and the session moved on.
3. If the chain is exhausted, stop cleanly and write `HANDOFF.md` in the working directory with: the goal, what is done, what remains, the exact next commands, and any assumption that needs review. Then report the blocker.
4. Never switch models by hand mid-task unless the operator asked for it; the plugin owns that decision.

## Stop Conditions

Stop and report only when one of these is true:

- The safety gate fails: the next step is destructive without a backup, needs elevation, or could break boot, login, network, storage, or firewall reachability.
- The task needs a credential, token, or secret that only the operator can supply.
- The configured permission rules deny the action; do not look for a workaround.
- Two readings of the request would produce incompatible artefacts and neither is reversible.
- The model chain is exhausted before the job is complete.

Everything else — missing files, failing tests, unknown tooling, ambiguous naming — is work, not a blocker.

## Reporting

End with four short sections:

1. **Done** — the deliverables, with file paths.
2. **Verified** — each check actually run, with the result.
3. **Not verified** — anything skipped and why.
4. **Decisions** — the assumptions taken under Contract rule 2, one line each.

Keep it factual. A failed check that is reported honestly is worth more than a green summary that was never executed.

## Anti-Patterns

- "Shall I proceed?" after the operator already said to do it. Fix: proceed, log the assumption.
- Presenting three options and waiting. Fix: pick the reversible one and state why in the decision log.
- Stopping at the first error with no diagnosis. Fix: read the error, try the adjacent safe path, report only if genuinely blocked.
- Declaring success from an exit code without reading the output. Fix: inspect the output or the artefact.
- Re-planning from scratch after a model hand-off. Fix: continue from the checklist and the last tool result.
- Silently widening scope because "it was easy". Fix: keep to the requested change set.
