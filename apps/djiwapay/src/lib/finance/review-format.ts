/** Bank descriptions are written for machines: "TOKO LISTRIK BAROKAH · PAN 9360091800232207169". Show what a person would say. */
export const tidyTitle = (raw: string) => {
  let t = raw.replace(/\s*[·|]\s*(PAN|NMID|MID|TID|REF|NO)\b.*$/i, "").replace(/\b\d{9,}\b/g, "").replace(/\s{2,}/g, " ").replace(/[·|\-\s]+$/, "").trim();
  if (t && t === t.toUpperCase() && /[A-Z]{3}/.test(t)) t = t.toLowerCase().replace(/(^|[\s.\-/&])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  return t || raw;
};
