# Ticketing: missing price tags

## What it is for

In a store, an item sometimes has no price tag. The store associate photographs the item, the app works out which product it is, and a new tag is printed. When the app cannot be sure, the ticket goes to a **resolver**, who identifies the item and answers the store.

The flow was modelled on the CitiTrends ResolverIQ process.

## Who does what

| Person | Role in the State Machine | Works in |
|---|---|---|
| Store associate | `store_associate` | The app: capture, review, print |
| Resolver | `resolver` | The **State Machine** itself: claim, decide, comment |

A store associate belongs to one **store**. The store's id and name come from a `store_assignment` record in the State Machine. An associate sees only their own store's tickets. The old resolver screens were removed from the app on purpose: resolvers work tickets in the State Machine, and the app follows along.

A State Machine **Super Administrator** can sign in to the ticketing app and view or act on tickets across stores. A superadmin does not need a store assignment to sign in or view tickets. Store-bound work such as starting a new ticket or running its photo quality check uses that account's optional `store_assignment` as the default store; assign one in the ticketing State Machine if the account needs to create tickets.

The browser sends the signed-in user's access token with each ticketing API request. The API validates that token before handling the request. State Machine data operations remain server-side and use the app's configured service account; the service credentials are never sent to the browser.

## The whole journey

```
Store associate                         State Machine (automatic, by connectors)

1. Take 1 to 5 photos
2. Photo quality check (in the app)
3. Create ticket  ───────────────────►  CAPTURED       read the tag text (OCR) and barcode
                                        IMAGE_MAPPED   work out brand, department, class, colour, size
                                        AI_IDENTIFICATION   find matching products, rate the match
                                        NEW            ticket is ready
4. Review the match
   ├─ Right item found ──► Resolve & Print ─►  RESOLVED   (the store resolved it itself)
   │                          print tag, confirm it is on the item ► COMPLETED
   └─ Not sure ──► Request assistance ───────►  NEW, escalated, waiting for a resolver
                                        INPROGRESS     a resolver claims it
                                        RESOLVED / NOT_CT_MERCH / CANT_RESOLVE
5. The store sees the answer, accepts it, prints, confirms the tag is on.
```

---

## 1. Capture

Up to five photos, each for a slot: **Front**, **Back**, **Tag**, **Markings** (the care or brand label) and **Extra**. A hint under each slot tells the associate what to show. The Tag photo should be close and sharp, because the barcode and price are read from it.

Photos can be taken with the camera or uploaded. The app resizes them and stores a fingerprint (SHA-256) so the same photo is not used in two slots. If the associate agrees, the photo's location is kept.

## 2. Photo quality check

Before anything is created, the app checks every photo:

| Check | Limit | Message if it fails |
|---|---|---|
| Resolution | The shorter side must be at least 400 px | "Image resolution is too low. Move closer and retake." |
| Sharpness | Blur score at least 12 | "Image is blurry. Hold steady and retake." |
| Brightness | At least 45 | "Image is too dark. Add light and retake." |
| Glare | At most 252 | "Image is overexposed. Reduce glare and retake." |

A photo that fails must be retaken. The check passes a one-time token that the next step uses to create the ticket.

## 3. Create the ticket

The app creates a `incident` record in the State Machine with:

- a ticket number from the State Machine's own counter, for example `TK-0165` (it cannot be reset),
- the store, who raised it, and when,
- links to the photos, which are stored as files in the State Machine,
- the item count (how many items are missing a tag, 1 to 99, default 1).

The ticket is then *enrolled* in the **ResolverIQ Incident Lifecycle** workflow, starting in `CAPTURED`.

## 4. The pipeline: three automatic stages

Each early state calls a connector. The connector does the work and saves its own results on the ticket.

| State | Connector | What it does |
|---|---|---|
| **CAPTURED** | analyze photos | Reads the tag text with OCR, reads the barcode, and turns each photo into an image fingerprint (CLIP). Finds the most similar catalog items |
| **IMAGE_MAPPED** | map attributes | Works out brand, department, class, colour and size from the tag text and the image |
| **AI_IDENTIFICATION** | identify candidates | Builds the list of candidate products, scores them, and rates the match (green, yellow or red) |

### Step mode and auto mode

The workflow can be published in two ways (`node scripts/sm-workflow.mjs --mode step|auto --publish`):

- **Step mode** (`SM_STEP_MODE=true`): the ticket waits at each state until someone clicks *Continue* on the processing screen. This is for demonstrations: the screen shows Captured, Image mapped, AI identification and Ticket ready, each with a Continue button.
- **Auto mode:** each connector's result fires the next transition by itself, and the ticket reaches NEW without clicks.

## How a match is found and rated

Candidates come from three kinds of evidence:

| Evidence | Score |
|---|---|
| **Barcode** read from the tag matches a catalog product | 0.99 |
| **Image** similarity between the photos and a catalog photo | the similarity itself (0 to 1) |
| **Attributes**: same brand, class and colour | up to 0.85 (brand 0.4 + class 0.4 + colour 0.2, then scaled) |

Candidates below 0.6 are dropped, and at most six are shown, best first.

The **rating** (`gating`) decides what the associate may do:

| Rating | When | What the associate can do |
|---|---|---|
| **GREEN** | The best score is at least 0.88 **and** leads the next one by at least 0.05 | Resolve & print |
| **YELLOW** | There are candidates, but no clear winner | Choose one, or ask for help |
| **RED** | No candidates, analysis failed, or more than five strong (0.75 or more) matches from photo or barcode | Blocked from printing. Must request assistance |

Attribute-only matches do not count towards the "too many" rule, because many products share a brand, class and colour.

A candidate below 65% confidence cannot be printed, even if chosen.

## 5. Review and resolve

The ticket page shows the best match with its photo, price and barcode, and how each detail was found: from the barcode, the image, or the attributes. The associate can:

- **Resolve & Print.** Confirms the match. The ticket moves to `CONFIRMED` in the app, and the State Machine ticket is moved from `NEW` to `RESOLVED` by `store_to_resolved` (it needs `selected_candidate`). No resolver is involved.
- **Request assistance (escalate).** See below.

### Print

After confirming, the associate chooses a tag colour reminder (regular price or markdown), a printer (1 or 2) and copies (1 to 99, default is the item count). The tag shows the product, colour, price and barcode.

Rules enforced: the ticket must be confirmed, the barcode must be a valid GTIN, and the same label cannot be printed twice within 10 seconds. Each print is recorded on the ticket.

### Confirm the new tag was added

After printing, the associate taps **Confirm New Tag Added**. The ticket becomes `COMPLETED` and `closed_at` is saved.

## 6. Request assistance (escalate)

The associate picks a reason, the item age and the item count, and may add a note.

| Reason | When |
|---|---|
| Too many similar items | Several items look right |
| Not enough to identify it | The photos are not enough |
| Analysis unavailable | The analysis or catalog could not run |
| I'm not sure | The associate is not confident |
| The label won't print | Printing failed |
| Something else | A note is required |

Item age is **new freight** or **old merchandise**. New freight gives the ticket **HIGH** priority; old merchandise gives LOW.

Escalation saves the details on the ticket, marks it as escalated so resolvers can find it, and posts a comment: "<name> asked a resolver for help (user unsure, new freight, 2 items): <note>". A ticket already resolved cannot be escalated.

## 7. The resolver, working in the State Machine

A resolver opens the ticket in the State Machine. It shows the photos, the candidate list, the extracted details and the escalation, in forms attached to each state.

1. **Claim.** Assign it to yourself and move it from `NEW` to `INPROGRESS` (`to_inprogress`). The app's sync connector marks the ticket as being worked on and names the resolver from the assignee.
2. **Decide.** In the *Incident: resolver* form, fill what the decision needs, then move the ticket:

| Decision | Trigger | To | Fill in first |
|---|---|---|---|
| Found the item | `to_resolved` | RESOLVED | **Selected Candidate**, a dropdown of catalog products (name and SKU). Add a comment for the store |
| Not Citi Trends merchandise | `to_notctmerch` | NOT_CT_MERCH | **Resolver Reason Code** |
| Cannot be resolved | `to_cantresolve` | CANT_RESOLVE | **Resolver Reason Code**, and a comment |
| Needs a senior resolver | `escalate_to_l2` | NEEDS_L2 | **Escalation Note** |

The State Machine refuses a transition until its required field is saved, and greys it out with the missing field named.

3. **Other moves** that exist in the workflow: `to_new` (hand it back), `claim_l2` (a senior resolver takes a NEEDS_L2 ticket), and `NOT_CT_MERCH_to_NEW`, `CANT_RESOLVE_to_NEW`, `…_to_NEEDS_L2` (reopen or escalate a decided ticket). The app's screens do not use these, but the State Machine allows them.

### What the store sees afterwards

When a ticket enters `INPROGRESS`, `RESOLVED`, `NOT_CT_MERCH`, `CANT_RESOLVE` or back to `NEW`, the **sync resolver action** connector updates the store's view:

| Resolver action | The store sees |
|---|---|
| Claimed | "In review", with the resolver's name |
| Resolved | "Resolved". The recommended item with photo, price and barcode, the resolver's comment, an unread flag and an inbox message. The store accepts it and prints |
| Not CT merch | "Not CT Merch", with the reason. The store then records what happened to the item: discarded, returned to vendor, or donated |
| Can't resolve | "Can't Resolve", with the reason and comment. The same disposition choice |
| Handed back to NEW | "Waiting for a resolver" again |

The connector is safe to run again and does nothing for tickets the app already moved on. Tickets the store resolved itself are left alone.

## States: the workflow and the app

The workflow is **ResolverIQ Incident Lifecycle** (published in the State Machine). The app also keeps its own status, `app_state`, saved as a field on the ticket.

### Workflow states

| State | Meaning | Connector on entry |
|---|---|---|
| **CAPTURED** (initial) | Photos saved | analyze photos |
| **IMAGE_MAPPED** | Tag text and attributes read | map attributes |
| **AI_IDENTIFICATION** | Candidates found and rated | identify candidates |
| **NEW** | Ready; waiting for the store or a resolver | sync resolver action |
| **INPROGRESS** | A resolver has claimed it | sync resolver action |
| **RESOLVED** (terminal) | Item identified, by the store or a resolver | sync resolver action |
| **NOT_CT_MERCH** | The item is not Citi Trends merchandise | sync resolver action |
| **CANT_RESOLVE** | The resolver could not identify it | sync resolver action |
| **NEEDS_L2** | Waiting for a senior resolver | notify L2 resolvers |

### App statuses and what the store sees

| `app_state` | Shown as | Meaning |
|---|---|---|
| `METADATA_PENDING` | Analyzing | The pipeline is still running |
| `CANDIDATES_READY` | Review match | Matches are ready |
| `ESCALATED` | In-Review | Waiting for a resolver |
| `RESOLUTION_IN_PROGRESS` | In-Review | A resolver is working on it |
| `RESOLVER_RESPONSE_RECEIVED` | Resolved / Not CT Merch / Can't Resolve | The resolver answered |
| `CONFIRMED` | Ready to print | The store accepted an item |
| `PRINTED` | Tag printed | At least one label was printed |
| `COMPLETED` | Completed | The tag is on the item |
| `CLOSED` | Discarded / Returned / Donated | Finished without a tag (after a disposition) |
| `FAILED` | Needs help | Analysis or printing failed |

## Connectors

All carry the `SM_CONNECTOR_KEY` header. Endpoints are under `/api/sm/`.

| Connector | Path | Used on |
|---|---|---|
| Ticketing: analyze photos | `analyze` | CAPTURED |
| Ticketing: map attributes | `map-attributes` | IMAGE_MAPPED |
| Ticketing: identify candidates | `identify` | AI_IDENTIFICATION |
| Ticketing: sync resolver action | `sync-resolver` | NEW, INPROGRESS, RESOLVED, NOT_CT_MERCH, CANT_RESOLVE |
| Ticketing: notify L2 resolvers | `notify` | NEEDS_L2 |
| Ticketing: notify store | `notify` | Available for use; the sync connector sends the store message |
| Ticketing: print label | `print-label` | Available as an action |
| Ticketing: look up product by barcode | `gtin-lookup` | **A tool** a resolver or agent can call: checks the barcode (length and check digit) and returns the catalog product |

Connectors save their own results. They are registered with an empty response mapping on purpose: a mapping would make the State Machine write back a copy of the ticket it read *before* the call, overwriting what the connector saved.

## The product catalog and the library

- The **catalog** (50 sample products) lives in the State Machine: product records, their photos and image fingerprints. `npm run catalog` loads it from `data/products.json` and `public/catalog/`.
- The **library** grows as stores work. When a ticket is resolved, the app can save the item (with fingerprints made from the ticket's photos) so the next photo of it matches. Saved items are visible only to that store.

## Photos, comments and data

- **Photos** are files of type `incident_photo`, owned by the ticket.
- **Quality checks** are short-lived `quality_check` records that carry the passed photos to ticket creation.
- **Comments:** escalations are posted as comments. Comments typed in the State Machine are visible there.
- **Activity:** the app keeps an activity list on the ticket (created, analyzed, escalated, claimed, resolved, printed, completed), shown at the bottom of the ticket.

## Screens and routes

| Screen | Path |
|---|---|
| Home (open tickets, new updates) | `/` |
| Capture photos | `/capture` |
| Processing (pipeline) | `/review` |
| Ticket (review, resolve, print, confirm) | `/incident/[id]` |
| Request assistance | `/incident/[id]/assist` |
| Inbox (All, In review, Resolved, Completed, Unresolvable, Unread) | `/inbox` |

The routes behind them are under `/api/mock/`: `quality-check`, `jobs/[id]`, `incidents` (create, list), `incidents/[id]` and its `images`, `read`, `pipeline`, `advance`, `confirm`, `escalate`, `disposition`, `new-tag-added`, plus `label-print`, `products`, `library` and `auth`.

## Not built yet

Reopening and unclaiming from the app, a fast lane, chat between store and resolver, real brand and price data for the catalog (placeholders are used), a real push service, and a way to reset the ticket counter.
