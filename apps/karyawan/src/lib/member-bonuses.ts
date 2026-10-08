import { z } from "zod";

export type MemberBonus = {
  name: string;
  roleName: string;
  bonus: number;
  shiftName?: string;
};

const memberBonusSchema = z.object({
  name: z.string().nullish().transform((value) => value ?? "—"),
  roleName: z.string().nullish().transform((value) => value ?? "—"),
  bonus: z.number().finite().nullish().transform((value) => value ?? 0),
  shiftName: z.string().optional(),
});

/** Legacy reports can contain JSON text; malformed payloads are ignored. */
export function parseMemberBonusRows(raw: unknown): MemberBonus[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) => {
    const result = memberBonusSchema.safeParse(row);
    return result.success ? [result.data] : [];
  });
}
