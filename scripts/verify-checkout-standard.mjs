import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = path.join(root, "config", "djiwa-checkout-apps.json");
const config = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const appsRoot = path.join(root, "apps");
const packageName = "@yumipos/djiwa-checkout-ui";
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".turbo"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function importsShared(source, symbol) {
  return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']${packageName}["']`).test(source);
}

function readApp(app) {
  const appDir = path.join(appsRoot, app);
  const packagePath = path.join(appDir, "package.json");
  const mainPath = path.join(appDir, "src", "main.tsx");
  if (!fs.existsSync(packagePath)) {
    failures.push(`${app}: missing package.json`);
    return null;
  }
  if (!fs.existsSync(mainPath)) {
    failures.push(`${app}: missing src/main.tsx`);
    return null;
  }
  return {
    manifest: JSON.parse(fs.readFileSync(packagePath, "utf8")),
    main: fs.readFileSync(mainPath, "utf8"),
    sources: walk(path.join(appDir, "src")),
  };
}

for (const app of config.customerCheckoutApps) {
  const state = readApp(app);
  if (!state) continue;
  const deps = { ...(state.manifest.dependencies ?? {}), ...(state.manifest.devDependencies ?? {}) };
  if (!deps[packageName]) failures.push(`${app}: package.json must depend on ${packageName}`);
  if (!state.main.includes(`${packageName}/styles.css`)) failures.push(`${app}: src/main.tsx must import ${packageName}/styles.css`);
  const checkoutFiles = state.sources.filter((file) => /checkout-section\.tsx$/.test(file));
  const sourceText = checkoutFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  if (app === "djiwapay") {
    if (!state.sources.some((file) => fs.readFileSync(file, "utf8").includes(packageName))) {
      failures.push(`${app}: checkout flow must import shared checkout components`);
    }
  } else {
    if (!checkoutFiles.length) failures.push(`${app}: missing checkout-section.tsx standard surface`);
    if (!importsShared(sourceText, "CheckoutPage")) failures.push(`${app}: checkout-section.tsx must use shared CheckoutPage`);
    if (!importsShared(sourceText, "PaymentMethodCard")) failures.push(`${app}: checkout-section.tsx must use shared PaymentMethodCard`);
  }
}

const registered = new Set([...config.customerCheckoutApps, ...config.operationalPaymentApps]);
for (const entry of fs.readdirSync(appsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || registered.has(entry.name)) continue;
  const files = walk(path.join(appsRoot, entry.name));
  const hasCheckoutSignal = files.some((file) => {
    const text = fs.readFileSync(file, "utf8");
    return /Pilih pembayaran|renderCheckoutSection|djiwa-checkout|checkout-section\.tsx/.test(text);
  });
  if (hasCheckoutSignal) failures.push(`${entry.name}: checkout-like surface detected; register it in config/djiwa-checkout-apps.json and adopt ${packageName}`);
}

if (failures.length) {
  console.error("Djiwa Checkout Standard: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Djiwa Checkout Standard: PASS (${config.standard})`);
console.log(`Customer checkout apps: ${config.customerCheckoutApps.join(", ")}`);
console.log(`Operational payment apps remain separate: ${config.operationalPaymentApps.join(", ")}`);
