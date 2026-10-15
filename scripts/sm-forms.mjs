// Creates the incident picklists, library fields and the Incident Resolver Form in the State Machine. Safe to run again.
process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const opts = (pairs) => pairs.map(([label, value]) => ({ label, value }));

const PICKLISTS = [
  { name: "Teams", options: opts(Array.from({ length: 10 }, (_, i) => [`Team ${i + 1}`, `T${i + 1}`])) },
  { name: "Ticket Timer Completion Method", options: opts([["Trailing scan", "trailing_scan"], ["Manual completion", "manual"]]) },
  { name: "Disposition", options: opts([["DISCARD_TRASH", "DISCARD_TRASH"], ["RETURN_TO_VENDOR", "RETURN_TO_VENDOR"], ["DONATE", "DONATE"]]) },
  { name: "Capture Profile", options: opts([["PHOTO_LANE", "PHOTO_LANE"], ["FAST_LANE", "FAST_LANE"]]) },
  { name: "decision_picklist", options: opts([["Resolved", "resolved"], ["Unable", "unable"], ["Duplicate-Merged", "duplicate-merged"]]) },
  { name: "reason_codes_picklist", options: opts([["NO_MATCH_FOUND", "no_match_found"], ["MANUAL_REVIEW", "manual_revie"], ["NOT_CITITRENDS_MERCHANDISE", "not_cititrends_merchandise"]]) },
  { name: "close_reason_picklist", options: opts([["Duplicate", "duplicate"], ["Not CitiTrends Merch", "not_cititrends_merch"], ["Cannot Resolve", "cannot_resolve"]]) },
];

const select = (pairs) => ({ enum_labels: pairs.map((p) => p[0]), enum_values: pairs.map((p) => p[1]) });
const DISPOSITION = select([["DISCARD_TRASH", "DISCARD_TRASH"], ["RETURN_TO_VENDOR", "RETURN_TO_VENDOR"], ["DONATE", "DONATE"]]);
const DECISION = select([["Resolved", "resolved"], ["Unable", "unable"], ["Duplicate-Merged", "duplicate-merged"]]);
const REASONS = select([["NO_MATCH_FOUND", "no_match_found"], ["MANUAL_REVIEW", "manual_revie"], ["NOT_CITITRENDS_MERCHANDISE", "not_cititrends_merchandise"]]);
const PROFILE = select([["PHOTO_LANE", "PHOTO_LANE"], ["FAST_LANE", "FAST_LANE"]]);

// [label, key, type, description, settings]. Everything the incident workflow stores, plus the store-side fields from the CitiTrends form.
const FIELDS = [
  ["Incident Number", "incident_number", "auto_number", "Ticket number handed out by the State Machine.", { affix_mode: "prefix", affix: "TK" }],
  ["Identifier", "identifier", "text", "Ticket number as displayed, for example TK-001012."],
  ["Store ID", "store_id", "text", "Store that raised the incident."],
  ["Store Name", "store_name", "text", "Name of the store."],
  ["Source", "source", "text", "App that created the incident."],
  ["Capture Profile", "capture_profile_id", "select", "Capture lane used for the incident.", PROFILE],
  ["Created At", "created_at", "datetime", "When the incident was created."],
  ["Submitted At", "submitted_at", "datetime", "When the store submitted it."],
  ["Source Updated At", "source_updated_at", "datetime", "When the source incident was last updated."],
  ["Created By User ID", "created_by_user_id", "text", "User that created the incident."],
  ["Closed At", "closed_at", "datetime", "When the incident was closed."],
  ["Ticketing App Incident ID", "bot_service_incident_id", "text", "Id of the incident in the ticketing app."],
  ["Missing Price Tag Count", "missing_price_tag_count", "integer", "Number of items with a missing price tag."],
  ["Item Age", "item_age", "text", "Store-reported item age: NEW_FREIGHT or OLD_MERCHANDISE."],
  ["Priority", "priority", "text", "Priority derived from the item age."],
  ["Photos", "photos", "textarea", "Photos of the item."],
  ["Photo URLs", "photo_urls", "textarea", "Links to the photos."],
  ["Store Capture", "store_capture", "textarea", "Details captured by the store app."],
  ["OCR Text", "ocr_text", "textarea", "Text read from the tag."],
  ["Brand", "brand", "text", "Brand of the item."],
  ["Department", "department", "text", "Department of the item."],
  ["Extracted Metadata", "extracted_metadata", "textarea", "Normalized item details read from the photos."],
  ["Gating Tier", "gating_tier", "text", "Match rating: GREEN, YELLOW or RED."],
  ["Candidate Count", "candidate_count", "integer", "Number of candidate products found."],
  ["Candidates", "edw_candidates", "textarea", "Candidate products with scores."],
  ["Selected Candidate", "selected_candidate", "text", "SKU the resolver or store chose."],
  ["Resolver ID", "resolver_id", "text", "Resolver working on the incident."],
  ["Resolver Name", "resolver_name", "text", "Name of the resolver."],
  ["Resolver Decision", "resolver_decision", "select", "Resolver's decision.", DECISION],
  ["Resolver Reason Code", "resolver_reason_codes", "select", "Why the resolver could not resolve it.", REASONS],
  ["Resolver Comment", "resolver_comment", "textarea", "Resolver's comment to the store."],
  ["Escalation Note", "escalation_note", "textarea", "Why it was escalated."],
  ["Resolver Lane", "resolver_lane_state", "text", "Resolver lane the incident is in."],
  ["Disposition", "disposition", "select", "Store disposition of the item.", DISPOSITION],
  ["New Tag Added", "new_tag_added", "boolean", "Whether a new price tag was added by the store."],
  ["Event Log", "event_log", "textarea", "Activity history."],
  ["Incident ID", "incident_id", "text", "Incident id."],
];

const FORM = { name: "Incident Resolver Form", description: "ResolverIQ incident fields", entity_types: ["incident"] };

// Smaller forms, one per stage of a ticket's life, so each workflow state shows only what it produced.
export const STATE_FORMS = [
  { name: "Incident: capture", description: "Who raised it, and the photos", keys: ["identifier", "incident_number", "store_id", "store_name", "created_by_user_id", "capture_profile_id", "created_at", "submitted_at", "missing_price_tag_count", "photos", "photo_urls", "ocr_text"] },
  { name: "Incident: item details", description: "What the photos show", keys: ["brand", "department", "extracted_metadata"] },
  { name: "Incident: matches", description: "Candidate products and how sure the match is", keys: ["gating_tier", "candidate_count", "edw_candidates"] },
  { name: "Incident: store follow-up", description: "What the store chose and did", keys: ["selected_candidate", "item_age", "priority", "disposition", "new_tag_added", "closed_at"] },
  { name: "Incident: resolver", description: "The resolver's work on the ticket", keys: ["resolver_id", "resolver_name", "resolver_lane_state", "selected_candidate", "resolver_decision", "resolver_reason_codes", "resolver_comment", "escalation_note"] },
];

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

const lists = rows(await call("GET", "/config/picklists", undefined, token));
for (const p of PICKLISTS) {
  if (lists.some((x) => x.name === p.name)) { console.log(`picklist exists   ${p.name}`); continue; }
  await call("POST", "/config/picklists", p, token);
  console.log(`picklist created  ${p.name}`);
}

const existing = rows(await call("GET", "/field-library/fields?limit=200", undefined, token));
const byKey = new Map(existing.map((f) => [f.field_key ?? f.identity?.field_key, f]));
const ids = [];
for (const [name, field_key, field_type, description, settings = {}] of FIELDS) {
  let field = byKey.get(field_key);
  const currentType = field?.field_type ?? field?.identity?.field_type;
  if (field && currentType !== field_type) {
    const id = field.library_field_id ?? field.identity?.library_field_id ?? field.id;
    await call("POST", `/field-library/fields/${id}/versions`, { field_type, description, settings }, token);
    console.log(`field retyped     ${field_key}: ${currentType} -> ${field_type}`);
  }
  if (!field) {
    field = await call("POST", "/field-library/fields", { name, field_key, field_type, description, settings }, token);
    console.log(`field created     ${field_key}`);
  }
  ids.push({ key: field_key, label: name, id: field.library_field_id ?? field.identity?.library_field_id ?? field.id });
}

const methods = rows(await call("GET", "/method-library/methods?limit=200", undefined, token));
const idOf = Object.fromEntries(ids.map((f) => [f.key, f]));
for (const form of [{ ...FORM, keys: ids.map((f) => f.key) }, ...STATE_FORMS]) {
  const found = methods.find((m) => m.name === form.name);
  const fields = form.keys.map((key, i) => ({ library_field_id: idOf[key].id, label: idOf[key].label, required: false, position: i + 1, follows_latest: true }));
  if (found) {
    const current = (await call("GET", `/method-library/methods/${found.method_id}`, undefined, token)).fields.map((f) => f.field_key);
    const currentFields = (await call("GET", `/method-library/methods/${found.method_id}`, undefined, token)).fields;
    if (current.length === form.keys.length && current.every((k, i) => k === form.keys[i]) && currentFields.every((f) => f.follows_latest)) {
      console.log(`form exists       ${form.name} (FR-${String(found.method_code).padStart(2, "0")})`);
    } else {
      await call("PUT", `/method-library/methods/${found.method_id}/fields`, { fields }, token);
      console.log(`form updated      ${form.name} now has ${fields.length} fields`);
    }
    continue;
  }
  await call("POST", "/method-library/methods", { name: form.name, description: form.description, entity_types: ["incident"], fields }, token);
  console.log(`form created      ${form.name} with ${fields.length} fields`);
}
