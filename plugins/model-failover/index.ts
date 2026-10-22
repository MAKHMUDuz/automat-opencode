import { Plugin } from "@opencode/plugin"

/**
 * model-failover — automatic model hand-off on quota / rate-limit exhaustion.
 *
 * When the active model fails with a usage-quota or rate-limit error, the
 * session is moved to the next model in the configured chain and the failed
 * request is retried immediately. The chain is filtered against the models
 * that are actually available at the current location, so a stale entry is
 * skipped instead of breaking the turn.
 *
 * Install, then configure the chain in opencode.json(c):
 *
 *   opencode plugin add 'github:MAKHMUDuz/automat-opencode#main::path:plugins/model-failover'
 *
 *   {
 *     "plugins": [
 *       {
 *         "package": "github:MAKHMUDuz/automat-opencode#main::path:plugins/model-failover",
 *         "options": {
 *           "chain": ["provider/model-a", "provider/model-b", "provider/model-c"],
 *           "cooldownMs": 120000
 *         }
 *       }
 *     ]
 *   }
 */

type ModelRef = { providerID: string; id: string }

const DEFAULT_CHAIN = [
  "opencode/glm-5.3-flash-free",
  "opencode/minimax-m3.1-flash-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/longcat-2.5-preview-free",
  "opencode/nemotron-3.5-lightning-free",
  "opencode/big-pickle",
  "opencode/beam-free",
]

/** Errors that mean "this model/account has no capacity left", not "this request is wrong". */
const EXHAUSTION =
  /(quota|usage limit|usage cap|insufficient (quota|credit|credits|balance|funds)|out of (credits?|tokens?)|free tier|billing|payment required|rate.?limit|too many requests|resource.?exhausted|capacity)/i

/** Context overflow is recovered by compaction, never by swapping models. */
const CONTEXT_OVERFLOW = /(context (window|length|limit)|maximum context|prompt is too long|too many tokens)/i

const key = (ref: ModelRef) => `${ref.providerID}/${ref.id}`

function parseRef(value: unknown): ModelRef | undefined {
  if (typeof value !== "string") return undefined
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return undefined
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

function isExhaustion(error: { status?: number; message?: string; type?: string }) {
  const message = error.message ?? ""
  if (CONTEXT_OVERFLOW.test(message)) return false
  if (error.status === 429 || error.status === 402) return true
  if (/rate.?limit|quota|usage|insufficient/i.test(error.type ?? "")) return true
  return EXHAUSTION.test(message)
}

export default Plugin.define({
  id: "model-failover",
  async setup(ctx) {
    const configured = Array.isArray(ctx.options?.chain) ? ctx.options.chain : DEFAULT_CHAIN
    const chain = configured.map(parseRef).filter((ref): ref is ModelRef => ref !== undefined)
    const cooldownMs = Number(ctx.options?.cooldownMs ?? 120_000)

    // 2.0.x returns { location, data }, later builds may return the array directly.
    const listed = (await ctx.model.list()) as unknown
    const models = Array.isArray(listed)
      ? listed
      : Array.isArray((listed as { data?: unknown }).data)
        ? (listed as { data: { providerID: string; id: string }[] }).data
        : []
    const available = new Set(models.map((model) => key(model)))
    const usable = chain.filter((ref) => available.has(key(ref)))

    // One switch per failure burst, per session. Guards against a retry that
    // re-issues the request on the previous model and would otherwise burn
    // through the whole chain in a few seconds.
    const lastSwitch = new Map<string, { from: string; at: number }>()
    const log = (message: string) => console.log(`[model-failover] ${message}`)

    if (usable.length === 0) log("no chain model is available; failover disabled")
    else log(`ready: ${usable.length}/${chain.length} chain models available`)

    await ctx.session.hook("retry", async (event) => {
      if (!event.error || !isExhaustion(event.error)) return

      const current = key({ providerID: event.model.providerID, id: event.model.id })
      const previous = lastSwitch.get(event.sessionID)
      if (previous && previous.from === current && Date.now() - previous.at < cooldownMs) return

      const index = usable.findIndex((ref) => key(ref) === current)
      const next =
        index >= 0
          ? usable[index + 1]
          : usable.find((ref) => key(ref) !== current)
      if (!next) {
        log(`chain exhausted while on ${current}`)
        return
      }

      await ctx.session.switchModel({ sessionID: event.sessionID, model: next })
      lastSwitch.set(event.sessionID, { from: current, at: Date.now() })
      log(`${current} -> ${key(next)} (${event.error.status ?? event.error.type}: ${(event.error.message ?? "").slice(0, 120)})`)
      event.decision = { retry: true, delay: 0 }
    })
  },
})
