# Approval pipeline

A minimal version of the approval workflows I build for operations and finance teams: **request → rules → approval → audit log**.

- A webhook receives a request (a refund, an access grant, anything).
- Rules decide whether it's auto-approved or needs a human, and who that human is.
- Only the assigned owner can approve or reject it.
- Every step is written to an append-only audit log (`audit.jsonl`).

In production the "notify" step posts an Approve / Reject message to Slack. Here it logs to the console so the project runs with zero dependencies.

## Run it

```bash
node server.js          # Node 18+
npm test                # runs the end-to-end test
```

```bash
curl -X POST localhost:3000/webhook -d '{"type":"refund","amount":900}'
# {"id":"a1b2c3d4","status":"pending","owner":"billing-lead"}
curl -X POST localhost:3000/approve/a1b2c3d4 -d '{"by":"billing-lead"}'
curl localhost:3000/audit
```

## Changing the rules

Edit `RULES` in `server.js`. The first matching rule wins, and the last one is a catch-all that sends anything unknown to a person.

Built by Mahesh Kumar with AI coding tools.
