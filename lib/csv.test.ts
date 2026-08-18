import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("exports a plain row", () => {
    expect(toCsv([["Alice", "Pizza", "1", "100.00"]])).toBe("Alice,Pizza,1,100.00");
  });

  it("wraps a field containing a comma", () => {
    expect(toCsv([["Alice", "Pizza, large"]])).toBe('Alice,"Pizza, large"');
  });

  it("doubles an embedded double quote", () => {
    expect(toCsv([['He said "hi"', "item"]])).toBe('"He said ""hi""",item');
  });

  it("wraps a field containing a newline", () => {
    expect(toCsv([["line1\nline2", "item"]])).toBe('"line1\nline2",item');
  });

  it("preserves an empty field", () => {
    expect(toCsv([["Alice", "", "1", "100.00"]])).toBe("Alice,,1,100.00");
  });

  it("joins multiple rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });
});

describe("toCsv formula injection", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    // A tab needs no CSV quoting, so it is only neutralised. A CR needs both.
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "\"'\rcmd\""],
  ])("neutralises a field starting with %j", (payload, expected) => {
    expect(toCsv([[payload]])).toBe(expected);
  });

  it("neutralises a name that would open a spreadsheet formula", () => {
    expect(toCsv([["=HYPERLINK(\"http://evil\",\"click\")"]])).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    );
  });

  it("leaves a negative amount alone — the balance column needs it", () => {
    expect(toCsv([["Alice", "Balance", "", "-12.50"]])).toBe("Alice,Balance,,-12.50");
  });

  it("leaves a positive amount alone", () => {
    expect(toCsv([["100.00"]])).toBe("100.00");
  });

  it("still neutralises something that only looks numeric", () => {
    expect(toCsv([["-1+1@cmd"]])).toBe("'-1+1@cmd");
  });
});
