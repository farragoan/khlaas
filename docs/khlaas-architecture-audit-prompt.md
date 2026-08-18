# Claude Code Prompt — Khlaas Architecture & Database Audit (READ-ONLY)

> Paste everything below into Claude Code. Fill the three bracketed placeholders first.

---

## Role & Context

You are acting as a **staff-level systems architect and database engineer** conducting a formal, read-only audit of Khlaas.

**What Khlaas is:** an OCR-powered restaurant bill-splitting app that is deliberately positioned as a **data company**. The consumer-facing bill-splitting flow is the acquisition wedge; the durable business asset (and monetisation moat) is **dish-level dine-in data** — canonical dishes, per-restaurant menu and price history, extracted from bills — licensed to third parties. This dual nature is central to the audit: Khlaas is simultaneously an **OLTP transactional product** (money, splits, payments, groups) and an **analytical data product** (a curated, sellable dataset with provenance and lineage requirements).

**Stack:** Expo (mobile), SvelteKit (web), Go backend, PostgreSQL. Migration tooling: `[FILL IN — e.g. golang-migrate / goose / atlas]`. Repo root: `[FILL IN]`. Primary schema/migrations path: `[FILL IN]`.

**The strategic premise for this audit:** I suspect the current architecture and schema are wrong for what Khlaas is trying to be. We have little-to-no production data yet, which is the cheapest possible moment to correct the data model — before code, indexes, and downstream consumers harden around a flawed shape. The point of this audit is to decide the *target* model now, so the eventual migration is a one-time, low-cost event.

## Hard Constraints — DO NOT VIOLATE

1. **This is an audit only. Change nothing.** Do not edit, create, delete, or move any source file, schema, or migration. Do not run any migration, DDL, or DML. Do not run formatters or linters that write to disk. Do not `git commit`.
2. The **only** file you may write is the audit report itself, at `docs/audit/2026-architecture-db-audit.md` (create the `docs/audit/` directory if needed). Nothing else.
3. **Ground every finding in observed reality.** Cite `file:line` or the exact table/column for each claim. Never give generic best-practice advice untethered from Khlaas's actual code. If you cannot verify something from the codebase, label it **UNVERIFIED — needs confirmation** rather than assuming.
4. Distinguish clearly between **confirmed problems** (you can point at the evidence) and **suspected problems / open questions**.
5. Do not propose or begin any implementation. The migration plan you produce is a *plan*, not an action.

## Investigation Method (do these in order)

1. **Inventory.** Enumerate every table, view, materialized view, index, constraint, enum, trigger, and function. List every migration in order and note the current schema version.
2. **Reconstruct the current ERD.** Produce a Mermaid `erDiagram` of the schema as it actually is, including cardinalities and FK relationships. Flag missing FKs and implicit/undeclared relationships.
3. **Trace the data flows.** For the two critical paths — (a) a bill being OCR'd → line items extracted → split → settled, and (b) that same extracted data becoming part of the sellable dish/price dataset — map every table touched and every write. Identify where the transactional and analytical concerns are entangled.
4. **Map the code-to-schema boundary.** How does the Go backend talk to Postgres (raw SQL, sqlc, an ORM, query builder)? Where does business logic live relative to the data (in Go, in triggers/functions, split across both)? Identify leaky boundaries.
5. **Assess against the audit dimensions below**, then write the report.

## Audit Dimensions (assess each; rate severity Critical / High / Medium / Low)

**A. Operational (OLTP) schema correctness**
- Normalisation: identify functional-dependency violations, unjustified denormalisation, and update/insert/delete anomalies (1NF→BCNF).
- Keys & identity: natural vs surrogate keys, UUID vs bigint choice and its index/locality implications, composite-key correctness.
- Constraints & integrity: missing FKs, missing `NOT NULL`/`CHECK`/unique constraints, orphan-row risk, money represented as `float` (a red flag — should be integer minor units or `numeric`).
- Data types: timestamp with/without time zone consistency, `jsonb` used as a dumping ground where columns belong, enum vs lookup-table choices.
- Postgres-specific operational hygiene (relevant given prior production incidents): tables lacking a suitable **`REPLICA IDENTITY`**, partitioning strategy (or absence) for high-growth tables, index bloat/redundancy, and anything that will interact badly with autovacuum, logical replication, or a future blue-green upgrade.

**B. Analytical / data-product modelling (the moat)**
- Is the sellable dataset (canonical dishes, restaurants, price history) **separated** from the transactional store, or conflated into it? Argue explicitly for or against separation for Khlaas's scale and roadmap.
- **Entity resolution / master data:** the same dish (e.g. "Butter Chicken" vs "butter chiken" vs "B. Chicken") appears across bills and restaurants with OCR variance. How is canonicalisation/deduplication modelled? Is there a master-data / record-linkage layer, or none?
- **Temporal modelling:** menu prices change over time and Khlaas learns them at OCR time, not menu-change time. Is price history captured as **Slowly Changing Dimensions (Type 2)** and ideally **bitemporally** (valid-time vs transaction-time)? If the price history is being overwritten in place, that is destruction of the core asset — flag as Critical.
- **Provenance & lineage:** is each extracted fact traceable to a source bill, OCR confidence, and extraction version? A licensable dataset needs auditability.

**C. Application architecture**
- Layering and the dependency rule: does domain logic depend on infrastructure, or vice versa? Are there identifiable bounded contexts, or one undifferentiated blob?
- Coupling between the OCR/extraction pipeline, the settlement logic, and the data-asset build.
- Reliability of the write path that feeds the analytical asset — is there risk of losing extracted data if a transaction partially fails (candidate for the **transactional outbox** pattern + CDC rather than dual writes)?

**D. Cross-cutting**
- **Multi-tenancy / access model:** users, groups, restaurants — shared-schema-with-tenant-id vs alternatives; row-level isolation.
- **PII / DPDP:** bills contain PII and payment context. Where does PII live, is it separated from the analytical dataset that gets licensed, and is the licensable dataset de-identifiable by construction? (Treat leakage of PII into the sellable dataset as Critical.)
- **Scalability headroom** toward the stated target (~1.4M MAU): what breaks first, and is it a schema decision that is cheap now and expensive later?

## Frameworks & Books to Reason With (apply the right lens to the right layer)

Use these as analytical lenses, not decoration — name which one drives each significant recommendation.

- **Overall / distributed data thinking:** *Designing Data-Intensive Applications* — Martin Kleppmann.
- **Relational correctness & normalisation:** *Database Design and Relational Theory* — C. J. Date; and *SQL Antipatterns* — Bill Karwin (use its named antipatterns to label concrete findings).
- **The data-product / analytical layer:** *The Data Warehouse Toolkit* — Kimball & Ross (dimensional modelling, star schema, **SCD Type 2**); *Fundamentals of Data Engineering* — Reis & Housley (the data lifecycle, provenance).
- **Identity & entity resolution:** *Data and Reality* — William Kent (what *is* a "dish"? the identity problem is the heart of the moat). Reference **Master Data Management** and record-linkage practice.
- **Architecture & boundaries:** *Domain-Driven Design* — Eric Evans and *Implementing Domain-Driven Design* — Vaughn Vernon (bounded contexts, aggregates); *Clean Architecture* — Robert C. Martin (dependency rule); *Patterns of Enterprise Application Architecture* — Martin Fowler (repository, data mapper, and the **transactional outbox** it inspires).
- **The migration itself:** *Refactoring Databases: Evolutionary Database Design* — Ambler & Sadalage (the **expand/contract**, a.k.a. parallel-change, pattern is the spine of the migration plan). Supplement with *Database Reliability Engineering* — Campbell & Majors for the operational execution mindset.
- Relevant patterns to name where they apply: **CQRS**, **Change Data Capture (CDC)**, **bitemporal modelling**, **transactional outbox**, and OLTP/OLAP separation.

## Required Deliverable — write to `docs/audit/2026-architecture-db-audit.md`

Structure it exactly as:

1. **Executive summary** — the 3–5 findings that actually matter, each with a one-line business consequence (tie to the data moat, PII risk, or settlement correctness). State plainly whether the current architecture is fit for purpose.
2. **Current state** — the reconstructed Mermaid ERD, the two data-flow traces, and the code-to-schema boundary description.
3. **Findings register** — a table: `ID | Dimension | Severity | Finding | Evidence (file:line / table.column) | Framework lens | Confirmed vs Suspected`.
4. **Target architecture** — the proposed corrected model: a target Mermaid ERD, the OLTP/OLAP separation decision (with the argument for it), the entity-resolution approach for dishes, and the temporal/provenance model for the price dataset. Justify each major choice against a named framework and against Khlaas's specific roadmap.
5. **Proposed migration plan (PLAN ONLY — do not execute)** — a phased **expand/contract** sequence, ordered, each phase reversible, each with its risk and its verification step. Explicitly note which changes are near-free *now* (pre-data) and would be expensive later — this is the argument for acting in this window.
6. **Open questions / decisions I need from Dhruv** — anything you could not resolve from the code, and any product decisions that must be settled before the target model is final.

Finish by printing the report path and a 5-bullet summary in the chat. **Do not proceed to implement anything.**
