/** Unknown policy must never authorize historical inventory writes. */
export function resolveClosingStockPolicy(policy: unknown, readError: unknown, role: string | null) {
  const mode = !readError && policy && typeof policy === "object" && "mode" in policy && policy.mode === "integrated" ? "integrated" : "manual";
  return { mode, needsOpname: mode === "integrated" && (role === "bar" || role === "kitchen") };
}
