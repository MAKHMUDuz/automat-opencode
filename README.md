# automat-opencode

A session that finishes the job even when its model runs out.

Two pieces that work together in [OpenCode](https://opencode.ai):

| Piece | Kind | What it does |
|---|---|---|
| [`plugins/model-failover`](plugins/model-failover) | Plugin | On a quota / rate-limit / billing error, switches the session to the next model in your chain and retries the failed request immediately. |
| [`skills/unattended-delivery`](skills/unattended-delivery) | Skill | Teaches the agent to run unattended: assume in writing, verify every claim, and survive a mid-task model hand-off instead of restarting. |

The plugin changes the model; the skill changes how the agent behaves across the
switch. Together: quota exhaustion becomes a non-event instead of a dead run.

## Install

### Plugin

```sh
opencode plugin add 'github:MAKHMUDuz/automat-opencode#main::path:plugins/model-failover'
```

Or add it by hand in `opencode.json(c)`:

```jsonc
{
  "plugins": [
    {
      "package": "github:MAKHMUDuz/automat-opencode#main::path:plugins/model-failover",
      "options": {
        "chain": [
          "opencode/glm-5.3-flash-free",
          "opencode/minimax-m3.1-flash-free",
          "opencode/mimo-v2.6-flash-free"
        ],
        "cooldownMs": 120000
      }
    }
  ]
}
```

- `chain` — ordered `provider/model` refs. Models not available at your location
  are skipped, so a stale entry never breaks a turn.
- `cooldownMs` — one switch per failure burst (default `120000`). Stops a retry
  from burning the whole chain in seconds.

### Skill

Add the skill catalog to `opencode.json(c)`:

```jsonc
{
  "skills": ["https://raw.githubusercontent.com/MAKHMUDuz/automat-opencode/main/skills/"]
}
```

Or copy it into your global skills directory:

```sh
git clone https://github.com/MAKHMUDuz/automat-opencode
cp -r automat-opencode/skills/unattended-delivery ~/.config/opencode/skills/
```

Then mention `unattended-delivery` when you hand over a job, or let the model
load it from its description.

## How the hand-off works

1. A request fails with `429`, `402`, or a message matching quota / rate limit /
   billing / capacity (context-overflow messages are deliberately excluded —
   OpenCode compacts those instead).
2. The plugin calls `session.switchModel` to the next usable chain entry and
   marks the failed request for an immediate retry. Conversation, tool history,
   and todo list stay intact.
3. The agent follows the skill's conduct rules: continue from the last tool
   result, don't re-plan, one line about the switch at most.
4. Chain exhausted → the run stops cleanly with a `HANDOFF.md` naming what is
   done, what remains, and the exact next commands.

## Safety

The skill's autonomy is bounded by a safety gate that outranks it: no elevation,
no destructive step without a backup, nothing that could break boot, login,
network, storage, or firewall reachability. When the gate fails, the run stops
and reports — that is the one place "keep going" yields.

## Requirements

- OpenCode V2 (plugin API is beta; built against `@opencode/plugin`)
- A provider chain of at least two models

## License

[MIT](LICENSE)
