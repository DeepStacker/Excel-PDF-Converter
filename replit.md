# AuditGen — Bank Audit PDF Generator

A web application for financial audit teams to upload Excel files and generate branch-wise audit PDF reports for configured banks. Replaces a CLI Python script with a full-featured web app accessible from anywhere.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/pdf-generator run dev` — run the frontend (port 25103)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Wouter routing, TanStack Query, shadcn/ui)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- PDF Generation: Python 3 + ReportLab (via child_process spawn)
- File upload: Multer (disk storage)
- ZIP download: Archiver
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/banks.ts` — Bank configuration table
- `lib/db/src/schema/jobs.ts` — Jobs + generated files tables
- `artifacts/api-server/src/routes/banks.ts` — Bank CRUD routes
- `artifacts/api-server/src/routes/jobs.ts` — Job creation, file download, retry routes
- `artifacts/api-server/src/routes/stats.ts` — Dashboard stats endpoint
- `artifacts/api-server/scripts/pdf_generator.py` — Python PDF generation script
- `artifacts/api-server/uploads/` — Uploaded Excel files (runtime)
- `artifacts/api-server/outputs/` — Generated PDFs per job (runtime)
- `artifacts/pdf-generator/src/` — React frontend

## Architecture decisions

- Python PDF generation is kept as a subprocess (not ported to Node.js) to ensure byte-exact PDF output matching the original CLI script
- File uploads use Multer disk storage; files are retained for job retry capability
- PDF jobs run in the background (non-blocking) — frontend polls job status every 3s
- Bank configurations are stored in PostgreSQL as JSONB (columnMapping, pdfStyle, auditTypes) for flexibility without schema migrations when banks are added
- ZIP download streams the archive directly to the response without temp files

## Product

- **Dashboard** — Overview of job stats and recent activity
- **Generate PDFs** — Upload an Excel file, select bank + audit type, trigger generation
- **Job History** — View all past jobs, download individual PDFs or all as ZIP, retry failed jobs
- **Banks Configuration** — Add/edit/delete bank configs with column mappings, PDF styling, and audit types

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Python 3 must be available as `python3` with `reportlab`, `openpyxl`, and `pandas` installed
- Fonts are downloaded on first run to `artifacts/api-server/scripts/fonts/` — requires internet access on first start
- Archiver is a CJS-only package — import via `createRequire` in ESM context
- After adding new DB schema files, run `pnpm run typecheck:libs` before running the api-server typecheck

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
