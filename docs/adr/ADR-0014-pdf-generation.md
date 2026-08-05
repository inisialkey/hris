# ADR-0014: PDF Generation

Status: Accepted · Date: 2026-08-02 · Deciders: product owner + engineering (D8 confirmed Phase 0; this ADR settles the D8 open question vs. pdfmake)

## Context

PDF consumers: payslips (volume driver — up to 10k per run, D1), Form 1721-A1, report exports, training certificates, asset handover documents. All are formal artifacts that may be re-fetched years later and must match what was originally issued (D4: payroll/tax ≥ 10 years). D8 proposed server-side HTML→PDF via Puppeteer behind a `PdfService` interface and asked this ADR to confirm against pdfmake. Locales: id + en (D12).

## Decision

**Puppeteer (headless Chromium) HTML→PDF behind `PdfService` — confirmed. pdfmake rejected.**

### Service contract

`PdfService.generate(documentType, locale, data, options) → Result<{ fileId }>` — renders, then stores through the document-storage pipeline (ADR-0009, "generated documents" category) and returns the metadata row. Callers never touch bytes or paths.

### Generate once, store, serve stored

A document is rendered **exactly once**, at issuance, and archived in Firebase Storage under the payroll/tax retention class. Every later download serves the stored artifact via signed URL. Regeneration is never the archival strategy — template drift, Chromium upgrades, and data edits can't silently rewrite an issued payslip. The template version and renderer version are stamped into the file metadata (payslips additionally into the ADR-0012 calculation trace).

### Rendering architecture

- PDF rendering happens **only in workers** (`payroll`/`exports`/`reports` queues) — never inline in an HTTP request. Payslip generation is a post-approval job chunked like ADR-0012 calculation batches; it sits outside the 30-minute calculation budget. **It sat outside every other budget too, until `performance.md` §7.3 gave it one** *(2026-08-04)* — and the arithmetic does not currently fit. Chromium's 100–200 MB of resident memory per render lands inside the same cgroup as the Node heap, and `worker` has a 1Gi memory limit with `NODE_OPTIONS` at roughly 75% of it: **one concurrent render per pod, with no margin.** Two pods is ~2 renders/s against a month-end fleet requirement near 12/s. `pdf` concurrency stays at 1 per pod, and the resolution is a values-file choice environments §7.2–§7.3 owns: more `worker` memory, or the render-queue split that section already named as a trigger.
- One pooled Chromium per worker process: page-per-job, bounded page concurrency, browser recycled after N renders (memory hygiene). Chromium ships in the worker image (D5 containers), pinned version, **sandbox enabled, non-root** — `--no-sandbox` is prohibited (security-standards).
- **No network during render:** request interception blocks all external fetches; fonts (subset, embedded) and assets are local files. Crafted data can't turn the renderer into an SSRF client.

### Templates

- React server rendering (`renderToStaticMarkup`) — type-safe props, no string-concatenated HTML, same skill set as the admin app; print CSS; A4 default.
- Per document type + locale, versioned in the backend repo; user-supplied rich text does not exist in V1 documents — templates render structured server data only.
- Layout specifics (payslip fields, 1721-A1 form fidelity) belong to their module docs.

## Alternatives considered

- **pdfmake (programmatic JSON doc-definitions).** Rejected: replicating official form layouts (1721-A1) in a coordinate/JSON model is punishing; Indonesian string lengths make CSS wrapping/pagination the safer i18n tool; templates stop being designer-reviewable. Its win — no Chromium — matters less once rendering is pooled in workers. Revisit only if Chromium ops cost proves intolerable.
- **wkhtmltopdf.** Rejected: abandoned engine, ancient WebKit, known CSS gaps.
- **Playwright.** Equivalent capability; D8 names Puppeteer — accepted as-is. Playwright is the documented drop-in if Puppeteer maintenance stalls; the `PdfService` boundary makes the swap invisible.
- **Client-side generation.** Rejected: tamperable artifacts, device-dependent output, mobile memory.
- **Hosted PDF APIs (DocRaptor, PDFShift).** Rejected: employee salary data leaves the residency boundary (A-003), per-document pricing at 10k/run.
- **LaTeX/Typst.** Rejected: skill-set mismatch, no shared design tokens with the web stack.

## Tradeoffs

Chromium adds ~300 MB to the worker image and ~100–200 MB peak per render — bounded by page-concurrency caps and browser recycling, and only worker images pay it. Pixel output can shift across Chromium versions — version pinned, upgrades gated by golden-render diff tests, and stored artifacts make historical fidelity a non-issue by construction. Store-once costs storage — already mandated by the D4 retention class; storage is cheaper than a fidelity dispute.

## Consequences

- `docs/05-platform/document-storage.md`: "generated documents" category is the archive target; serving is signed-URL only.
- `docs/06-modules/payroll.md`: payslip job (chunking, progress, failure subset), payslip template data contract; `tax-pph21.md`: 1721-A1 template contract.
- `docs/07-operations/environments.md`: worker image sizing + Chromium seccomp profile — **discharged 2026-08-04** (`environments.md` §7.3, §7.5). Sizing puts `worker` at 500m/1Gi with memory requests equal to limits and `--max-old-space-size` at ~75% of the limit, with `PDF_PAGE_CONCURRENCY` and `PDF_RECYCLE_AFTER` as the registry variables carrying this ADR's bounded-concurrency and browser-recycling rules. The seccomp answer is the sharp one: this ADR prohibits `--no-sandbox`, and under `RuntimeDefault` Chromium's layer-1 sandbox cannot start at all — which is exactly why `--no-sandbox` is ubiquitous. Resolved as a **`Localhost` profile derived from `RuntimeDefault` adding exactly three syscalls — `clone` with `CLONE_NEWUSER`, `unshare`, `setns`** — DaemonSet-placed and referenced only by `worker`, so the widening is enumerable. `SYS_ADMIN` was rejected as near-root for a PDF. Residual: the profile is a node-level file, the one place D5 portability leaks, exiting when pod user namespaces land (A-115). Also: ci-cd.md: golden-render diff tests. **Discharged 2026-08-04, and placed differently than this line assumed** — a threshold belongs to testing-strategy under the seam `ci-cd.md` §1 sets, so the check is `docs/07-operations/testing-strategy.md` §13 **G21** and ci-cd.md §5 only maps it to a job. Substance also changed: it asserts **structure, not pixels** — page count, every required label and total present, no overflow marker. Pixel-diffing PDFs is rejected because a Chromium bump changes font hinting, so the baseline breaks on unrelated upgrades, while text assertions catch what actually goes wrong: a missing field, a blank page, a broken total.
- Fonts subset + embedded per design-system typography once `design-system.md` lands.

## Future considerations

Digital signing / e-Meterai integration when legally driven — signs the stored artifact, no renderer change. PDF/A archival profile if auditors require. If a lighter renderer (e.g. Chromium headless-shell or a maintained successor) halves the footprint, swap inside `PdfService` without a new ADR — the contract and store-once policy are the decisions here.
