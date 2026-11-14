import { describe, expect, it } from "vitest";
import { allocatePayments, families, termInvoiceLines } from "./billing";
import { formatGhs, parseGhs } from "./money";

describe("money", () => {
  it("formats and parses cedis", () => {
    expect(formatGhs(120050)).toBe("GHS 1,200.50");
    expect(formatGhs(-500)).toBe("−GHS 5.00");
    expect(parseGhs("1,200.5")).toBe(120050);
    expect(parseGhs("GHS 300")).toBe(30000);
    expect(parseGhs("0")).toBeNull();
    expect(parseGhs("12.345")).toBeNull();
    expect(parseGhs("abc")).toBeNull();
  });
});

describe("families", () => {
  it("links siblings through shared parents, even indirectly", () => {
    const groups = families([
      { id: "a", parentIds: ["mum"] },
      { id: "b", parentIds: ["mum", "dad"] },
      { id: "c", parentIds: ["dad"] },
      { id: "d", parentIds: [] },
    ]);
    expect(groups.map((g) => g.sort()).sort()).toEqual([["a", "b", "c"], ["d"]]);
  });
});

describe("termly invoices", () => {
  const plan = { name: "Full day", amount_pesewas: 150000 };
  it("charges the eldest in full and discounts younger siblings", () => {
    const lines = termInvoiceLines(
      [
        { id: "young", first_name: "Kofi", date_of_birth: "2023-01-01", plan, parentIds: ["p"] },
        { id: "old", first_name: "Ama", date_of_birth: "2021-01-01", plan, parentIds: ["p"] },
        { id: "solo", first_name: "Esi", date_of_birth: "2022-01-01", plan, parentIds: ["q"] },
        { id: "noplan", first_name: "Yaw", date_of_birth: "2022-01-01", plan: null, parentIds: ["p"] },
      ],
      "Term 1 2027",
      10,
    );
    expect(lines.get("old")).toEqual([{ description: "Full day, Term 1 2027", quantity: 1, unit_pesewas: 150000 }]);
    expect(lines.get("young")).toEqual([
      { description: "Full day, Term 1 2027", quantity: 1, unit_pesewas: 150000 },
      { description: "Sibling discount (10%)", quantity: 1, unit_pesewas: -15000 },
    ]);
    expect(lines.get("solo")).toHaveLength(1);
    expect(lines.has("noplan")).toBe(false);
  });
});

describe("payment allocation", () => {
  it("pays feeding first, then invoices oldest first", () => {
    const result = allocatePayments(
      [
        { id: "new", issued_on: "2027-01-05", number: 2, total: 100000 },
        { id: "old", issued_on: "2026-09-05", number: 1, total: 50000 },
      ],
      90000,
      10000,
    );
    expect(result.get("old")).toEqual({ paid: 50000, outstanding: 0 });
    expect(result.get("new")).toEqual({ paid: 30000, outstanding: 70000 });
  });
});
