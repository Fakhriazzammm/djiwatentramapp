/** Indonesian mobile prefixes → brand name as returned by the catalog's operatorName(). */
const PREFIXES: [RegExp, string][] = [
  [/^08(11|12|13|21|22|23|51|52|53)/, "Telkomsel"],
  [/^08(14|15|16|55|56|57|58)/, "Indosat"],
  [/^08(17|18|19|59|77|78)/, "XL"],
  [/^08(31|32|33|38)/, "AXIS"],
  [/^08(95|96|97|98|99)/, "Tri"],
  [/^08(81|82|83|84|85|86|87|88|89)/, "Smartfren"],
];
export function normalizeMsisdn(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("62")) return "0" + digits.slice(2);
  return digits;
}
/** Returns the brand for a (possibly partial) phone number, or null when unknown / too short. */
export function detectOperator(value: string): string | null {
  const number = normalizeMsisdn(value);
  if (number.length < 4) return null;
  return PREFIXES.find(([pattern]) => pattern.test(number))?.[1] ?? null;
}
