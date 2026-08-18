import { describe, it, expect } from "vitest";
import { isTotalLine } from "./route";

// A subtotal reported as a fee is added on top of the items it summarises, so
// everyone at the table pays roughly twice. The filter has to be wide enough to
// catch the restatement and narrow enough to leave real charges alone — both
// halves cost real money when wrong.
describe("isTotalLine", () => {
  it.each([
    "Subtotal", "SubTotal", "sub total", "Sub-Total", "  TOTAL  ", "Grand Total",
    "Total:", "Net Amount", "Amount Payable", "Bill Total",
  ])("drops the restatement %j", (name) => {
    expect(isTotalLine(name)).toBe(true);
  });

  it.each([
    "Total GST", "Service Charge", "Tax", "CGST", "Delivery fee",
    "Packaging charges", "Total GST 5%", "Rounding off",
  ])("keeps the real charge %j", (name) => {
    expect(isTotalLine(name)).toBe(false);
  });
});
