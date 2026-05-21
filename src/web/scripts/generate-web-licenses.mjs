#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_LICENSES_WEB.md at the repo root by walking the
 * production npm dep tree of src/web. For each unique <name@version> we
 * include the license id, repo URL, and (when present) the verbatim
 * license text from the package's LICENSE file.
 *
 * Run this whenever package.json or package-lock.json changes:
 *   node scripts/generate-web-licenses.mjs
 *
 * The output file is committed to the repo and shipped inside the web
 * bundle via the Licenses modal — see src/web/ui/LicensesModal.ts.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..", "..");
const OUT_FILE = join(REPO_ROOT, "THIRD_PARTY_LICENSES_WEB.md");

// Walk `npm ls --omit=dev --all --json` and collect every unique
// `${name}@${version}` we depend on, transitively.
const collectFromNpmLs = () => {
  const json = JSON.parse(
    execSync("npm ls --omit=dev --all --json", { cwd: WEB_ROOT }).toString(),
  );
  const out = new Map(); // key: name, value: Set of versions
  const visit = (node) => {
    if (!node || !node.dependencies) return;
    for (const [name, child] of Object.entries(node.dependencies)) {
      if (!out.has(name)) out.set(name, new Set());
      if (child.version) out.get(name).add(child.version);
      visit(child);
    }
  };
  visit(json);
  return out;
};

// Locate a package directory in node_modules. npm's nested hoisting
// means a package can live in either the root node_modules or nested
// under another. Prefer the root-most match.
const findPkgDir = (name) => {
  const candidates = [
    join(WEB_ROOT, "node_modules", name),
  ];
  // Also recurse into nested node_modules in case of version pinning.
  const stack = [join(WEB_ROOT, "node_modules")];
  while (stack.length) {
    const dir = stack.pop();
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (!statSync(p).isDirectory()) continue;
      if (entry === ".bin" || entry.startsWith(".")) continue;
      if (entry.startsWith("@")) {
        // Scoped namespace: recurse one level
        for (const sub of readdirSync(p)) {
          const subDir = join(p, sub);
          if (`${entry}/${sub}` === name) candidates.push(subDir);
          const nested = join(subDir, "node_modules");
          if (existsSync(nested)) stack.push(nested);
        }
      } else {
        if (entry === name) candidates.push(p);
        const nested = join(p, "node_modules");
        if (existsSync(nested)) stack.push(nested);
      }
    }
  }
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  return null;
};

const LICENSE_FILENAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENSE-MIT",
  "LICENSE-MIT.txt",
  "License",
  "License.md",
  "License.txt",
  "license",
  "license.md",
  "license.txt",
  "COPYING",
];

const readLicenseFile = (pkgDir) => {
  for (const fname of LICENSE_FILENAMES) {
    const p = join(pkgDir, fname);
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8").trim();
      } catch {
        // ignore
      }
    }
  }
  return null;
};

const normLicense = (lic) => {
  if (!lic) return "UNKNOWN";
  if (typeof lic === "string") return lic;
  if (typeof lic === "object" && lic.type) return lic.type;
  return JSON.stringify(lic);
};

const repoUrl = (repo) => {
  if (!repo) return null;
  if (typeof repo === "string") return repo;
  if (typeof repo === "object" && repo.url) {
    return repo.url.replace(/^git\+/, "").replace(/\.git$/, "");
  }
  return null;
};

const main = () => {
  const collected = collectFromNpmLs();
  const entries = [];
  for (const [name, versions] of [...collected.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (const version of [...versions].sort()) {
      const pkgDir = findPkgDir(name);
      if (!pkgDir) {
        entries.push({ name, version, license: "UNKNOWN", repo: null, text: null });
        continue;
      }
      let pkg = {};
      try {
        pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
      } catch {
        // ignore
      }
      entries.push({
        name,
        version,
        license: normLicense(pkg.license || pkg.licenses),
        repo: repoUrl(pkg.repository) || pkg.homepage || null,
        text: readLicenseFile(pkgDir),
      });
    }
  }

  const lines = [];
  lines.push("# Third-party licenses (web)");
  lines.push("");
  lines.push(
    "codeimg is distributed under the MIT License (see `LICENSE`). The web app served from `dist/` bundles the following third-party npm packages (production dependencies, transitive). Their copyright notices and license texts are reproduced below to satisfy each license's attribution requirements.",
  );
  lines.push("");
  lines.push(
    "This file is generated by `src/web/scripts/generate-web-licenses.mjs`; regenerate whenever `package-lock.json` changes.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Package | Version | License | Project |");
  lines.push("| --- | --- | --- | --- |");
  for (const e of entries) {
    const repoCell = e.repo ? `[${e.repo}](${e.repo})` : "—";
    lines.push(`| ${e.name} | ${e.version} | ${e.license} | ${repoCell} |`);
  }
  lines.push("");
  for (const e of entries) {
    lines.push(`## ${e.name} ${e.version}`);
    lines.push("");
    lines.push(`- License: ${e.license}`);
    if (e.repo) lines.push(`- Project: ${e.repo}`);
    lines.push("");
    if (e.text) {
      lines.push("```");
      lines.push(e.text);
      lines.push("```");
    } else {
      lines.push("_License text not bundled with this package; see project page._");
    }
    lines.push("");
  }

  writeFileSync(OUT_FILE, lines.join("\n"));
  // Stderr → status, stdout → just the path for shell consumption.
  console.error(`Wrote ${entries.length} entries to ${OUT_FILE}`);
};

main();
