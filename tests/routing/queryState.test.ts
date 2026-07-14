import { describe, expect, it } from "vitest";
import {
  decodeChoiceQuery,
  encodeChoiceQuery,
  queryEnum,
  queryInteger,
  queryText,
  isSnapshotQuery,
  queriesEqual,
  queryValue,
  queryValues,
  snapshotQuery,
} from "@/routing/queryState";

describe("shared-route query state", () => {
  it("recognizes only the explicit state=1 snapshot marker", () => {
    expect(isSnapshotQuery({ state: "1" })).toBe(true);
    expect(isSnapshotQuery({ state: ["1", "0"] })).toBe(true);
    expect(isSnapshotQuery({ state: "0" })).toBe(false);
    expect(isSnapshotQuery({ state: [null, "1"] })).toBe(false);
    expect(isSnapshotQuery({})).toBe(false);
  });

  it("reads scalar and repeated query values without accepting other types", () => {
    expect(queryValue("first")).toBe("first");
    expect(queryValue(["first", "second"])).toBe("first");
    expect(queryValue([null, "second"])).toBeUndefined();
    expect(queryValue(4)).toBeUndefined();

    expect(queryValues("only")).toEqual(["only"]);
    expect(queryValues(["one", null, "one", 2, "two"])).toEqual(["one", "one", "two"]);
    expect(queryValues(undefined)).toEqual([]);
  });

  it("truncates text and validates enum values", () => {
    const allowed = new Set(["dex", "attack"] as const);

    expect(queryText("abcdefgh", 4)).toBe("abcd");
    expect(queryText(["first", "second"], 3)).toBe("fir");
    expect(queryText(undefined)).toBeUndefined();
    expect(queryEnum("attack", allowed)).toBe("attack");
    expect(queryEnum("defense", allowed)).toBeUndefined();
    expect(queryEnum(["dex", "attack"], allowed)).toBe("dex");
  });

  it("accepts safe integers and clamps them to the page boundary", () => {
    expect(queryInteger("4", 1, 8)).toBe(4);
    expect(queryInteger("0", 1, 8)).toBe(1);
    expect(queryInteger("99", 1, 8)).toBe(8);
    expect(queryInteger("4.5", 1, 8)).toBeUndefined();
    expect(queryInteger(" ", 1, 8)).toBeUndefined();
    expect(queryInteger("9007199254740992", 1, 8)).toBeUndefined();
  });

  it("canonicalizes repeated recipe choices and lets the last duplicate win", () => {
    expect(decodeChoiceQuery([
      "Milk:Ranch-1", "broken", ":missing-item", "Flour:Mill-1", "Milk:Ranch-2",
    ])).toEqual({ Flour: "Mill-1", Milk: "Ranch-2" });
    expect(Object.keys(decodeChoiceQuery(["Zulu:R3", "Alpha:R1"]))).toEqual(["Alpha", "Zulu"]);
    expect(decodeChoiceQuery("LongItem:LongRecipe", 4)).toEqual({ Long: "Long" });
    expect(encodeChoiceQuery({ Zulu: "R3", Empty: "", Alpha: "R1" }))
      .toEqual(["Alpha:R1", "Zulu:R3"]);
  });

  it("adds the snapshot marker and omits only default-like empty fields", () => {
    const query = snapshotQuery({
      q: "",
      category: undefined,
      sort: null,
      choice: [],
      target: "Cake",
      qty: "2",
    });

    expect(query).toEqual({ state: "1", target: "Cake", qty: "2" });
    expect(Object.keys(query)).toEqual(["state", "target", "qty"]);
  });

  it("preserves the caller's canonical field order and repeated choice values", () => {
    const query = snapshotQuery({
      target: "Cake",
      qty: "2",
      choice: ["Flour:Mill", "Milk:Ranch", "Flour:Mill"],
    });

    expect(Object.keys(query)).toEqual(["state", "target", "qty", "choice"]);
    expect(query.choice).toEqual(["Flour:Mill", "Milk:Ranch", "Flour:Mill"]);
  });

  it("distinguishes non-canonical key order, repeated-value order, and duplicate count", () => {
    const canonical = {
      state: "1",
      target: "Cake",
      choice: ["Flour:Mill", "Milk:Ranch"],
    };

    expect(queriesEqual(canonical, { ...canonical })).toBe(true);
    expect(queriesEqual(canonical, {
      target: "Cake",
      state: "1",
      choice: ["Flour:Mill", "Milk:Ranch"],
    })).toBe(false);
    expect(queriesEqual(canonical, {
      state: "1",
      target: "Cake",
      choice: ["Milk:Ranch", "Flour:Mill"],
    })).toBe(false);
    expect(queriesEqual(canonical, {
      state: "1",
      target: "Cake",
      choice: ["Flour:Mill", "Milk:Ranch", "Milk:Ranch"],
    })).toBe(false);
  });
});
