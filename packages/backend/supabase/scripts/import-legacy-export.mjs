import "dotenv/config";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { Client } from "pg";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(abs)));
    } else {
      files.push(abs);
    }
  }
  return files;
}

function pickDocumentId(doc, fallback) {
  return String(doc._id ?? doc.id ?? fallback);
}

function pickCreationTime(doc) {
  if (typeof doc._creationTime === "number") return doc._creationTime;
  if (typeof doc.createdAt === "number") return doc.createdAt;
  return null;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const args = parseArgs(process.argv);
  const exportDir = path.resolve(
    process.cwd(),
    args["export-dir"] ? String(args["export-dir"]) : "../../scratch/legacy-export"
  );

  if (!fs.existsSync(exportDir)) {
    throw new Error(`Export directory not found: ${exportDir}`);
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  const files = (await walk(exportDir)).filter((file) => file.endsWith("documents.jsonl"));

  const runRes = await client.query(
    `insert into legacy_mirror.import_runs (source_dir) values ($1) returning id`,
    [exportDir]
  );
  const runId = runRes.rows[0].id;

  try {
    for (const file of files) {
      const rel = path.relative(exportDir, file).replace(/\\/g, "/");
      const tableName = rel.replace(/\/documents\.jsonl$/, "");

      const stream = fs.createReadStream(file, "utf8");
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber += 1;
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const doc = JSON.parse(trimmed);
          const documentId = pickDocumentId(doc, `${tableName}:${lineNumber}`);
          const creationTime = pickCreationTime(doc);

          const upsert = await client.query(
            `
            insert into legacy_mirror.documents (
              table_name,
              document_id,
              creation_time,
              document,
              source_path
            ) values ($1, $2, $3, $4::jsonb, $5)
            on conflict (table_name, document_id) do update
            set creation_time = excluded.creation_time,
                document = excluded.document,
                source_path = excluded.source_path,
                imported_at = now()
            returning (xmax = 0) as inserted
            `,
            [tableName, documentId, creationTime, JSON.stringify(doc), rel]
          );

          if (upsert.rows[0].inserted) inserted += 1;
          else updated += 1;
        } catch (error) {
          failed += 1;
          console.error(`Failed to import ${rel}:${lineNumber}`, error);
        }
      }
    }

    await client.query(
      `
      update legacy_mirror.import_runs
      set finished_at = now(),
          inserted_count = $2,
          updated_count = $3,
          failed_count = $4
      where id = $1
      `,
      [runId, inserted, updated, failed]
    );

    console.log(`Import completed. inserted=${inserted} updated=${updated} failed=${failed}`);
  } catch (error) {
    await client.query(
      `update legacy_mirror.import_runs set finished_at = now(), notes = $2 where id = $1`,
      [runId, String(error?.message ?? error)]
    );
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exitCode = 1;
});

