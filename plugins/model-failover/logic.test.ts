import { test } from "node:test"
import assert from "node:assert/strict"
import { isExhaustion, key, parseChain, parseRef, pickNext } from "./logic.ts"

test("parseRef splits provider/model and rejects junk", () => {
  assert.deepEqual(parseRef("opencode/glm-5.3-flash-free"), {
    providerID: "opencode",
    id: "glm-5.3-flash-free",
  })
  assert.equal(parseRef("no-slash"), undefined)
  assert.equal(parseRef("/leading"), undefined)
  assert.equal(parseRef("trailing/"), undefined)
  assert.equal(parseRef(42), undefined)
  assert.equal(parseRef(null), undefined)
})

test("parseChain drops invalid entries but keeps order", () => {
  const chain = parseChain(["a/one", "bad", "b/two", "", "c/three"])
  assert.deepEqual(chain.map(key), ["a/one", "b/two", "c/three"])
  assert.deepEqual(parseChain("not-an-array"), [])
  assert.deepEqual(parseChain(undefined), [])
})

test("exhaustion is detected from status and message", () => {
  assert.equal(isExhaustion({ status: 429 }), true)
  assert.equal(isExhaustion({ status: 402 }), true)
  assert.equal(isExhaustion({ message: "You have exceeded your usage limit" }), true)
  assert.equal(isExhaustion({ message: "insufficient credits remaining" }), true)
  assert.equal(isExhaustion({ type: "rate_limit_error" }), true)
  assert.equal(isExhaustion({ message: "model capacity reached" }), true)
})

test("context overflow is never treated as exhaustion", () => {
  // Compaction handles these; swapping models would not help.
  assert.equal(isExhaustion({ status: 429, message: "prompt is too long" }), false)
  assert.equal(isExhaustion({ message: "maximum context length exceeded" }), false)
  assert.equal(isExhaustion({ message: "too many tokens in context window" }), false)
})

test("unrelated errors are not exhaustion", () => {
  assert.equal(isExhaustion({ message: "invalid api key" }), false)
  assert.equal(isExhaustion({ message: "model not found" }), false)
  assert.equal(isExhaustion({}), false)
})

test("pickNext advances along the chain", () => {
  const chain = parseChain(["a/one", "b/two", "c/three"])
  assert.deepEqual(pickNext(chain, "a/one") && key(pickNext(chain, "a/one")!), "b/two")
  assert.deepEqual(pickNext(chain, "b/two") && key(pickNext(chain, "b/two")!), "c/three")
})

test("pickNext returns undefined when the chain is exhausted", () => {
  const chain = parseChain(["a/one", "b/two"])
  // "b/two" is the last entry, so there is nothing after it.
  assert.equal(pickNext(chain, "b/two"), undefined)
})

test("pickNext skips the failing model when it is not in the chain", () => {
  const chain = parseChain(["a/one", "b/two"])
  const next = pickNext(chain, "z/other")
  assert.deepEqual(next && key(next), "a/one")
})
