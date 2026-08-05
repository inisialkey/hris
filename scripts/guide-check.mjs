#!/usr/bin/env node
// Checks docs/08-ai-guide/ai-development-guide.md against the handbook.
//
// The guide claims to be derived rather than authored: its §7 pair set comes
// from the ADR corpus and the coding-standards ban lists, and its §2/§6 are
// pointers into files that must exist. Both claims rot silently — a new ADR
// lands with no pair, a document is renamed, a section is deleted. This script
// recomputes what the guide asserts and fails on any disagreement.
//
//   node scripts/guide-check.mjs          human-readable report
//   node scripts/guide-check.mjs --json   machine-readable
//
// Zero dependencies, Node stdlib only. Sibling of scripts/erd-check.mjs.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = 'docs/08-ai-guide/ai-development-guide.md';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p.slice(ROOT.length));
  }
  return out;
}

const docs = walk(join(ROOT, 'docs')).sort();
const rootDocs = readdirSync(ROOT).filter((f) => f.endsWith('.md'));
const guide = read(GUIDE);

// ------------------------------------------------------------------- the corpus

const allAdrs = new Set(
  readdirSync(join(ROOT, 'docs/adr'))
    .map((f) => (f.match(/^(ADR-\d{4})/) || [])[1])
    .filter(Boolean),
);

// A section runs from its own `## n.` heading to the next `## ` heading.
const section = (n) => {
  const m = guide.match(new RegExp(`\\n## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
  return m ? m[1] : null;
};

const adrsIn = (text) => new Set(text ? text.match(/ADR-\d{4}/g) || [] : []);

// §7's opening paragraph declares the ADRs that cannot have a pair. Everything
// else in §7 is a pair citation.
const s7 = section(7);
const declaredNoPair = (() => {
  if (!s7) return new Set();
  const m = s7.match(/no code-shaped violation[\s\S]*?\n\n/);
  return adrsIn(m ? m[0] : '');
})();
const paired = new Set([...adrsIn(s7)].filter((a) => !declaredNoPair.has(a)));

// ------------------------------------------------------------------ path checks
//
// The guide is written handbook-relative but read from an implementation repo,
// where everything sits under docs/handbook/. Strip that prefix before
// resolving. Bare basenames (`coding-standards-nestjs.md`) are shorthand and
// resolve by search.

// HANDBOOK_SPEC §12 rule 6: a cross-reference may point at a real file *or* a
// MANIFEST.md entry — a not-yet-generated file is planned, not broken.
const manifest = read('MANIFEST.md');

const resolvePath = (p) => {
  const rel = p.replace(/^docs\/handbook\//, '');
  if (manifest.includes(`\`${rel}\``)) return true;
  if (rel.includes('/')) return existsSync(join(ROOT, rel));
  if (rootDocs.includes(rel)) return true;
  return docs.some((d) => basename(d) === rel);
};

const citedPaths = [...new Set(guide.match(/`[\w./()-]+\.md`/g) || [])].map((t) => t.slice(1, -1));

// ----------------------------------------------------------------------- checks

const fail = [];
const F = (id, msg) => fail.push({ id, msg });

// G1 — every ADR is either paired or declared unpairable.
for (const a of [...allAdrs].sort()) {
  if (!paired.has(a) && !declaredNoPair.has(a)) F('G1', `${a} has no pair in §7 and no no-pair declaration`);
}

// G2 — an ADR cannot be both.
for (const a of [...paired].sort()) {
  if (declaredNoPair.has(a)) F('G2', `${a} is both cited as a pair and declared unpairable`);
}

// G3 — the no-pair declaration names only real ADRs.
for (const a of [...declaredNoPair].sort()) {
  if (!allAdrs.has(a)) F('G3', `${a} is declared unpairable but does not exist`);
}

// G4 — every ADR the guide mentions anywhere exists.
for (const a of [...adrsIn(guide)].sort()) {
  if (!allAdrs.has(a)) F('G4', `${a} is referenced but does not exist in docs/adr/`);
}

// G5 — every .md path the guide cites resolves.
for (const p of citedPaths.sort()) {
  if (!resolvePath(p)) F('G5', `cited path does not resolve: ${p}`);
}

// G7 — the corpus sizes the guide quotes are facts, and adding one ADR or one
// document silently falsifies them. This check exists because writing ADR-0025
// did exactly that, in the same session that wrote the guide.
for (const [, n] of guide.matchAll(/all (\d+), in full/g)) {
  if (+n !== allAdrs.size) F('G7', `§2.1 claims ${n} ADRs; docs/adr/ holds ${allAdrs.size}`);
}
for (const [, n] of guide.matchAll(/\n(\d+) files, [\d,]+ lines/g)) {
  if (+n !== allAdrs.size) F('G7', `§2.2 claims ${n} ADR files; docs/adr/ holds ${allAdrs.size}`);
}
for (const [, n] of guide.matchAll(/because (\d+) files and ~[\d,]+ lines/g)) {
  if (+n !== docs.length) F('G7', `§1 claims ${n} handbook documents; docs/ holds ${docs.length}`);
}

// ------------------------------------------------- G8-G10: the CLAUDE.md template
//
// The template ships three near-identical CLAUDE.md blocks. Three copies inside
// one document drift as readily as three files in three repositories; the only
// difference is that here a check can see it.

const TEMPLATE = 'docs/08-ai-guide/implementation-claude-md-template.md';
const REPOS = ['hris-api', 'hris-admin', 'hris-mobile'];
const IMPORT = '@docs/handbook/docs/08-ai-guide/ai-development-guide.md';
const MARKER = '<!-- handbook-managed: do not edit above this line -->';

let template = null;
try {
  template = read(TEMPLATE);
} catch {
  F('G8', `${TEMPLATE} is missing — ai-development-guide.md names it Downstream`);
}

if (template) {
  const blocks = [...template.matchAll(/```markdown\n([\s\S]*?)```/g)].map((m) => m[1]);
  const claudeBlocks = blocks.filter((b) => b.startsWith('# CLAUDE.md'));

  // G8 — one complete block per repository, each carrying the gate and the marker.
  for (const repo of REPOS) {
    const b = claudeBlocks.find((x) => x.includes(repo));
    if (!b) { F('G8', `no CLAUDE.md block for ${repo}`); continue; }
    if (!b.includes(IMPORT)) F('G8', `${repo} block does not carry the @-import`);
    if (!b.includes(MARKER)) F('G8', `${repo} block has no handbook-managed marker`);
    if (!/ai-development-guide\.md` §2/.test(b)) F('G8', `${repo} block does not gate on §2 by name`);
  }
  if (claudeBlocks.length !== REPOS.length) {
    F('G8', `expected ${REPOS.length} CLAUDE.md blocks, found ${claudeBlocks.length}`);
  }

  // G9 — every guide section the blocks cite exists. Renumbering the guide would
  // otherwise break three repositories silently.
  for (const [, n] of template.matchAll(/ai-development-guide\.md` §(\d+)/g)) {
    if (section(n) === null) F('G9', `template cites ai-development-guide.md §${n}, which does not exist`);
  }

  // G10 — the blocks differ only where they are meant to. Any line appearing in
  // one block and exactly one other is a change that landed incompletely.
  const linesOf = (b) => b.split('\n').map((l) => l.trim()).filter((l) => l.length > 20);
  const seen = new Map();
  for (const b of claudeBlocks) for (const l of new Set(linesOf(b))) seen.set(l, (seen.get(l) || 0) + 1);
  for (const [l, n] of seen) {
    if (n === 2) F('G10', `line is in 2 of 3 CLAUDE.md blocks — incomplete edit: ${l.slice(0, 70)}`);
  }

  // Template paths resolve too (same rule as G5), minus two classes that are not
  // handbook references: destinations inside an implementation repository, which
  // do not exist here by design, and CONTEXT-MAP.md, which the template names in
  // order to say it must NOT be created.
  const NOT_HANDBOOK_PATHS = /^hris-(api|admin|mobile)\/|^CONTEXT-MAP\.md$/;
  for (const p of [...new Set(template.match(/`[\w./()-]+\.md`/g) || [])].map((t) => t.slice(1, -1))) {
    if (NOT_HANDBOOK_PATHS.test(p)) continue;
    if (!resolvePath(p)) F('G9', `template cites a path that does not resolve: ${p}`);
  }
}

// G6 — the sections CLAUDE.md and this script depend on by number still exist.
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  if (section(n) === null) F('G6', `§${n} is missing — CLAUDE.md gates on §2 and §8 registers the checks`);
}

// ----------------------------------------------------------------------- report

const summary = {
  adrs: allAdrs.size,
  paired: paired.size,
  declaredNoPair: declaredNoPair.size,
  citedPaths: citedPaths.length,
  failures: fail.length,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...summary, fail }, null, 2));
} else {
  console.log(`guide-check ${GUIDE}`);
  console.log(
    `  ${summary.adrs} ADRs · ${summary.paired} paired · ${summary.declaredNoPair} declared unpairable · ${summary.citedPaths} cited paths`,
  );
  if (!fail.length) console.log('  all checks pass (G1-G10)');
  else for (const f of fail) console.log(`  ${f.id} ${f.msg}`);
}

process.exit(fail.length ? 1 : 0);
