import assert from "node:assert/strict";
import { calculateOpeningBalances } from "../src/lib/opening-balance";

const types = [
  { id: "monthly", name: "Quỹ tháng" },
  { id: "penalty", name: "Huân Chương" },
];

const charges = [
  { memberId: "member-a", chargeTypeId: "monthly", chargeDate: "2026-07-01", totalAmount: 100_000, reportNextMonthSnapshot: false },
  { memberId: "member-a", chargeTypeId: "monthly", chargeDate: "2026-08-01", totalAmount: 200_000, reportNextMonthSnapshot: false },
  { memberId: "member-a", chargeTypeId: "penalty", chargeDate: "2026-08-20", totalAmount: 45_000, reportNextMonthSnapshot: true },
  { memberId: "member-b", chargeTypeId: "monthly", chargeDate: "2026-08-01", totalAmount: 200_000, reportNextMonthSnapshot: false },
];

const payments = [
  { memberId: "member-a", amount: 150_000 },
  { memberId: "member-b", amount: 200_000 },
];

const september = calculateOpeningBalances("2026-09", charges, payments, types);
assert.equal(september.get("member-a")?.amount, -150_000);
assert.deepEqual(september.get("member-a")?.periods.map(({ month, amount }) => ({ month, amount })), [
  { month: "2026-08", amount: 150_000 },
]);
assert.equal(september.get("member-a")?.periods[0].types[0].name, "Quỹ tháng");
assert.equal(september.has("member-b"), false);

const august = calculateOpeningBalances("2026-08", charges, [{ memberId: "member-a", amount: 50_000 }], types);
assert.equal(august.get("member-a")?.amount, -50_000);
assert.deepEqual(august.get("member-a")?.periods.map(({ month }) => month), ["2026-07"]);

const october = calculateOpeningBalances("2026-10", charges, payments, types);
assert.equal(october.get("member-a")?.amount, -195_000);
assert.deepEqual(october.get("member-a")?.periods.map(({ month, amount }) => ({ month, amount })), [
  { month: "2026-08", amount: 150_000 },
  { month: "2026-09", amount: 45_000 },
]);

const credits = calculateOpeningBalances("2026-09", charges, [
  { memberId: "member-b", amount: 250_000 },
  { memberId: "member-c", amount: 30_000 },
], types);
assert.equal(credits.get("member-b")?.amount, 50_000);
assert.deepEqual(credits.get("member-b")?.periods, []);
assert.equal(credits.get("member-c")?.amount, 30_000);
assert.equal(credits.get("member-a")?.amount, -300_000);

const opening = september.get("member-a")?.amount ?? 0;
const periodCharged = 200_000;
const periodPaid = 250_000;
assert.equal(opening + periodPaid - periodCharged, -100_000);
assert.equal(50_000 + 200_000 - 250_000, 0);

console.log("Opening balance: 5 tình huống đã đạt.");
