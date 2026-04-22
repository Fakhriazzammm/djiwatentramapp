import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://xaemykhjpkgypqqpfdcb.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_BUCKET = process.env.VITE_SUPABASE_STORAGE_BUCKET || "app-assets";
const CONVEX_URL = process.env.CONVEX_DEPLOYMENT_URL || "https://moonlit-ox-799.convex.cloud";

if (!SUPABASE_KEY) {
	throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY in environment");
}

function uniq(items) {
	return Array.from(new Set(items));
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

function extFromContentType(contentType) {
	const type = String(contentType || "").toLowerCase();
	if (type.includes("jpeg")) return "jpg";
	if (type.includes("png")) return "png";
	if (type.includes("webp")) return "webp";
	if (type.includes("gif")) return "gif";
	if (type.includes("svg")) return "svg";
	return "bin";
}

async function convexQuery(pathName, args = {}) {
	const response = await fetch(`${CONVEX_URL}/api/query`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path: pathName, args }),
	});
	if (!response.ok) {
		throw new Error(`Convex query failed (${pathName}): ${response.status} ${await response.text()}`);
	}
	const payload = await response.json();
	if (payload?.status !== "success") {
		throw new Error(`Convex query error (${pathName}): ${JSON.stringify(payload)}`);
	}
	return payload.value;
}

async function uploadToSupabase({ sourceUrl, folder, fileStem }) {
	const download = await fetch(sourceUrl);
	if (!download.ok) {
		throw new Error(`Download failed (${download.status}) for ${sourceUrl}`);
	}

	const contentType = download.headers.get("content-type") || "application/octet-stream";
	const extension = extFromContentType(contentType);
	const arrayBuffer = await download.arrayBuffer();
	const objectPath = `migrated/${folder}/${fileStem}.${extension}`;
	const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;

	const upload = await fetch(uploadUrl, {
		method: "POST",
		headers: {
			apikey: SUPABASE_KEY,
			Authorization: `Bearer ${SUPABASE_KEY}`,
			"Content-Type": contentType,
			"x-upsert": "true",
		},
		body: Buffer.from(arrayBuffer),
	});
	if (!upload.ok) {
		throw new Error(`Upload failed (${upload.status}) for ${objectPath}: ${await upload.text()}`);
	}

	return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
}

async function main() {
	const uploadCache = new Map();
	const products = await convexQuery("products:getAllProductsAdmin", {});
	const bookingOrders = await convexQuery("booking:getBookingOrders", { slug: "booking" });
	const bookingSettings = await convexQuery("booking:getSettings", { slug: "booking" });
	const siteSettings = await convexQuery("site_settings:getSettings", {});

	const productUpdates = [];
	const bookingProofUpdates = [];
	const bookingSettingsUpdates = [];
	const siteSettingFieldUpdates = [];
	const failures = [];

	async function migrateUrl(sourceUrl, folder, stem) {
		if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
		if (!sourceUrl.includes("convex.cloud/api/storage/")) return sourceUrl;
		const key = sourceUrl;
		if (uploadCache.has(key)) return uploadCache.get(key);
		try {
			const migrated = await uploadToSupabase({ sourceUrl, folder, fileStem: stem });
			uploadCache.set(key, migrated);
			return migrated;
		} catch (error) {
			failures.push({ sourceUrl, reason: String(error) });
			return null;
		}
	}

	for (const item of products || []) {
		const id = String(item?._id || "").trim();
		const storageId = String(item?.storageId || "").trim();
		const url = String(item?.image || "").trim();
		if (!id || !storageId || !url) continue;
		const migratedUrl = await migrateUrl(url, "products", `${id}-image`);
		if (!migratedUrl) continue;
		productUpdates.push({ id, storageId, oldUrl: url, newUrl: migratedUrl });
	}

	for (const item of bookingOrders || []) {
		const id = String(item?._id || "").trim();
		const url = String(item?.paymentProofImage || "").trim();
		if (!id || !url) continue;
		const migratedUrl = await migrateUrl(url, "booking-proofs", `${id}-proof`);
		if (!migratedUrl) continue;
		bookingProofUpdates.push({ id, oldUrl: url, newUrl: migratedUrl });
	}

	if (bookingSettings && typeof bookingSettings === "object") {
		const slug = String(bookingSettings.slug || "booking");
		for (const fieldName of ["logoUrl", "bannerUrl", "qrisImage"]) {
			const oldUrl = String(bookingSettings[fieldName] || "").trim();
			if (!oldUrl) continue;
			const migratedUrl = await migrateUrl(oldUrl, "booking-settings", `${slug}-${fieldName}`);
			if (!migratedUrl) continue;
			bookingSettingsUpdates.push({ slug, fieldName, oldUrl, newUrl: migratedUrl });
		}
	}

	if (siteSettings && typeof siteSettings === "object") {
		for (const fieldName of [
			"logoUrl",
			"headerLogoUrl",
			"faviconUrl",
			"pwaIcon192Url",
			"pwaIcon512Url",
			"pwaMaskableIconUrl",
			"seoShareImageUrl",
			"qrisImage",
			"receiptLogo",
			"paymentPopupImage",
		]) {
			const oldUrl = String(siteSettings[fieldName] || "").trim();
			if (!oldUrl) continue;
			const migratedUrl = await migrateUrl(oldUrl, "site-settings", `site-${fieldName}`);
			if (!migratedUrl) continue;
			siteSettingFieldUpdates.push({ fieldName, oldUrl, newUrl: migratedUrl });
		}
	}

	const statements = [];
	statements.push("begin;");

	for (const row of productUpdates) {
		statements.push(
			`update pos.products set image = '${escapeSql(row.newUrl)}' where source_id = '${escapeSql(row.id)}' and (image = '${escapeSql(row.storageId)}' or image = '${escapeSql(row.oldUrl)}' or image !~* '^https?://');`
		);
	}

	for (const row of bookingProofUpdates) {
		statements.push(
			`update pos.booking_orders set payment_proof_image = '${escapeSql(row.newUrl)}' where source_id = '${escapeSql(row.id)}' and (payment_proof_image = '${escapeSql(row.oldUrl)}' or payment_proof_image !~* '^https?://');`
		);
	}

	if (bookingSettingsUpdates.length > 0) {
		const bySlug = new Map();
		for (const row of bookingSettingsUpdates) {
			if (!bySlug.has(row.slug)) bySlug.set(row.slug, {});
			bySlug.get(row.slug)[row.fieldName] = row.newUrl;
		}
		for (const [slug, fields] of bySlug.entries()) {
			const sets = [];
			if (fields.logoUrl) sets.push(`logo_url = '${escapeSql(fields.logoUrl)}'`);
			if (fields.bannerUrl) sets.push(`banner_url = '${escapeSql(fields.bannerUrl)}'`);
			if (fields.qrisImage) sets.push(`qris_image = '${escapeSql(fields.qrisImage)}'`);
			if (sets.length > 0) {
				statements.push(`update pos.booking_settings set ${sets.join(", ")} where slug = '${escapeSql(slug)}';`);
			}
		}
	}

	if (siteSettingFieldUpdates.length > 0) {
		const latestSourceSql = "(select source_id from pos.site_settings order by creation_time desc limit 1)";
		for (const row of siteSettingFieldUpdates) {
			statements.push(
				`update pos.site_settings set raw = jsonb_set(coalesce(raw, '{}'::jsonb), '{${escapeSql(row.fieldName)}}', to_jsonb('${escapeSql(row.newUrl)}'::text), true) where source_id = ${latestSourceSql};`
			);
		}
	}

	statements.push("commit;");

	const sqlPath = path.join(ROOT, "supabase", "scripts", "storage-backfill-from-convex.sql");
	await fs.writeFile(sqlPath, `${statements.join("\n")}\n`, "utf8");

	const report = {
		convexUrl: CONVEX_URL,
		bucket: SUPABASE_BUCKET,
		uploadedUniqueAssets: uploadCache.size,
		productUpdates: productUpdates.length,
		bookingProofUpdates: bookingProofUpdates.length,
		bookingSettingsUpdates: bookingSettingsUpdates.length,
		siteSettingFieldUpdates: siteSettingFieldUpdates.length,
		failedAssets: failures.length,
		failures,
		sqlPath,
	};

	const reportPath = path.join(ROOT, "supabase", "scripts", "storage-backfill-report.json");
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	console.log(JSON.stringify(report, null, 2));
}

await main();
