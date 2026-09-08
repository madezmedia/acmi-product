import assert from "node:assert/strict";
import { isLabEntryPurchase, LAB_PRODUCT_ID, LAB_ENTRY_PLAN_ID } from "./lab-buyer-secrets.mjs";

assert.equal(isLabEntryPurchase({}, "lab"), true);
assert.equal(isLabEntryPurchase({ product_id: LAB_PRODUCT_ID }, "unknown"), true);
assert.equal(isLabEntryPurchase({ data: { plan_id: LAB_ENTRY_PLAN_ID } }, "unknown"), true);
assert.equal(isLabEntryPurchase({ product_id: "prod_other" }, "starter-kit"), false);
console.log("lab-buyer-secrets.isLabEntryPurchase ok");
