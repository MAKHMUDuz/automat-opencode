/**
 * The decision logic behind model-failover, kept free of the plugin host so
 * it can be reasoned about and tested on its own.
 */

export type ModelRef = { providerID: string; id: string }

/** Errors that mean "this model/account has no capacity left", not "this request is wrong". */
export const EXHAUSTION =
  /(quota|usage limit|usage cap|insufficient (quota|credit|credits|balance|funds)|out of (credits?|tokens?)|free tier|billing|payment required|rate.?limit|too many requests|resource.?exhausted|capacity)/i

/** Context overflow is recovered by compaction, never by swapping models. */
export const CONTEXT_OVERFLOW =
  /(context (window|length|limit)|maximum context|prompt is too long|too many tokens)/i

export const key = (ref: ModelRef) => `${ref.providerID}/${ref.id}`

export function parseRef(value: unknown): ModelRef | undefined {
  if (typeof value !== "string") return undefined
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return undefined
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

/** Parse a list, dropping anything that is not a valid `provider/model` ref. */
export function parseChain(values: unknown): ModelRef[] {
  if (!Array.isArray(values)) return []
  return values.map(parseRef).filter((ref): ref is ModelRef => ref !== undefined)
}

export function isExhaustion(error: { status?: number; message?: string; type?: string }) {
  const message = error.message ?? ""
  if (CONTEXT_OVERFLOW.test(message)) return false
  if (error.status === 429 || error.status === 402) return true
  if (/rate.?limit|quota|usage|insufficient/i.test(error.type ?? "")) return true
  return EXHAUSTION.test(message)
}

/**
 * The model to switch to after `current` fails: the next entry in the chain
 * after the current one, or — when the failing model is not itself part of the
 * chain — the first usable model that is not the one that just failed.
 * Returns undefined when the chain is exhausted.
 */
export function pickNext(usable: ModelRef[], current: string): ModelRef | undefined {
  const index = usable.findIndex((ref) => key(ref) === current)
  return index >= 0 ? usable[index + 1] : usable.find((ref) => key(ref) !== current)
}
