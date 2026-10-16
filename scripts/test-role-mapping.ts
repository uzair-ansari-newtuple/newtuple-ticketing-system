import assert from "node:assert/strict";
import { ticketingRoleFromNames } from "../src/lib/sm/identity";

assert.equal(ticketingRoleFromNames(["superadmin"]), "superadmin");
assert.equal(ticketingRoleFromNames(["Super Administrator"]), "superadmin");
assert.equal(ticketingRoleFromNames(["Platform Super Admin"]), "superadmin");
assert.equal(ticketingRoleFromNames(["store_associate"]), "store");
assert.equal(ticketingRoleFromNames(["resolver"]), "resolver");
assert.equal(ticketingRoleFromNames(["custom_role"]), null);
assert.equal(ticketingRoleFromNames(["store_associate", "superadmin"]), "superadmin");

console.log("Ticketing role mapping passed.");
