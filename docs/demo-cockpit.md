# Demo cockpit

A page in the app, at `/demo`, that puts the DC QC and Ticketing demo back at the start so it can be run again. It is always there: the **Demo cockpit** card sits under DC QC and Ticketing on the workspace chooser. Any signed-in user can open it, and a reset needs the word `RESET` typed to confirm.

## What it shows

For each of the three workflows, the number of records and how many are in each state:

- DCQC Shipment QC
- DCQC UPC QC
- ResolverIQ Incident Lifecycle

The product catalog is not part of it.

## What a reset does

| Record | Mid-check or open | Finished |
|---|---|---|
| Shipment | Back to **Created**, saved fields cleared | **Closed**: deleted and made again from the sample data |
| UPC | Back to **Pending**, counts, checks and flags cleared, photos on it deleted | **Won't QC**: deleted and made again |
| Ticket | Back to **Captured**, what the workflow produced is emptied, the store's photos stay | **Resolved**: deleted with its photos |
| Pallets, flags, notifications | Deleted, and pallets are made again for every UPC | |

A workflow cannot leave a terminal state, which is why finished records are made again instead of moved back. Everything else keeps its record and moves back with a `demo_reset` step.

Notes on a record that were written before the reset are hidden in the app. The State Machine keeps them in its Comments tab, with a "Demo reset" line marking the point.

The sample photos in `public/sample-photos`, the users, the forms and the connectors are not touched.

## How it works

- `src/lib/demo/reset.ts` does the work with the service login, through the State Machine's own APIs: `GET /workflow-enrollments`, `POST /entities/{id}/transitions`, `PUT` and `DELETE /entity-records/{id}`, `POST /filehandler/list`, `DELETE /filehandler/{id}`.
- `GET /api/mock/demo/status` and `POST /api/mock/demo/reset` are the two routes behind the page.
- `scripts/sm-dcqc.mjs` and `scripts/sm-workflow.mjs` add a `demo_reset` step from every state that is not terminal back to the first state. Run them once on each State Machine before using the cockpit there.

## Test

`node scripts/test-demo-reset.mjs` runs a full DC QC flow, resets, checks everything is back at the start, then runs the whole flow again. The second run only passes if the connectors fire again after a reset. Needs the backend on port 3001 and the State Machine.
