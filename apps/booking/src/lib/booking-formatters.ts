export const currency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`));

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const estimatedTables = (guests: number, peoplePerTable: number) =>
  Math.max(1, Math.ceil(guests / Math.max(1, peoplePerTable)));
