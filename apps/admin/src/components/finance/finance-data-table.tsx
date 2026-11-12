import { financeCsvCell } from "@/lib/finance-csv";
import { useMemo, useState, type ReactNode } from "react";
export type FinanceColumn<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
};
export function FinanceDataTable<T>({
  rows,
  columns,
  rowKey,
  onSelect,
  label,
}: {
  rows: readonly T[];
  columns: FinanceColumn<T>[];
  rowKey: (row: T) => string;
  onSelect?: (row: T) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const filtered = useMemo(() => {
    const result = rows.filter((r) =>
      columns.some((c) =>
        String(c.value(r))
          .toLocaleLowerCase("id")
          .includes(query.toLocaleLowerCase("id")),
      ),
    );
    if (sort) {
      const c = columns.find((c) => c.key === sort.key);
      if (c)
        result.sort((a, b) => {
          const l = c.value(a),
            r = c.value(b);
          return (
            (typeof l === "number" && typeof r === "number"
              ? l - r
              : String(l).localeCompare(String(r), "id", { numeric: true })) *
            (sort.desc ? -1 : 1)
          );
        });
    }
    return result;
  }, [rows, columns, query, sort]);
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  const visible = columns.filter((c) => !hidden.includes(c.key));
  function exportCSV() {
    const csv = [
      columns.map((c) => c.label),
      ...filtered.map((r) => columns.map((c) => c.value(r))),
    ]
      .map((r) => r.map(financeCsvCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = label + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section aria-label={label}>
      <div className="finance-table-tools">
        <input
          aria-label={`Cari ${label}`}
          placeholder={`Cari ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <details>
          <summary>Kolom</summary>
          <div className="finance-column-menu">
            {columns.map((c) => (
              <label key={c.key}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.key)}
                  disabled={visible.length === 1 && !hidden.includes(c.key)}
                  onChange={() =>
                    setHidden((h) =>
                      h.includes(c.key)
                        ? h.filter((k) => k !== c.key)
                        : [...h, c.key],
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </details>
        <button type="button" onClick={exportCSV}>
          Ekspor CSV
        </button>
      </div>
      <div className="finance-table-scroll">
        <table>
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.desc
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) => ({
                        key: c.key,
                        desc: s?.key === c.key ? !s.desc : false,
                      }))
                    }
                  >
                    {c.label} ↕
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(safePage * 25, safePage * 25 + 25).map((r) => (
              <tr key={rowKey(r)}>
                {visible.map((c, i) => (
                  <td key={c.key}>
                    {i === 0 && onSelect && !c.render ? (
                      <button
                        type="button"
                        className="text-left underline underline-offset-4"
                        onClick={() => onSelect(r)}
                      >
                        {c.value(r)}
                      </button>
                    ) : c.render ? (
                      c.render(r)
                    ) : (
                      c.value(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={visible.length}>Tidak ada data yang sesuai.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="finance-table-footer">
        <span>
          {filtered.length} baris · halaman {safePage + 1}
        </span>
        <div>
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← Sebelumnya
          </button>{" "}
          <button
            type="button"
            disabled={(safePage + 1) * 25 >= filtered.length}
            onClick={() => setPage(safePage + 1)}
          >
            Berikutnya →
          </button>
        </div>
      </div>
    </section>
  );
}
