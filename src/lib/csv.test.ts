import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("CSV export", () => {
  it("quotes and neutralises formulas", () => {
    expect(toCsv([["Name", "Amount"], ['Ama "AJ" Mensah', 12.5], ["=HYPERLINK()", null]])).toBe(
      'Name,Amount\r\n"Ama ""AJ"" Mensah",12.5\r\n\'=HYPERLINK(),',
    );
  });
});
