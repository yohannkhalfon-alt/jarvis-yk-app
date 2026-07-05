#!/usr/bin/env node
/**
 * fill-check — fails when a generated/filled site still contains template
 * placeholders or scaffold slop, so an unfinished build can't be shipped.
 *
 *   bun run qa:fill                       report findings, exit 0 (informational)
 *   bun run qa:fill -- --strict           exit 1 if any placeholder remains
 *   bun run qa:fill -- --strict --url URL also scan the rendered preview DOM
 *   bun run qa:fill -- --selftest         run assertions on the matcher
 *
 * Run it (with --strict) before claiming a build ready / deploying. It is a
 * COMPLETION gate, not a CI build step: the pristine default template
 * intentionally ships the blank-page placeholder, which --strict correctly
 * flags only when you claim the app is done. No new dependencies.
 *
 * What counts as a leak (placeholders the fill step must have replaced):
 *  - `<...>`-style tokens in quoted strings (e.g. "<brand name>", "<product>")
 *  - the literal `<...>`
 *  - `lorem ipsum`
 *  - scaffold blank-page markers (REMOVE_THIS, blank-app-v1, the placeholder attr)
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIR = "src";
const EXCLUDE = ["src/components/ui"]; // legacy shadcn anatomy; not template content
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html"]);

// Source leaks. Conservative: must not fire on real JSX/markup or generics.
const SOURCE = [
  // quoted `<...>` token — inner has no =,/,<,> so real HTML-tag strings are skipped
  { name: "placeholder-token", re: /(["'`])<([^<>=/\n]{1,60})>\1/g },
  { name: "ellipsis-token", re: /<\s*\.\.\.\s*>/g },
  { name: "lorem-ipsum", re: /\blorem ipsum\b/gi },
  {
    name: "scaffold-marker",
    re: /REMOVE_THIS|blank-app-v1|data-higgsfield-blank-page-placeholder/g,
  },
];
// Rendered-DOM leaks (placeholders that survived to the page).
const DOM = [
  { name: "lorem-ipsum", re: /\blorem ipsum\b/gi },
  {
    name: "scaffold-marker",
    re: /REMOVE_THIS|blank-app-v1|data-higgsfield-blank-page-placeholder/g,
  },
  { name: "ellipsis-token", re: /<\s*\.\.\.\s*>/g },
  { name: "placeholder-token", re: /&lt;[^&<>\n]{1,60}&gt;/g }, // escaped "<brand name>"
];

export function findLeaks(text, patterns) {
  const hits = [];
  for (const { name, re } of patterns) {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = r.exec(text)) !== null) {
      hits.push({ name, match: m[0].slice(0, 60) });
      if (m.index === r.lastIndex) r.lastIndex += 1;
    }
  }
  return hits;
}

async function walk(abs, acc) {
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(abs, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (EXT.has(path.extname(p))) acc.push(p);
  }
  return acc;
}

async function scanSource() {
  const root = path.resolve(appRoot, SCAN_DIR);
  if (!existsSync(root)) return [];
  const excluded = EXCLUDE.map((p) => path.resolve(appRoot, p));
  const files = (await walk(root, [])).filter(
    (f) => !excluded.some((e) => f === e || f.startsWith(e + path.sep)),
  );
  const findings = [];
  for (const f of files) {
    const hits = findLeaks(await readFile(f, "utf8"), SOURCE);
    if (hits.length) findings.push({ file: path.relative(appRoot, f), hits });
  }
  return findings;
}

async function scanDom(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const html = await res.text();
    return { url, ok: res.ok, status: res.status, hits: findLeaks(html, DOM) };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      hits: [],
    };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) return selftest();
  const strict = argv.includes("--strict");
  const json = argv.includes("--json");
  const urlIdx = argv.indexOf("--url");
  const url =
    urlIdx !== -1 ? argv[urlIdx + 1] : (argv.find((a) => a.startsWith("--url="))?.slice(6) ?? "");

  const source = await scanSource();
  const dom = url ? await scanDom(url) : null;
  const sourceCount = source.reduce((n, f) => n + f.hits.length, 0);
  const domCount = dom?.hits.length ?? 0;
  const total = sourceCount + domCount + (dom && !dom.ok ? 1 : 0);
  const result = {
    verdict: total === 0 ? "clean" : "placeholders-remain",
    strict,
    sourceCount,
    domCount,
    source,
    dom,
  };

  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      `Fill check: ${result.verdict} (${sourceCount} in source${url ? `, ${domCount} in DOM` : ""})`,
    );
    for (const f of source)
      for (const h of f.hits) console.log(`- ${f.file}: ${h.name} → ${h.match}`);
    if (dom?.hits.length) for (const h of dom.hits) console.log(`- [DOM] ${h.name} → ${h.match}`);
    if (dom && !dom.ok) console.log(`- [DOM] preview unreachable: ${dom.status ?? dom.error}`);
    if (total && !strict) console.log("(informational — run with --strict to fail the build)");
  }
  if (strict && total > 0) process.exitCode = 1;
}

function selftest() {
  const a = (c, m) => {
    if (!c) {
      console.error(`selftest FAIL: ${m}`);
      process.exit(1);
    }
  };
  a(findLeaks('name: "<brand name>"', SOURCE).length === 1, "quoted <token> caught");
  a(findLeaks('id: "<product>"', SOURCE).length === 1, "single-word <token> caught");
  a(
    findLeaks("const x = <...>", SOURCE).some((h) => h.name === "ellipsis-token"),
    "<...> caught",
  );
  a(findLeaks("Lorem ipsum dolor", SOURCE).length === 1, "lorem caught");
  a(findLeaks('src="blank-app-v1.svg"', SOURCE).length === 1, "scaffold marker caught");
  // must NOT fire on real code:
  a(findLeaks("<div className={cn(x)} {...props} />", SOURCE).length === 0, "JSX is not a leak");
  a(findLeaks("const a: Array<string> = []", SOURCE).length === 0, "TS generic is not a leak");
  a(findLeaks('href="</docs>"', SOURCE).length === 0, "closing-tag string is not a leak");
  a(findLeaks('"<img src=x>"', SOURCE).length === 0, "tag-with-attrs string is not a leak");
  a(findLeaks("just normal copy here", SOURCE).length === 0, "plain text is clean");
  console.log("fill-check selftest: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
