import { guessCategory } from "./categories";
import type { PayeeKind } from "./payees";

export type Sug = { categoryId: string; why: "jenis" | "kata" | "ai"; confidence: number };
export const SURE = 0.85;
const MONEY_APP = /^(flip|gopay|ovo|dana|shopeepay|linkaja|isaku|doku|paypal|wise|jenius|jago|seabank|blu)\b/i;
/** Names that carry no information: an empty note, or a QRIS terminal number without the shop's name. */
export const unnamed = (label: string) => /tanpa nama/i.test(label);

/** What the kind of payee and the words in its name already say, with no model: money to a person or through a money app is a Transfer, a service is a bill, a known word wins.
 *  `has(id, income)` tells whether the person's category list holds that category. */
export function ruleSuggestion(label: string, direction: "in" | "out", kind: PayeeKind, has: (id: string, income: boolean) => boolean): Sug | null {
  if (unnamed(label)) return null;
  const income = direction === "in";
  if (!income && MONEY_APP.test(label) && has("transfer", false)) return { categoryId: "transfer", why: "jenis", confidence: SURE };
  if (kind === "orang") { if (!income && has("transfer", false)) return { categoryId: "transfer", why: "jenis", confidence: 0.9 }; if (income && has("bonus", true)) return { categoryId: "bonus", why: "jenis", confidence: 0.7 }; }
  const word = guessCategory(label);
  if (word && has(word, income)) return { categoryId: word, why: "kata", confidence: SURE };
  if (kind === "layanan" && !income && has("tagihan", false)) return { categoryId: "tagihan", why: "jenis", confidence: SURE };
  return null;
}
