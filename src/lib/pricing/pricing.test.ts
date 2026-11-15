import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_BPS,
  DEFAULT_PRICE_CAP_BPS,
  computeFees,
  isPriceAllowed,
} from "./pricing";

describe("computeFees", () => {
  it("computes a 10% fee", () => {
    expect(computeFees(5000, 1000)).toEqual({ feeCents: 500, sellerNetCents: 4500 });
  });

  it("rounds the fee up and keeps the sum equal to the price", () => {
    const r = computeFees(999, 1000);
    expect(r.feeCents).toBe(100);
    expect(r.feeCents + r.sellerNetCents).toBe(999);
  });

  it("handles zero price and zero/full fee", () => {
    expect(computeFees(0, 1000)).toEqual({ feeCents: 0, sellerNetCents: 0 });
    expect(computeFees(1000, 0)).toEqual({ feeCents: 0, sellerNetCents: 1000 });
    expect(computeFees(1000, 10000)).toEqual({ feeCents: 1000, sellerNetCents: 0 });
  });

  it("throws RangeError on invalid input", () => {
    expect(() => computeFees(10.5, 1000)).toThrow(RangeError);
    expect(() => computeFees(-1, 1000)).toThrow(RangeError);
    expect(() => computeFees(1000, -1)).toThrow(RangeError);
    expect(() => computeFees(1000, 10001)).toThrow(RangeError);
    expect(() => computeFees(1000, 1.5)).toThrow(RangeError);
    expect(() => computeFees(NaN, 1000)).toThrow(RangeError);
  });
});

describe("isPriceAllowed", () => {
  it("allows up to the cap and rejects above", () => {
    expect(isPriceAllowed(7500, 5000, 15000)).toBe(true);
    expect(isPriceAllowed(7501, 5000, 15000)).toBe(false);
  });

  it("rejects non-positive and non-integer asks", () => {
    expect(isPriceAllowed(0, 5000, 15000)).toBe(false);
    expect(isPriceAllowed(-100, 5000, 15000)).toBe(false);
    expect(isPriceAllowed(100.5, 5000, 15000)).toBe(false);
  });
});

describe("defaults", () => {
  it("exports defaults", () => {
    expect(DEFAULT_FEE_BPS).toBe(1000);
    expect(DEFAULT_PRICE_CAP_BPS).toBe(15000);
  });
});
