import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = path.join(root, "config", "djiwa-checkout-apps.json");
const config = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const appsRoot = path.join(root, "apps");
const packageName = "@yumipos/djiwa-checkout-ui";
const failures = [];

// Canonical FORMAT contract. These labels must never come back: the step header is rendered by the
// shared CheckoutHeader (Langkah X dari N) and the Djiwa Pay rate is data, never a constant.
const BANNED_PATTERNS = [
  {
    scope: "all",
    re: /(?:>|["'`])\s*Step\s+\d+/,
    why: 'English step label; render the shared CheckoutHeader instead ("Langkah X dari N")',
  },
  {
    scope: "flow",
    re: /Voucher Djiwa Pay \(/,
    why: "hardcoded Djiwa Pay rate label; pass djiwaPayDiscountRate through",
  },
  {
    scope: "flow",
    re: /Djiwa Pay 50%/,
    why: "hardcoded Djiwa Pay rate label; use the live djiwaPayDiscountPercent",
  },
];

// where the canonical checkout format actually lives (marketing banners are out of scope)
const FLOW_FILE = /(checkout-section|shared-components|receipt-section|shipping-section|delivery-step)\.tsx$|order\.lazy\.tsx$/;


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

  // Styling pipeline parity: every registered customer checkout app runs the same Tailwind v4
  // wiring (djiwa-checkout-v1). Without it a new app silently loses the shared utility layer.
  for (const dep of ["tailwindcss", "@tailwindcss/vite"]) {
    if (!deps[dep]) failures.push(`${app}: package.json must depend on ${dep} (djiwa-checkout-v1 styling)`);
  }
  const viteConfigPath = path.join(appsRoot, app, "vite.config.ts");
  if (!fs.existsSync(viteConfigPath)) {
    failures.push(`${app}: missing vite.config.ts`);
  } else if (!fs.readFileSync(viteConfigPath, "utf8").includes("tailwindcss")) {
    failures.push(`${app}: vite.config.ts must register the @tailwindcss/vite plugin`);
  }
  const indexCssPath = path.join(appsRoot, app, "src", "index.css");
  if (!fs.existsSync(indexCssPath)) {
    failures.push(`${app}: missing src/index.css`);
  } else if (!fs.readFileSync(indexCssPath, "utf8").includes('@import "tailwindcss"')) {
    failures.push(`${app}: src/index.css must @import "tailwindcss"`);
  }
  if (!state.main.includes(`${packageName}/styles.css`)) failures.push(`${app}: src/main.tsx must import ${packageName}/styles.css`);
  const checkoutFiles = state.sources.filter((file) => /checkout-section\.tsx$/.test(file));
  const sourceText = checkoutFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  if (app === "djiwapay") {
    if (!state.sources.some((file) => fs.readFileSync(file, "utf8").includes(packageName))) {
      failures.push(`${app}: checkout flow must import shared checkout components`);
    }
  } else {
    if (!checkoutFiles.length) failures.push(`${app}: missing checkout-section.tsx standard surface`);
    const usesSharedCustomerCheckout = importsShared(sourceText, "CustomerCheckout");
    if (!usesSharedCustomerCheckout && !importsShared(sourceText, "CheckoutPage")) failures.push(`${app}: checkout-section.tsx must use shared CheckoutPage or CustomerCheckout`);
    if (!usesSharedCustomerCheckout && !importsShared(sourceText, "PaymentMethodCard")) failures.push(`${app}: checkout-section.tsx must use shared PaymentMethodCard`);
    if (!usesSharedCustomerCheckout && !importsShared(sourceText, "CheckoutHeader")) failures.push(`${app}: checkout-section.tsx must use shared CheckoutHeader`);
  }

  // canonical format contract — checkout/order flow files must not regress
  for (const file of state.sources) {
    const inFlow = FLOW_FILE.test(file);
    const text = fs.readFileSync(file, "utf8");
    for (const { re, why, scope } of BANNED_PATTERNS) {
      if (scope === "flow" && !inFlow) continue;
      const found = text.match(re);
      if (found) failures.push(`${app}: ${path.relative(root, file)} contains ${JSON.stringify(found[0].trim())} — ${why}`);
    }
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

// the shared package must keep exporting the canonical surface every app is told to reuse
const packageIndexPath = path.join(root, "packages", "djiwa-checkout-ui", "src", "index.ts");
if (!fs.existsSync(packageIndexPath)) {
  failures.push("packages/djiwa-checkout-ui: src/index.ts is missing");
} else {
  const packageIndex = fs.readFileSync(packageIndexPath, "utf8");
  for (const symbol of ["CheckoutHeader", "CheckoutSummaryLines", "CustomerCheckout", "CheckoutSection"]) {
    if (!new RegExp(`\\b${symbol}\\b`).test(packageIndex)) {
      failures.push(`packages/djiwa-checkout-ui: index.ts must export ${symbol}`);
    }
  }
}

if (failures.length) {
  console.error("Djiwa Checkout Standard: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Djiwa Checkout Standard: PASS (${config.standard})`);
console.log(`Customer checkout apps: ${config.customerCheckoutApps.join(", ")}`);
console.log(`Operational payment apps remain separate: ${config.operationalPaymentApps.join(", ")}`);
