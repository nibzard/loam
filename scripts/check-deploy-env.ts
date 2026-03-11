type Target = "all" | "convex" | "vercel";

type VariableCheck = {
  name: string;
  required?: boolean;
  note?: string;
};

type VariableGroupCheck = {
  names: string[];
  note: string;
};

const CHECK_MARK = "OK";
const WARN_MARK = "WARN";
const FAIL_MARK = "FAIL";

const convexChecks: VariableCheck[] = [
  { name: "CLERK_JWT_ISSUER_DOMAIN", required: true },
  { name: "MUX_TOKEN_ID", required: true },
  { name: "MUX_TOKEN_SECRET", required: true },
  { name: "MUX_WEBHOOK_SECRET", required: true },
  { name: "STRIPE_SECRET_KEY", required: true },
  { name: "STRIPE_WEBHOOK_SECRET", required: true },
  { name: "STRIPE_PRICE_BASIC_MONTHLY", required: true },
  { name: "STRIPE_PRICE_PRO_MONTHLY", required: true },
  { name: "RAILWAY_ACCESS_KEY_ID", required: true },
  { name: "RAILWAY_SECRET_ACCESS_KEY", required: true },
  { name: "RAILWAY_ENDPOINT", required: true },
  {
    name: "RAILWAY_PUBLIC_URL",
    note: "Recommended if your storage endpoint differs from the public bucket URL.",
  },
  {
    name: "RAILWAY_BUCKET_NAME",
    note: "Optional. Defaults to videos.",
  },
  {
    name: "RAILWAY_REGION",
    note: "Optional. Defaults to us-east-1.",
  },
  {
    name: "RAILWAY_PUBLIC_URL_INCLUDE_BUCKET",
    note: "Optional. Set to false only if your public bucket URL already includes the bucket path.",
  },
  {
    name: "RESEND_API_KEY",
    note: "Optional. Enables watch notification emails.",
  },
  {
    name: "NOTIFICATION_FROM_EMAIL",
    note: "Optional. Required with RESEND_API_KEY to send watch notification emails.",
  },
  {
    name: "MUX_SIGNING_KEY",
    note: "Optional for future signed Mux playback support. The current playback path does not require it.",
  },
  {
    name: "MUX_PRIVATE_KEY",
    note: "Optional for future signed Mux playback support. The current playback path does not require it.",
  },
];

const convexGroups: VariableGroupCheck[] = [
  {
    names: ["APP_SITE_URL", "VITE_CONVEX_SITE_URL"],
    note:
      "Set at least one for production billing redirects and absolute app links. Using both with the same value is fine.",
  },
];

const vercelChecks: VariableCheck[] = [
  { name: "CONVEX_DEPLOY_KEY", required: true },
  { name: "VITE_CLERK_PUBLISHABLE_KEY", required: true },
  {
    name: "VITE_CONVEX_SITE_URL",
    note: "Recommended for canonical URLs and SEO metadata in the built client.",
  },
  {
    name: "CLERK_SECRET_KEY",
    note: "Optional unless you add Vercel-side Clerk server handlers or middleware.",
  },
];

function isSet(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function maskValue(name: string): string {
  const value = process.env[name];
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function parseTarget(argv: string[]): Target {
  const raw =
    argv.find((value) => value.startsWith("--target="))?.split("=")[1] ??
    argv.find((value) => value === "all" || value === "convex" || value === "vercel");

  if (raw === undefined) {
    return "all";
  }

  if (raw === "convex" || raw === "vercel" || raw === "all") {
    return raw;
  }

  console.error(`Unknown target: ${raw}`);
  console.error("Usage: bun run deploy:check -- --target=all|convex|vercel");
  process.exit(1);
}

function printSection(title: string) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function runVariableChecks(checks: VariableCheck[]): number {
  let failures = 0;

  for (const check of checks) {
    const present = isSet(check.name);
    if (present) {
      console.log(`${CHECK_MARK} ${check.name} ${maskValue(check.name)}`);
      continue;
    }

    if (check.required) {
      failures += 1;
      console.log(`${FAIL_MARK} ${check.name} missing`);
      continue;
    }

    const suffix = check.note ? ` (${check.note})` : "";
    console.log(`${WARN_MARK} ${check.name} not set${suffix}`);
  }

  return failures;
}

function runGroupChecks(groups: VariableGroupCheck[]): number {
  let failures = 0;

  for (const group of groups) {
    const present = group.names.filter(isSet);
    if (present.length > 0) {
      console.log(`${CHECK_MARK} ${group.names.join(" | ")} -> ${present.join(", ")}`);
      continue;
    }

    failures += 1;
    console.log(`${FAIL_MARK} ${group.names.join(" | ")} missing (${group.note})`);
  }

  return failures;
}

function runChecks(target: Exclude<Target, "all">): number {
  if (target === "convex") {
    printSection("Convex Environment");
    const failures = runVariableChecks(convexChecks) + runGroupChecks(convexGroups);
    console.log("");
    console.log("Expected destination: Convex dashboard environment variables");
    return failures;
  }

  printSection("Vercel Environment");
  const failures = runVariableChecks(vercelChecks);
  console.log("");
  console.log("Expected destination: Vercel project environment variables");
  console.log("Note: VITE_CONVEX_URL is injected during `bun run build:vercel`; do not set it manually in Vercel.");
  return failures;
}

const target = parseTarget(process.argv.slice(2));
let failures = 0;

if (target === "all" || target === "convex") {
  failures += runChecks("convex");
}

if (target === "all" || target === "vercel") {
  failures += runChecks("vercel");
}

console.log("");

if (failures > 0) {
  console.error(`${FAIL_MARK} deployment environment check failed with ${failures} missing requirement(s).`);
  process.exit(1);
}

console.log(`${CHECK_MARK} deployment environment check passed.`);
