export function normalizeNumberInputValue(value: string) {
  if (value === "") return "";
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

/**
 * Keeps numeric inputs editable on mobile: typing the first digit replaces
 * the initial zero instead of producing values such as "01".
 */
export function installNumberInputBehavior() {
  if (typeof document === "undefined") return () => {};

  const selectZero = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
    if (target.value === "0") target.select();
  };

  const normalize = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
    const next = normalizeNumberInputValue(target.value);
    if (next !== target.value) {
      target.value = next;
    }
  };

  document.addEventListener("focusin", selectZero, true);
  document.addEventListener("input", normalize, true);

  return () => {
    document.removeEventListener("focusin", selectZero, true);
    document.removeEventListener("input", normalize, true);
  };
}

export function selectZeroNumberInput(target: HTMLInputElement) {
  if (target.type === "number" && target.value === "0") target.select();
}

export function normalizeNumberInput(value: string) {
  return normalizeNumberInputValue(value);
}
