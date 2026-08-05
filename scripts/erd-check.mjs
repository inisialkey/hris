#!/usr/bin/env node
// Derives docs/04-database/erd-overview.md from the handbook's Drizzle blocks.
//
// erd-overview.md is a derived document: every count in it is a fact about the
// schema declared across docs/**/*.md. This script recomputes those facts and
// checks the document against them. Run it in any session that adds, removes,
// or re-points a table (erd-overview.md §11, the maintenance rule).
//
//   node scripts/erd-check.mjs          human-readable report
//   node scripts/erd-check.mjs --json   machine-readable
//
// Zero dependencies, Node stdlib only. Mermaid *syntax* validation is a
// separate concern and stays a one-liner:
//   npx -y @mermaid-js/mermaid-cli -i docs/04-database/erd-overview.md -o /tmp/erd.md

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ERD = 'docs/04-database/erd-overview.md';

// ---------------------------------------------------------------- collect docs

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'docs')).sort();
const read = (p) => readFileSync(p, 'utf8');
const moduleOf = (p) => basename(p).replace(/\.md$/, '');

// ------------------------------------------------------------- parse pgTables
//
// A block runs from `export const X = pgTable('name',` to the next top-level
// `export const` or the end of the fenced code block. Brace-counting is not
// used deliberately: the handbook's blocks are prose-adjacent and occasionally
// elided, and a scanner that tolerates that beats one that throws on it.

const BLOCK = /export const (\w+)\s*=\s*pgTable\(\s*'([a-z_0-9]+)'\s*,/g;

const tables = new Map(); // tableName -> { symbol, module, file, body }
const symbols = new Map(); // drizzle symbol -> tableName
const dups = [];           // a real table name defined outside its owning doc

for (const file of files) {
  if (file.endsWith(ERD)) continue;
  const text = read(file);
  const starts = [...text.matchAll(BLOCK)];
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i];
    const from = m.index + m[0].length;
    const nextExport = text.indexOf('\nexport const ', from);
    const fenceEnd = text.indexOf('\n```', from);
    const ends = [nextExport, fenceEnd].filter((n) => n !== -1);
    const to = ends.length ? Math.min(...ends) : text.length;
    const name = m[2];
    if (tables.has(name)) {
      dups.push(`${name} also defined in ${moduleOf(file)} (owner: ${tables.get(name).module})`);
      continue;
    }
    tables.set(name, { symbol: m[1], module: moduleOf(file), file, body: text.slice(from, to) });
    symbols.set(m[1], name);
  }
}

// --------------------------------------------------------------------- classes
//
// Class is database-conventions.md §2 and is NOT inferable from the presence of
// a tenant_id column — erd-overview.md §5 enumerates the exceptions. That list
// is declared data, owned by the document; everything else is derived.

const CLASS_EXCEPTIONS = {
  tenant_keys: 'platform',
  tenant_feature_flags: 'platform',
  impersonation_sessions: 'platform',
  domain_events: 'platform',
  processed_events: 'platform',
  permissions: 'platform',
};

function classOf(name, t) {
  if (CLASS_EXCEPTIONS[name]) return CLASS_EXCEPTIONS[name];
  const hasTenant = /\.\.\.tenantId\b/.test(t.body) || /tenantId:\s*uuid\('tenant_id'\)/.test(t.body);
  if (!hasTenant) return 'platform';
  return /companyId:\s*uuid\('company_id'\)[^\n]*notNull/.test(t.body) ? 'company' : 'tenant';
}

// ------------------------------------------------------------------ parse FKs

const COLUMN = /(\w+):\s*uuid\(\s*'([a-z_0-9]+)'\s*\)((?:[^;\n]|\n\s{2,}(?!\w+:))*)/g;

const edges = [];
const anomalies = { auditFk: [], unresolved: [], unconstrained: [] };

// database-conventions.md §3: the audit and soft-delete columns are deliberately
// unconstrained (erd-overview.md §7). Any .references() on them is an override
// and gets reported, not silently absorbed into the counts.
const AUDIT_COLS = new Set(['created_by', 'updated_by', 'deleted_by']);

for (const [name, t] of tables) {
  const cls = classOf(name, t);

  // the ...tenantId spread expands to a real FK: uuid('tenant_id').notNull().references(() => tenants.id)
  if (/\.\.\.tenantId\b/.test(t.body)) {
    edges.push({
      table: name, module: t.module, column: 'tenant_id',
      target: 'tenants', targetModule: 'core-schema',
      notNull: true, discriminator: true, class: cls,
    });
  }

  for (const c of t.body.matchAll(COLUMN)) {
    const [, , col, tail] = c;
    // `(): AnyPgColumn =>` is Drizzle's required form for a self-reference
    const ref = tail.match(/\.references\(\(\)(?::\s*\w+)?\s*=>\s*(\w+)\./);
    if (!ref) {
      // A pointer is not decided by its suffix (erd-overview §7 rule 2): `created_by`
      // has no `_id`, and an actor column is as much a pointer as an `_id` one.
      // Widened 2026-08-05 (MANIFEST row 73) — `_by` columns were invisible to this
      // check while §7 rule 2 claimed the suffix decides nothing.
      const isPointer = col.endsWith('_id') || col.endsWith('_by');
      if (isPointer && !AUDIT_COLS.has(col)) anomalies.unconstrained.push(`${name}.${col}`);
      continue;
    }
    if (AUDIT_COLS.has(col)) anomalies.auditFk.push(`${t.module}: ${name}.${col}`);
    const target = symbols.get(ref[1]);
    if (!target) { anomalies.unresolved.push(`${name}.${col} -> ${ref[1]}`); continue; }
    edges.push({
      table: name, module: t.module, column: col,
      target, targetModule: tables.get(target).module,
      notNull: /\.notNull\(\)/.test(tail),
      discriminator: col === 'tenant_id' && cls !== 'platform',
      class: cls,
    });
  }
}

const CORE = new Set(['core-schema', 'database-conventions']);
const net = edges.filter((e) => !e.discriminator);
const crossBoundary = net.filter((e) => e.module !== e.targetModule);
const coreTargeted = crossBoundary.filter((e) => CORE.has(e.targetModule));
const moduleToModule = crossBoundary.filter((e) => !CORE.has(e.targetModule));

// ------------------------------------------------------- parse the ERD diagrams

const erdText = read(join(ROOT, ERD));
const blocks = [...erdText.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);

// left <marker> right : label  — crow's foot reads parent-to-child (§2)
const REL = /^\s*([a-z_0-9]+)\s+([|}o][|o{][.-][.-][|o][|o{])\s+([a-z_0-9]+)\s*:/;

const drawn = [];       // { parent, child, dotted, raw }
const nodes = new Set();
const malformed = [];

for (const b of blocks) {
  for (const line of b.split('\n')) {
    if (!line.trim() || line.trim().startsWith('erDiagram')) continue;
    const m = line.match(REL);
    if (!m) { if (line.trim()) malformed.push(line.trim()); continue; }
    const [, left, marker, right] = m;
    nodes.add(left); nodes.add(right);
    // the "one" side is the parent: its marker ends in | (exactly/zero-or-one)
    const leftIsMany = marker[0] === '}' || marker[1] === '{';
    drawn.push({
      parent: leftIsMany ? right : left,
      child: leftIsMany ? left : right,
      dotted: marker.includes('..'),
      raw: line.trim(),
    });
  }
}

// pseudo-nodes: polymorphic endpoints drawn so the coupling is visible (§7)
const PSEUDO = new Set(['request_target', 'file_owner', 'audit_target']);

// ----------------------------------------------------------------- the checks

const fail = [];
const key = (p, c) => `${p}>${c}`;
const drawnSolid = new Set(drawn.filter((d) => !d.dotted).map((d) => key(d.parent, d.child)));
const drawnAny = new Set(drawn.map((d) => key(d.parent, d.child)));
const reversedSolid = new Set(drawn.filter((d) => !d.dotted).map((d) => key(d.child, d.parent)));

// C1 — every table has a node
for (const name of tables.keys()) {
  if (!nodes.has(name)) fail.push(`C1 no node drawn for table: ${name}`);
}
// C2 — every node is a table
for (const n of nodes) {
  if (!tables.has(n) && !PSEUDO.has(n)) fail.push(`C2 node is not a table: ${n}`);
}
// C3 — every solid edge corresponds to a real FK, correctly oriented.
// Checked against every FK including the discriminator: a diagram may draw
// `tenants ||--o{ users` even though §6 excludes that edge from its counts.
const fkPairs = new Set(edges.map((e) => key(e.target, e.table)));
for (const d of drawn) {
  if (d.dotted) continue;
  if (fkPairs.has(key(d.parent, d.child))) continue;
  fail.push(
    fkPairs.has(key(d.child, d.parent))
      ? `C3 edge drawn backwards: ${d.raw}`
      : `C3 solid edge with no FK behind it: ${d.raw}`
  );
}
// C4 — every semantic FK is drawn somewhere.
//
// Scoping columns (tenant_id, company_id) and actor columns (a *_by or
// *_user_id pointing at users) are excluded: §2 keeps attributes out of the
// diagrams, and drawing ~130 routine scope and actor edges would bury the
// structure the diagrams exist to show. Everything else is structure.
const isScope = (e) => e.column === 'company_id' || e.column === 'tenant_id';
const isActor = (e) => e.target === 'users' && (e.column.endsWith('_by') || e.column.endsWith('_user_id'));

for (const e of net) {
  if (isScope(e) || isActor(e)) continue;
  if (!drawnAny.has(key(e.target, e.table))) {
    fail.push(
      reversedSolid.has(key(e.target, e.table))
        ? `C4 FK drawn backwards: ${e.table}.${e.column} -> ${e.target}`
        : `C4 FK not drawn: ${e.table}.${e.column} -> ${e.target}`
    );
  }
}
// C5 — audit columns carry no FK
for (const a of anomalies.auditFk) fail.push(`C5 audit column carries a FK override: ${a}`);
// C6 — an unconstrained *pointer* column must be declared in §7.
// A trailing _id does not make a column a pointer: op_id is ADR-0003's
// idempotency key and install_id is minted by the device. Both name a thing
// rather than reference a row, so neither has a target to constrain.
const NOT_POINTERS = new Set(['op_id', 'install_id']);
const declared7 = new Set();
for (const row of erdText.matchAll(/^\|\s*`([a-z_0-9]+)`\s*\|([^|]+)\|/gm)) {
  for (const col of row[2].matchAll(/`([a-z_0-9]+)`/g)) declared7.add(`${row[1]}.${col[1]}`);
}
for (const u of anomalies.unconstrained) {
  if (NOT_POINTERS.has(u.split('.')[1])) continue;
  if (!declared7.has(u)) fail.push(`C6 unconstrained pointer not declared in §7: ${u}`);
}
for (const m of malformed) fail.push(`C7 unparseable diagram line: ${m}`);
for (const d of anomalies.unresolved) fail.push(`C8 FK target not found: ${d}`);
// C9 — a real table name defined in a document that does not own it (ADR-0001 §5)
for (const d of dups) fail.push(`C9 duplicate table definition: ${d}`);

// ----------------------------------------------------------------------- report

function tally(list, pick) {
  const m = new Map();
  for (const x of list) m.set(pick(x), (m.get(pick(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

const classes = tally([...tables].map(([n, t]) => classOf(n, t)), (x) => x);
const owners = tally([...tables.values()], (t) => t.module);
const fanIn = tally(net, (e) => e.target).filter(([, n]) => n >= 5);

const out = {
  tables: tables.size,
  classes: Object.fromEntries(classes),
  owners: Object.fromEntries(owners),
  fk: {
    inclusive: edges.length,
    net: net.length,
    discriminator: edges.length - net.length,
    crossBoundary: crossBoundary.length,
    coreTargeted: coreTargeted.length,
    moduleToModule: moduleToModule.length,
  },
  coreSplit: Object.fromEntries(tally(coreTargeted, (e) => e.target)),
  m2mByTarget: Object.fromEntries(tally(moduleToModule, (e) => e.target)),
  fanIn: Object.fromEntries(fanIn),
  moduleToModule: moduleToModule
    .map((e) => `${e.module} | ${e.table}.${e.column} -> ${e.target} (${e.targetModule}) ${e.notNull ? 'NOT NULL' : 'nullable'}`)
    .sort(),
  failures: fail,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`tables                       ${out.tables}`);
  console.log(`  by class                   ${classes.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`foreign keys (inclusive)     ${out.fk.inclusive}`);
  console.log(`  tenant discriminator       ${out.fk.discriminator}`);
  console.log(`foreign keys (net)           ${out.fk.net}`);
  console.log(`  crossing a module boundary ${out.fk.crossBoundary}`);
  console.log(`    -> core-schema           ${out.fk.coreTargeted}  (${Object.entries(out.coreSplit).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`    -> module to module      ${out.fk.moduleToModule}  (${Object.entries(out.m2mByTarget).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`fan-in (>=5, net)            ${Object.entries(out.fanIn).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`\nmodule-to-module inventory (${out.fk.moduleToModule}):`);
  for (const r of out.moduleToModule) console.log(`  ${r}`);
  console.log(`\nchecks: ${fail.length ? `${fail.length} FAILING` : 'all passing'}`);
  for (const f of fail) console.log(`  ${f}`);
}

process.exit(fail.length ? 1 : 0);
