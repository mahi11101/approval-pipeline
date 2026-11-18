import assert from "node:assert";
import { rmSync } from "node:fs";

process.env.AUDIT_LOG = "test-audit.jsonl";
rmSync("test-audit.jsonl", { force: true });
const { server, classify } = await import("./server.js");

assert.deepEqual(classify({ type: "refund", amount: 50 }), { route: "auto", owner: "system" });
assert.deepEqual(classify({ type: "refund", amount: 500 }), { route: "approval", owner: "billing-lead" });
assert.deepEqual(classify({ type: "access", level: "admin" }), { route: "approval", owner: "security" });

await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const post = (p, b) => fetch(base + p, { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());

const small = await post("/webhook", { type: "refund", amount: 40 });
assert.equal(small.status, "approved");

const big = await post("/webhook", { type: "refund", amount: 900 });
assert.equal(big.status, "pending");
assert.equal((await post(`/approve/${big.id}`, { by: "intern" })).error, "only billing-lead can decide");
assert.equal((await post(`/approve/${big.id}`, { by: "billing-lead" })).status, "approved");

const log = await fetch(base + "/audit").then((r) => r.json());
assert.equal(log.length, 4);
server.close();
rmSync("test-audit.jsonl", { force: true });
console.log("All tests passed");
