import { PORTO } from "./sheet";

/** A tiny in-memory Sheets: tabs, cell writes (as typed) and ranges, enough to check what the app sends and reads. */
export function fakeSheets(prices: Record<string, [number | string, number | string]> = {}) {
  const tabs = new Map<string, number>(), cells = new Map<string, unknown>(), calls: string[] = [];
  let next = 2000, fails = 0;
  const cellKey = (tab: string, a1: string) => `${tab}!${a1}`;
  const put = (range: string, values: unknown[][]) => {
    const m = range.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)/)!; const col0 = m[2].charCodeAt(0) - 65, row0 = Number(m[3]);
    values.forEach((r, i) => r.forEach((v, j) => cells.set(cellKey(m[1], `${String.fromCharCode(65 + col0 + j)}${row0 + i}`), v)));
  };
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), method = (init.method ?? "GET").toUpperCase(), path = decodeURIComponent(u.pathname); calls.push(`${method} ${path}`);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (fails > 0) { fails--; return new Response("{}", { status: 404 }); }
    if (method === "GET" && /\/v4\/spreadsheets\/[^/]+$/.test(path)) return new Response(JSON.stringify({ sheets: [...tabs].map(([title, sheetId]) => ({ properties: { title, sheetId } })) }));
    if (path.endsWith("/values:batchUpdate")) { for (const d of body.data) put(d.range, d.values); return new Response("{}"); }
    if (path.endsWith(":batchUpdate")) {
      const replies = (body.requests as any[]).map((r) => { if (r.addSheet) { const id = next++; tabs.set(r.addSheet.properties.title, id); return { addSheet: { properties: { sheetId: id } } }; } return {}; });
      return new Response(JSON.stringify({ replies }));
    }
    if (path.endsWith("/values:batchClear")) { for (const r of body.ranges as string[]) { const tab = r.replace(/'/g, "").split("!")[0]; for (const k of [...cells.keys()]) if (k.startsWith(tab + "!") && !/!([A-Z])1$/.test(k)) cells.delete(k); } return new Response("{}"); }
    if (method === "GET" && path.includes("/values/")) {
      const tickers = [...cells].filter(([k]) => k.startsWith(`${PORTO}!A`) && /!A\d+$/.test(k)).map(([k, v]) => [Number(k.split("A")[1]), String(v)] as const).filter(([, v]) => v && v !== "Total").sort((a, b) => a[0] - b[0]);
      return new Response(JSON.stringify({ values: tickers.map(([, t]) => { const p = prices[t]; return [t, "", "", p ? p[0] : "#N/A", "", "", p ? p[1] : ""]; }) }));
    }
    return new Response("{}", { status: 400 });
  }) as unknown as typeof fetch;
  return { f, tabs, cells, calls, prices, failNext: (n = 1) => { fails = n; } };
}
