// Approval pipeline: webhook -> rules -> approval -> audit log.
// Zero dependencies. Run: node server.js   (Node 18+)
import http from "node:http";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const RULES = [
  // First matching rule wins.
  { when: (r) => r.type === "refund" && r.amount <= 100, route: "auto", owner: "system" },
  { when: (r) => r.type === "refund", route: "approval", owner: "billing-lead" },
  { when: (r) => r.type === "access" && r.level === "admin", route: "approval", owner: "security" },
  { when: (r) => r.type === "access", route: "auto", owner: "system" },
  { when: () => true, route: "approval", owner: "ops-manager" },
];

const pending = new Map();
const LOG = process.env.AUDIT_LOG || "audit.jsonl";

function audit(event, data) {
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + "\n");
}

export function classify(req) {
  const rule = RULES.find((r) => r.when(req));
  return { route: rule.route, owner: rule.owner };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/webhook") {
      const body = await readBody(req);
      const id = randomUUID().slice(0, 8);
      const { route, owner } = classify(body);
      audit("received", { id, request: body, route, owner });
      if (route === "auto") {
        audit("approved", { id, by: "system" });
        return send(res, 200, { id, status: "approved", by: "system" });
      }
      pending.set(id, { ...body, owner });
      // In production this posts an Approve / Reject message to Slack.
      console.log(`[notify ${owner}] ${id}: ${JSON.stringify(body)}`);
      return send(res, 202, { id, status: "pending", owner });
    }
    const m = url.pathname.match(/^\/(approve|reject)\/(\w+)$/);
    if (req.method === "POST" && m) {
      const [, action, id] = m;
      const item = pending.get(id);
      if (!item) return send(res, 404, { error: "not pending" });
      const { by } = await readBody(req);
      if (by !== item.owner) return send(res, 403, { error: `only ${item.owner} can decide` });
      pending.delete(id);
      const status = action === "approve" ? "approved" : "rejected";
      audit(status, { id, by });
      return send(res, 200, { id, status, by });
    }
    if (req.method === "GET" && url.pathname === "/audit") {
      const lines = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : [];
      return send(res, 200, lines.map((l) => JSON.parse(l)));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Approval pipeline on http://localhost:${port}`));
}
