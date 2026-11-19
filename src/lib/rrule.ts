import * as rruleModule from "rrule";

/**
 * rrule's "main" entry is a UMD bundle. Bundlers (Next, Vitest) pick its ESM
 * build, but plain Node scripts (the seed) load the UMD one, whose exports sit
 * on `default`. Reading through Reflect keeps bundlers from flagging the
 * missing ESM default.
 */
const lib = (Reflect.get(rruleModule, "default") ?? rruleModule) as typeof rruleModule;

export const RRule = lib.RRule;
export type RRule = InstanceType<typeof lib.RRule>;
export type { Options as RRuleOptions } from "rrule";
