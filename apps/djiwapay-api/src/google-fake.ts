// Test support: a small in-memory Google (Sheets + Drive) that really stores what is written, so two-way sync can be tested end to end.
import { SHEET } from "./sheets/template";

type DriveFile = { id: string; name: string; mime: string; trashed: boolean; parents: string[]; appProperties: Record<string, string>; modified: number; bytes?: number };
export class FakeGoogle {
  files = new Map<string, DriveFile>();
  catatan: unknown[][] = [];            // data rows; sheet row n is catatan[n-2]
  gridRows = 0; styled = false; calls: string[] = [];
  private clock = 1;
  private n = 0;
  private touch = (id: string) => { const f = this.files.get(id); if (f) f.modified = ++this.clock; };
  sheetId = "";
  private json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });

  /** Edit the sheet the way a person would. */
  userEditCell(row: number, col: number, value: unknown) { (this.catatan[row - 2] ??= [])[col] = value; this.touch(this.sheetId); }
  userDeleteRow(row: number) { this.catatan.splice(row - 2, 1); this.touch(this.sheetId); }
  userAppendRow(cells: unknown[]) { this.catatan.push(cells); this.touch(this.sheetId); }
  userClearSheet() { this.catatan = []; this.touch(this.sheetId); }
  fileNamed(re: RegExp) { return [...this.files.values()].find((f) => re.test(f.name) && !f.trashed); }

  fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(String(input)), path = url.pathname, method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : init.body instanceof Buffer ? init.body.toString("latin1") : init.body instanceof URLSearchParams ? init.body.toString() : "";
    this.calls.push(`${method} ${path}`);
    if (url.host === "oauth2.googleapis.com") return this.json({ access_token: "at", expires_in: 3600 });
    /* ---- Sheets ---- */
    if (url.host === "sheets.googleapis.com") {
      if (path === "/v4/spreadsheets" && method === "POST") {
        const b = JSON.parse(body); const id = `sheet-${++this.n}`;
        this.sheetId = id; this.catatan = []; this.gridRows = b.sheets.find((s: any) => s.properties.sheetId === SHEET.catatan).properties.gridProperties.rowCount;
        this.files.set(id, { id, name: b.properties.title, mime: "application/vnd.google-apps.spreadsheet", trashed: false, parents: [], appProperties: {}, modified: ++this.clock });
        return this.json({ spreadsheetId: id, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}` });
      }
      const id = path.split("/")[3].split(":")[0];
      if (!this.files.get(id) || this.files.get(id)!.trashed && false) return this.json({}, 404);
      if (path.endsWith(":batchUpdate") && !path.includes("/values")) {
        for (const r of JSON.parse(body).requests) {
          if (r.deleteDimension) { const { startIndex, endIndex } = r.deleteDimension.range; this.catatan.splice(startIndex - 1, endIndex - startIndex); }
          if (r.appendDimension) this.gridRows += r.appendDimension.length;
          if (r.addChart || r.addBanding || r.setBasicFilter) this.styled = true;
        }
        this.touch(id); return this.json({});
      }
      if (path.endsWith("/values:batchUpdate")) {
        for (const d of JSON.parse(body).data) {
          const m = String(d.range).match(/^Catatan!([A-Z])(\d+)(?::([A-Z])(\d+))?$/);
          if (!m) continue;
          const col0 = m[1].charCodeAt(0) - 65, row0 = Number(m[2]);
          if (row0 - 2 + d.values.length > this.gridRows) return this.json({ error: "Range exceeds grid limits" }, 400);
          d.values.forEach((vals: unknown[], i: number) => vals.forEach((v, j) => { ((this.catatan[row0 - 2 + i] ??= [])[col0 + j]) = v; }));
        }
        this.touch(id); return this.json({});
      }
      if (path.endsWith("/values:batchClear")) { this.touch(id); return this.json({}); }
      if (path.includes("/values/")) { return this.json({ values: this.catatan.map((r) => r ?? []) }); }
    }
    /* ---- Drive ---- */
    if (url.host === "www.googleapis.com" && path.startsWith("/upload/drive/v3/files")) {
      const meta = JSON.parse(body.match(/Content-Type: application\/json[^\r]*\r\n\r\n([\s\S]*?)\r\n--/)![1]);
      const id = `file-${++this.n}`; this.files.set(id, { id, name: meta.name, mime: "image/jpeg", trashed: false, parents: meta.parents ?? [], appProperties: meta.appProperties ?? {}, modified: ++this.clock });
      return this.json({ id, name: meta.name });
    }
    if (url.host === "www.googleapis.com" && path === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const folders = q.includes("mimeType='application/vnd.google-apps.folder'") && !q.includes("mimeType!=");
      const nameM = q.match(/name='([^']+)'/);
      const out = [...this.files.values()].filter((f) => !f.trashed && (folders ? f.mime.endsWith("folder") && (!nameM || f.name === nameM[1]) : !f.mime.endsWith("folder") && f.appProperties.djiwapay === "1"));
      return this.json({ files: out.map((f) => ({ id: f.id, name: f.name })) });
    }
    if (url.host === "www.googleapis.com" && path === "/drive/v3/files" && method === "POST") {
      const b = JSON.parse(body); const id = `folder-${++this.n}`;
      this.files.set(id, { id, name: b.name, mime: b.mimeType, trashed: false, parents: b.parents ?? [], appProperties: b.appProperties ?? {}, modified: ++this.clock });
      return this.json({ id });
    }
    const fm = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (url.host === "www.googleapis.com" && fm) {
      const f = this.files.get(fm[1]);
      if (!f) return this.json({}, 404);
      if (method === "PATCH") { const b = JSON.parse(body); if (b.name) f.name = b.name; if (b.trashed !== undefined) f.trashed = b.trashed; f.modified = ++this.clock; return this.json({ id: f.id }); }
      return this.json({ id: f.id, name: f.name, trashed: f.trashed, modifiedTime: new Date(f.modified * 1000).toISOString() });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}
