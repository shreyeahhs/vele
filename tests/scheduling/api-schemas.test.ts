import { describe, expect, it } from "vitest";
import { hhmm, isoInstant } from "@/lib/api-schemas";

describe("request schemas", () => {
  it("accepts ISO instants between 1970 and 2199 only", () => {
    expect(isoInstant.safeParse("2026-11-19T14:00:00.000Z").success).toBe(true);
    expect(isoInstant.safeParse("2026-11-19T14:00:00+01:00").success).toBe(true);
    expect(isoInstant.safeParse("9999-01-01T00:00:00Z").success).toBe(false);
    expect(isoInstant.safeParse("1969-12-31T23:59:59Z").success).toBe(false);
    expect(isoInstant.safeParse("2026-11-19").success).toBe(false);
  });

  it("accepts real 24-hour wall-clock times", () => {
    for (const ok of ["00:00", "09:30", "23:59", "24:00"]) expect(hhmm.safeParse(ok).success).toBe(true);
    for (const bad of ["25:00", "24:30", "9:30", "12:60", "99:99", ""]) expect(hhmm.safeParse(bad).success).toBe(false);
  });
});
