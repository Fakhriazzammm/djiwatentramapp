export function financeCsvCell(value: string | number): string {
  const text =
    typeof value === "string"
      ? value.replace(/^[=+@\-]/, "'$&")
      : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}
