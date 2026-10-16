# DC QC: shipment quality check

## What it is for

A retailer orders goods from a supplier on a **purchase order (PO)**. When the truck arrives at the distribution center (DC), DC staff must make sure everything the PO asked for actually arrived, in the right quantity, with the right labels. DC QC is where they do that, one UPC (one product barcode) at a time.

Three things are checked for every UPC:

1. The product is right: style, colour, UPC and price match the PO.
2. The count is right: the units on the pallets add up to the units on the PO.
3. The labels are on: the pallet label and every case label.

Anything that is wrong is **flagged**, and a supervisor decides what to do.

## The records

| Record | One of these is | Lives as |
|---|---|---|
| `shipment` | One PO that arrived | A workflow: **DCQC Shipment QC** |
| `upc` | One product on that PO | A workflow: **DCQC UPC QC** |
| `pallet` | One pallet of one UPC | A plain record (its status is a field) |
| `dcqc_flag` | One problem reported on a UPC | A plain record |
| `dcqc_notification` | One message sent by a connector | A plain record |
| Photos | Evidence pictures | Files of type `qc_photo`, owned by the UPC |

A shipment has many UPCs. A UPC has one or more pallets. Each UPC and pallet points back to its parent by id.

## The whole journey

```
Open Shipments ──► shipments are fetched from the PO list         (shipment CREATED)
Tick a PO, Start QC ───────────────────────────────────────────►  (shipment IN_PROGRESS)

   For each UPC:
   1. Pick the UPC                                                 (UPC PENDING)
   2. Check the product + add a goods photo                        (UPC IN_PROGRESS)
   3. Count the units
   4. Add a label photo, confirm the labels
   Then either   Approve  ──────────────────────────────────────►  (UPC APPROVED)
        or       Flag a problem ──► supervisor answers ─────────►  (UPC SUPERVISOR_HOLD, then
                                                                   APPROVED / back to IN_PROGRESS / WONT_QC)

All UPCs approved or skipped ─► Review and submit ─────────────►  (shipment QC_COMPLETE)
Supervisor: Start receipt ─────────────────────────────────────►  (shipment RECEIPT_IN_PROGRESS)
Supervisor: Close receipt with a confirmation number ───────────►  (shipment CLOSED)
```

---

## Shipment: states and transitions

| State | Meaning | How it is entered | Required fields | Guards |
|---|---|---|---|---|
| **CREATED** (initial) | Arrived at the DC, nobody has started | The fetch creates it | | |
| **IN_PROGRESS** | Associates are checking UPCs | `qc_start` from CREATED, or `receipt_return_to_associate` | `user_id`, `record_id` for `qc_start` | |
| **QC_COMPLETE** | Every UPC approved or skipped, QC submitted | `qc_submit` from IN_PROGRESS | `record_id` | `dcqc_qc_ready` = true and `dcqc_blocking_upc_count` = 0 |
| **RECEIPT_IN_PROGRESS** | A supervisor is verifying the receipt | `receipt_start` from QC_COMPLETE | `supervisor_user_id` | |
| **CLOSED** (terminal) | Finished | `receipt_close` from RECEIPT_IN_PROGRESS | `confirmation_number` | |

`receipt_return_to_associate` takes a shipment from QC_COMPLETE or RECEIPT_IN_PROGRESS back to IN_PROGRESS and needs `supervisor_user_id`. UPCs keep their states; to redo one, a supervisor reopens it.

### What happens in each shipment state

**CREATED.** The shipment, its UPCs and its pallets are created together. Counters start at `dcqc_qc_ready = false` and `dcqc_blocking_upc_count` = number of UPCs. The list shows "Ready for QC". The UPCs can be seen but not opened.

**IN_PROGRESS.**
- *On entry:* the **notify QC started** connector stamps `started_at`, records a message for the supervisor ("QC started on PO-…"), and the app posts a comment "QC started by <name>".
- *While in this state:* the four-step wizard is available. Each time a UPC changes state, the **roll up shipment** connector recounts the *blocking* UPCs (those still to check, in progress, or on hold), saves `dcqc_blocking_upc_count`, and sets `dcqc_qc_ready` once the count reaches 0.
- *Leaving:* "Review and submit" is shown once nothing blocks.

**QC_COMPLETE.**
- *On entry:* **notify QC complete** stamps `completed_at` and records "QC is complete … ready for receipt". The app also posts a comment with the totals, for example "QC submitted by Uzair: 3 UPCs approved, 1 skipped (won't QC), 222 of 232 units counted".
- *What you see:* two buttons, Start receipt and Return to associate (with an optional note).

**RECEIPT_IN_PROGRESS.** A comment "Receipt verification started by <name>" is added and `supervisor_user_id` is saved. The screen asks for the receipt confirmation number, with Close receipt and Return to associate.

**CLOSED.** **Notify receipt closed** records a message for the associate, "Receipt closed on PO-… (confirmation)". A comment records who closed it. Nothing more can be done.

---

## UPC: states and transitions

| State | Meaning |
|---|---|
| **PENDING** (initial) | Nobody has started this UPC |
| **IN_PROGRESS** | Being checked and counted |
| **SUPERVISOR_HOLD** | Flagged; waiting for a supervisor |
| **APPROVED** | Checked, counted and accepted |
| **WONT_QC** (terminal) | Skipped by a supervisor |

| Transition | From → To | Required fields | Done by |
|---|---|---|---|
| `upc_start` | PENDING → IN_PROGRESS | `user_id` | The first save on the UPC (a pallet check, a photo or a flag) |
| `count_check` | IN_PROGRESS → IN_PROGRESS | none | The app after each pallet save. This is the one step added to the CitiTrends workflow, so the count matcher runs again each time |
| `upc_approve` | IN_PROGRESS → APPROVED | `user_id` | "No, finish this UPC" when everything adds up |
| `upc_flag` | IN_PROGRESS → SUPERVISOR_HOLD | `flag_id` | "Report a problem" |
| `dcqc_supervisor_approve` | SUPERVISOR_HOLD → APPROVED | `resolved_by_user_id`, `flag_id` | Supervisor: Approve as counted |
| `upc_return_to_progress` | SUPERVISOR_HOLD → IN_PROGRESS | `resolved_by_user_id` | Supervisor: Send back to recount |
| `upc_wont_qc` | SUPERVISOR_HOLD → WONT_QC | `resolved_by_user_id` | Supervisor: Skip this UPC |
| `dcqc_reopen` | APPROVED → IN_PROGRESS | `supervisor_user_id`, `dcqc_rework_reason` | Supervisor: Reopen for rework (only while the shipment is IN_PROGRESS) |

### What happens in each UPC state

**PENDING.** The card says "Tap to start". Opening it does nothing until the associate saves something.

**IN_PROGRESS.** On entry the **count matcher** and **roll up shipment** connectors run. The count matcher adds up the pallets and saves `dcqc_received_units` and `dcqc_labels_complete`. The roll-up refreshes the shipment's counters.

**SUPERVISOR_HOLD.** On entry, **roll up shipment** runs (a held UPC blocks the shipment) and **notify supervisor** records "<product> (<UPC>) on PO-… needs a supervisor". The flag record holds the reason and the associate's note. `dcqc_exception_status` is `OPEN`. A comment is posted on the UPC.

**APPROVED.** On entry, **roll up shipment** runs. A comment records who approved and what was counted. If a supervisor approved a held UPC, the comment includes their note.

**WONT_QC.** On entry, **roll up shipment** runs (a skipped UPC no longer blocks). A comment records the supervisor's note.

### Exception status on the UPC

`dcqc_exception_status` shows the life of a flag: `OPEN` → `RESOLVED` (approved), `RESOLVED_RETURN_TO_QUEUE` (sent back) or `RESOLVED_WONT_QC` (skipped). `dcqc_active_exception_id` and `flag_id` hold the id of the flag record.

---

## The four-step wizard (QC Check)

Everything an associate does for a UPC happens in four tabs.

### 1. Pick a UPC
A worksheet summary (UPCs approved, held, in progress, units counted, units expected, skipped) and one card per UPC. Each card shows the product, UPC barcode, colour, style, size, **units expected**, **units you counted** and what a tap will do. Approved cards turn green, held ones red. Tapping an approved UPC offers *reopen for rework*.

### 2. Check the product
Open one case from the pallet and compare it with the PO. Tick five boxes: case opened, style, colour, UPC, price (each shows the expected value). Say whether the units are packed in bundles. Add at least one **goods photo** (up to five).

*Continue* stays off until all five boxes are ticked **and** a goods photo exists.

### 3. Count the units
Four numbered questions. Every box has a minus and plus, an example placeholder, the unit, and the expected value from the PO.

| Question | Field | Note |
|---|---|---|
| How many units are in one bundle? | `mdl_actual` | Filled in from the PO (`Expected: 6 units per bundle`). Change only if different |
| How many bundles are in one full case? | `bundles_per_case` | |
| How many full cases are on this pallet? | `full_cases_count` | Only completely full cases |
| How many loose units are there? | `dcqc_partial_units` | Units not in a full case. 0 if none |

If the units are **not** packed in bundles, questions 1 and 2 become one: "How many units are in one full case?" and bundles are counted as 1.

**The formula**

> Pallet total = full cases × bundles per case × units per bundle (MDL) + loose units

Example: 3 full cases × 4 bundles × 6 units + 0 loose = **72 units**.

The **This UPC so far** card updates live as you type, before you save: You counted, Expected, Still to count, Difference, and a sentence saying whether you match, are short or are over. A "Not saved yet" tag shows until you tap *Save count and continue*.

A count cannot be saved until the UPC has a goods photo.

### 4. Confirm the labels
Add at least one **label photo** that shows the pallet label and the case labels. Only then can the two boxes be ticked: *pallet label is on and scanned*, *every case label is on and scanned*. A summary shows this pallet's result. Then answer **Does this UPC have another pallet?**

- **Yes, check the next pallet.** Goes to the next unfinished pallet. If the PO listed no more, a new pallet is added.
- **No, finish this UPC.** The app checks everything and approves the UPC, or opens the flag form if the count is off.

### The approval rules (all must be true)
1. The shipment is IN_PROGRESS and the UPC is IN_PROGRESS.
2. Every pallet is finished: all seven checks ticked and the count entered.
3. Both label boxes are ticked on every pallet, and every pallet has a label photo.
4. The UPC's counted units **equal** the expected units.
5. At least one goods photo exists.

If the count is short or over, the app refuses to approve and suggests flagging.

---

## Counting rules in detail

| Number | How it is worked out |
|---|---|
| Pallet total | The formula above, saved as `dcqc_total_units` |
| UPC counted | The sum of its pallet totals, saved as `dcqc_received_units` by the count matcher connector |
| Remaining | Expected − counted, never below 0 |
| Difference | Counted − expected, shown with + or −, or a dash until something is counted |
| Result | **Match** when counted = expected, **Short** when less, **Over** when more |
| Pallet expected units | The UPC's expected units shared across its pallets in the PO |
| Shipment units counted | The sum of its UPCs' counted units. A supervisor-approved short UPC counts what was really counted |
| Blocking UPCs | UPCs in PENDING, IN_PROGRESS or SUPERVISOR_HOLD |

## Flags and the supervisor

A problem is reported with one of six reasons: Short shipment, Over shipment, Damaged goods, Wrong item received, Missing or unreadable label, Something else, plus an optional note. A photo is not required to flag. The count-based reason is suggested automatically.

The supervisor sees the UPC on the **Exceptions** tab, under *Waiting for supervisor*, and chooses:

| Choice | Effect | Transition |
|---|---|---|
| **Approve as counted** | Accepts the units as they are | `dcqc_supervisor_approve` |
| **Send back to recount** | The associate checks the UPC again | `upc_return_to_progress` |
| **Skip this UPC** | Leaves it out of QC (for example a claim was filed) | `upc_wont_qc` |

The supervisor's note is saved on the flag and posted as a comment.

## Photos

| Kind | Rule | Stored |
|---|---|---|
| Goods | At least one per UPC, up to five, before a count can be saved | File `qc_photo`, owned by the UPC, marked `goods` |
| Label | At least one per pallet before the label boxes can be ticked | Same, marked `label` and tied to the pallet |

Photos are JPEG or PNG, up to 8 MB. The camera needs HTTPS (except on localhost); *Upload* works everywhere.

## Connectors

All connector calls carry the `SM_CONNECTOR_KEY` header. Endpoints are under `/api/sm/dcqc/`.

| Connector | Runs on | What it does |
|---|---|---|
| **DCQC: fetch shipments** | Tool (called on demand) | Creates the sample shipments, UPCs and pallets. Safe to call again; it only adds new ones |
| **DCQC: roll up shipment** | UPC → IN_PROGRESS, SUPERVISOR_HOLD, APPROVED, WONT_QC | Recounts blocking UPCs; saves `dcqc_blocking_upc_count` and `dcqc_qc_ready` on the shipment. It looks twice, a moment apart, because the state change may not be visible at the first look |
| **DCQC: count matcher** | UPC → IN_PROGRESS | Adds up the pallets; saves `dcqc_received_units` and `dcqc_labels_complete` |
| **DCQC: notify supervisor** | UPC → SUPERVISOR_HOLD | Records the "needs a supervisor" message |
| **DCQC: notify QC started** | Shipment → IN_PROGRESS | Stamps `started_at`; records a message |
| **DCQC: notify QC complete** | Shipment → QC_COMPLETE | Stamps `completed_at`; records a message |
| **DCQC: notify receipt closed** | Shipment → CLOSED | Records a message for the associate |

The messages are shown under **Latest messages** on the Exceptions screen. They stand in for a real push notification.

If a connector is slow, the app does not wait forever: after a pallet save it waits about 8 seconds for the count matcher and then runs the same check itself.

## Comments in the State Machine

Every step posts a comment on the record, so the State Machine's Comments tab tells the story. The app posts them through the service account; the person's name is in the text.

- **Shipment:** QC started, QC submitted (with totals), receipt started, returned to the associate (with note), receipt closed (with confirmation number).
- **UPC:** approved (with counts), flagged (with reason and note), supervisor's answer (with note), sent back for rework (with reason).

Comments written *in the State Machine* appear in the app as a **Notes** box on the UPC screen.

## Forms in the State Machine

Ten forms match the CitiTrends definition, attached to every state of the matching workflow:

| Entity | Forms |
|---|---|
| Shipment | Shipment Details, QC Completion, Receipt Action |
| UPC | Product Details, QC Summary, Exception Summary, QC Action |
| Pallet | Pallet Details, Product and Labels, Pallet Counts |

The user fields (`user_id`, `supervisor_user_id`, `resolved_by_user_id`, `assigned_to_user_id`) are dropdowns of real users. `flag_id` is filled in by the app when someone flags a UPC.

## Where each number is stored

| Where | Fields |
|---|---|
| Pallet | `mdl_actual`, `bundles_per_case`, `full_cases_count`, `dcqc_partial_units`, `dcqc_total_units`, the seven checks, `dcqc_pallet_status` (`PENDING`, `IN_PROGRESS`, `COMPLETE`), `label_photo_count` |
| UPC | `expected_units`, `dcqc_received_units`, `dcqc_labels_complete`, `goods_photo_count`, `dcqc_evidence_revision`, `flag_id`, `dcqc_exception_status`, `dcqc_rework_reason` |
| Shipment | `dcqc_blocking_upc_count`, `dcqc_qc_ready`, `started_at`, `completed_at`, `confirmation_number`, `return_note`, `expected_units` |

## Screens and routes

| Screen | Path | Purpose |
|---|---|---|
| Shipments | `/qc` | List; fetches by itself on open; tick POs and Start QC |
| QC Check / shipment | `/qc/po/[id]` | The wizard while IN_PROGRESS; the summary and receipt buttons afterwards |
| Review and submit | `/qc/po/[id]/complete` | Totals and the Submit QC button |
| Exceptions | `/qc/exceptions` | Held UPCs, supervisor answers, latest messages |

The routes behind the screens are under `/api/mock/qc/`: `shipments` (list, `fetch`, `start`, `[id]`, `[id]/complete`, `[id]/receipt`), `upcs/[id]` (read, `pallets`, `pallets/[palletId]`, `photo`, `approve`, `flag`, `resolve`, `reopen`), `exceptions` and `notifications`.

## How it differs from the CitiTrends workflow files

| Difference | Why |
|---|---|
| One extra UPC step, `count_check` | So the count matcher connector runs after every pallet save |
| Forms attached to every state | So they show in the State Machine screen |
| Price fields are text, not float | To match the form field type |
| User fields are dropdowns | So people pick a real user instead of typing an id |
| Form numbers (FR-xx) differ | The State Machine hands them out in order |
| Six flag reasons | The 23 chargeback codes were not provided |
| Sample PO data | There is no real PO source connected yet |

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| A UPC stays in IN_PROGRESS after a count | The connector call failed. Check the State Machine's action history for the UPC. The app falls back after about 8 seconds |
| QC cannot be submitted though everything looks done | A UPC is still held or unfinished. The list shows the count; resolve the held UPC on Exceptions |
| A new user is missing from a dropdown | Run `node scripts/sm-dcqc.mjs` again |
| Fetch shows nothing | Check `SM_DCQC_*` in `.env` and that the backend is running on port 3001 |
| The camera does not open | The browser blocks it (needs HTTPS, or permission). Use Upload |

## Not built yet

A real PO source, separate associate and supervisor permissions, the 23 chargeback codes, assigning POs to associates, scanning a barcode with the camera to jump to a UPC, and photos on the shipment itself.
