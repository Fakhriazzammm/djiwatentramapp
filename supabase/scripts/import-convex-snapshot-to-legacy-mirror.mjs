import fs from "node:fs/promises";
import path from "node:path";

function esc(value) {
  return String(value).replace(/'/g, "''");
}

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { value: JSON.parse(line), index: index + 1 };
      } catch (error) {
        throw new Error(`Invalid JSON at ${filePath}:${index + 1} - ${error}`);
      }
    });
}

async function main() {
  const snapshotDirArg = process.argv[2];
  if (!snapshotDirArg) {
    throw new Error("Usage: node import-convex-snapshot-to-legacy-mirror.mjs <snapshot_dir>");
  }

  const snapshotDir = path.resolve(snapshotDirArg);
  const entries = await fs.readdir(snapshotDir, { withFileTypes: true });
  const tableDirs = entries.filter((entry) => entry.isDirectory());

  const rows = [];
  const tableStats = [];
  const failures = [];

  for (const dir of tableDirs) {
    const tableName = dir.name;
    const documentsPath = path.join(snapshotDir, tableName, "documents.jsonl");
    try {
      await fs.access(documentsPath);
    } catch {
      continue;
    }

    const docs = await readJsonl(documentsPath);
    tableStats.push({ tableName, count: docs.length });

    for (const docRow of docs) {
      const doc = docRow.value;
      const id = doc?._id ? String(doc._id) : `${tableName}__line_${docRow.index}`;
      if (!doc?._id) {
        failures.push({
          tableName,
          line: docRow.index,
          reason: "Missing _id (synthetic id generated)",
        });
      }
      const creation = Number(doc?._creationTime ?? Date.now());
      const sourcePath = `${tableName}/documents.jsonl:${docRow.index}`;
      rows.push({
        tableName,
        documentId: id,
        creationTime: Number.isFinite(creation) ? creation : Date.now(),
        documentJson: JSON.stringify(doc),
        sourcePath,
      });
    }
  }

  const scriptsDir = path.join(process.cwd(), "supabase", "scripts", "import-convex-snapshot-chunks");
  await fs.mkdir(scriptsDir, { recursive: true });
  const existing = await fs.readdir(scriptsDir, { withFileTypes: true });
  await Promise.all(
    existing
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => fs.rm(path.join(scriptsDir, entry.name)))
  );

  const chunkSize = 150;
  let chunkIndex = 1;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const sqlLines = [];
    sqlLines.push("begin;");
    if (chunk.length > 0) {
      sqlLines.push("insert into legacy_mirror.documents (table_name, document_id, creation_time, document, source_path)");
      sqlLines.push("values");
      for (let i = 0; i < chunk.length; i++) {
        const row = chunk[i];
        const tuple = `('${esc(row.tableName)}', '${esc(row.documentId)}', ${row.creationTime}, '${esc(row.documentJson)}'::jsonb, '${esc(row.sourcePath)}')`;
        sqlLines.push(i === chunk.length - 1 ? `${tuple}` : `${tuple},`);
      }
      sqlLines.push("on conflict (table_name, document_id)");
      sqlLines.push("do update set");
      sqlLines.push("  creation_time = excluded.creation_time,");
      sqlLines.push("  document = excluded.document,");
      sqlLines.push("  source_path = excluded.source_path,");
      sqlLines.push("  imported_at = now();");
    }
    sqlLines.push("commit;");
    const chunkPath = path.join(scriptsDir, `${String(chunkIndex).padStart(4, "0")}.sql`);
    await fs.writeFile(chunkPath, `${sqlLines.join("\n")}\n`, "utf8");
    chunkIndex += 1;
  }

  const tailPath = path.join(scriptsDir, `${String(chunkIndex).padStart(4, "0")}_import_run.sql`);
  await fs.writeFile(
    tailPath,
    [
      "begin;",
      `insert into legacy_mirror.import_runs (source_dir, inserted_count, updated_count, failed_count, notes) values ('${esc(snapshotDir)}', ${rows.length}, 0, ${failures.length}, '${esc(`tables=${tableStats.length}`)}');`,
      "commit;",
      "",
    ].join("\n"),
    "utf8"
  );

  const report = {
    snapshotDir,
    tablesScanned: tableStats.length,
    nonEmptyTables: tableStats.filter((t) => t.count > 0),
    totalRowsPrepared: rows.length,
    failures,
    scriptsDir,
    chunkCount: chunkIndex,
  };

  const reportPath = path.join(process.cwd(), "supabase", "scripts", "import-convex-snapshot-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
}

await main();
