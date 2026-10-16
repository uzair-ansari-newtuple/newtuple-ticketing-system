# Retail Ops: documentation

One web app, two workflows, one data store.

| Document | What it covers |
|---|---|
| [DC QC](dc-qc.md) | Checking a shipment against its purchase order at the distribution center, UPC by UPC |
| [Ticketing](ticketing.md) | Fixing an item that is missing its price tag, from a photo to a printed tag |
| [DC QC demo script](dc-qc-demo-script.md) | A 10-minute walkthrough for presenting DC QC to a retailer |

## How the pieces fit

```
 Phone / tablet / desktop browser
            │
            ▼
   Next.js app (port 3000)  ──────────────►  Next.js backend (port 3001)
   screens: /apps, /qc/*, /, /capture …        /api/mock/*   (what the screens call)
                                               /api/sm/*     (what State Machine connectors call)
                                                     │                    ▲
                                                     ▼                    │ connector calls
                                              ┌──────────────────────────────────┐
                                              │          State Machine           │
                                              │  entities · workflows · forms ·  │
                                              │  connectors · files · comments · │
                                              │  users and roles                 │
                                              └──────────────────────────────────┘
```

- **The State Machine is the only database.** Tickets, shipments, UPCs, pallets, photos, quality checks, users, roles and the product catalog all live there. The app has no database of its own.
- **The app screens never talk to the State Machine directly.** They call the backend routes under `/api/mock`, which use the signed-in user's login to check who they are, then read and write the State Machine with a service account.
- **Workflows decide what is allowed.** A step such as "approve a UPC" or "submit QC" is a *transition* in a State Machine workflow. The State Machine refuses it when required fields are missing or a guard fails.
- **Connectors do the automatic work.** When a record enters a state, the State Machine can call a connector: an address on the backend with a shared key. Connectors count units, keep totals up to date, read photos, print labels and write messages.
- **Everything leaves a trail.** Each step posts a comment on the record, visible in the State Machine's Comments tab, and the State Machine keeps its own activity history.

## Signing in

Everyone signs in with a State Machine account. After login you land on `/apps`, which offers two cards: **DC QC** and **Ticketing**. The "Switch workspace" item in the account menu brings you back.

Roles are kept in the State Machine. Today they decide which app a person can use for Ticketing (`store_associate`, `resolver`). The DC QC screens do not yet separate associates from supervisors: any signed-in user can do any DC QC step.

## Words used in these documents

| Word | Meaning |
|---|---|
| **State** | Where a record is in its life, for example `IN_PROGRESS` |
| **Transition** | A step that moves a record from one state to another, for example `qc_submit` |
| **Guard** | A rule a transition must pass, for example "blocking UPCs must be 0" |
| **Required field** | A value that must be saved on the record before a transition is allowed |
| **Connector** | An automatic call from the State Machine to the backend when a record enters a state |
| **Form** | A named group of fields shown on a record in the State Machine's screen |
| **Expected** | The amount the purchase order asked for |
| **MDL** | The number of units in one bundle |

## Running it

Prerequisites: the State Machine is running, and `.env` has the `SM_*` values (see `.env.example`).

```bash
npm install
node scripts/sm-data.mjs     # file types, entity types, the catalog workflow
node scripts/sm-forms.mjs    # Ticketing forms and fields
node scripts/sm-users.mjs    # roles and the first users
node scripts/sm-setup.mjs    # Ticketing connectors
node scripts/sm-workflow.mjs --mode step --publish   # the Ticketing workflow
npm run catalog              # product catalog, photos and image vectors
node scripts/sm-dcqc.mjs     # DC QC entities, forms, connectors and both workflows

npm run dev:api              # backend on port 3001
npm run dev:web              # screens on port 3000
```

Every setup script can be run again safely. Run `node scripts/sm-dcqc.mjs` again after adding users, so the user dropdowns on the DC QC forms list them.

## Tests

All tests need the backend (port 3001), the screens (port 3000) and the State Machine running.

| Script | What it proves |
|---|---|
| `node scripts/test-qc-app.mjs` | Every DC QC step, rule, connector and comment (76 checks) |
| `node scripts/test-workflow.mjs` | The Ticketing workflow, connectors, step and auto mode (66) |
| `node scripts/test-sm-resolver.mjs` | A resolver working a ticket inside the State Machine (25) |
| `node scripts/test-identity.mjs` | Login, roles and store access (26) |
| `node scripts/test-sm-stages.mjs` | The three Ticketing pipeline stages |
| `npx tsx scripts/test-ml-server.ts` | Photo analysis: image matching, text and barcode reading |

Note: `test-qc-app.mjs` starts by deleting all DC QC data. `node scripts/sm-clean.mjs --yes` clears Ticketing tickets and `node scripts/sm-clean-qc.mjs --yes` clears DC QC data. Both keep users and the catalog.

## Environment

| Variable | Purpose |
|---|---|
| `SM_BASE_URL` | Where the State Machine API is |
| `SM_EMAIL`, `SM_PASSWORD` | The service account the backend uses |
| `SM_MACHINE_NAME`, `SM_ENTITY_TYPE` | The Ticketing workflow and its entity type |
| `SM_CATALOG_MACHINE_NAME` | The product catalog workflow |
| `SM_DCQC_SHIPMENT_MACHINE_NAME`, `SM_DCQC_UPC_MACHINE_NAME` | The two DC QC workflows (written by `sm-dcqc.mjs`) |
| `SM_CONNECTOR_KEY` | The shared key the State Machine sends on every connector call |
| `SM_CONNECTOR_BASE_URL` | Where the State Machine's worker reaches the backend (default `http://host.docker.internal:3001`) |
| `SM_STEP_MODE` | `true` when the Ticketing workflow waits for a click at each early state |
| `DEMO_*`, `USER_PASSWORD_*` | Local test logins used only by the scripts. Never set these in a deployed environment |

Connector calls time out after 10 seconds on the State Machine side. The backend warms its image models when it starts, so the first Ticketing photo is not slow.
