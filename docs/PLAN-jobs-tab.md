# PLAN: Jobs Tab — Print Jobs Data Grid in Machine Detail View

## Goal
Add a read-only "Jobs" tab to the machine detail view (inside the existing Máquinas page) that displays auto-detected print jobs from the `print_jobs` table. The tab provides a headless TanStack Table V9 data grid with server-state powered by TanStack Query, debounced search, and month-to-month filtering.

---

## Phase 0: Decisions & Context (Confirmed)

| Item | Decision | Rationale |
|------|----------|-----------|
| **Project Type** | WEB (Next.js App Router + Fastify backend) | `frontend-specialist` for UI, `backend-specialist` for API |
| **Table library** | TanStack Table V9 (`@tanstack/react-table` + `@tanstack/table-core`) | NOT currently installed; must be added |
| **Server state** | TanStack Query v5 (already installed) | Domain-shaped keys, colocated query files, keep server data OUT of zustand |
| **Global client state** | zustand (already installed) — only `auth-store.ts` | Server data stays in react-query cache + URL params for filters |
| **UI framework** | Base UI v1.7 Tabs (`data-active` not `data-selected`), shadcn-style components | Existing pattern in `src/components/ui/tabs.tsx` |
| **Read-only** | No CRUD endpoints for jobs | Jobs are auto-detected from printer; user explicitly chose display-only |
| **Location** | New tab inside `MachineDetailView` at `src/app/(dashboard)/maquinas/page.tsx` lines 401–417 | Alongside existing Status/Consumo/Materiais tabs |
| **Month pattern** | Reuse `currentMonth()` style from `relatorios/page.tsx` (YYYY-MM format) | Existing pattern; `monthRange()` helper in reports route for backend |
| **Backend pattern** | Fastify route with swagger schema, `authenticate` preHandler, drizzle queries | Matches `reports.ts`, `machines.ts` route patterns |
| **React** | 19.2.8 (static export) | No server components needed; all `"use client"` |

### Key Files Confirmed

| File | What it contains |
|------|------------------|
| `src/app/(dashboard)/maquinas/page.tsx` | Machine detail view with Tabs block (lines 401–417) |
| `src/lib/queries/query-keys.ts` | Domain-shaped key factories (userKeys, stockKeys, machineKeys, etc.) |
| `src/lib/queries/reports.ts` | `useConsumptionReport()` — reference for colocated query pattern |
| `src/lib/queries/machines.ts` | `useMachines()`, `useCreateMachine()` — reference for mutation + invalidation |
| `src/lib/api.ts` | `api<T>(url, opts)` fetch helper, `getUser()`, types |
| `src/lib/queries/query-client.ts` | QueryClient config with `defaultStaleTime = 30_000` |
| `src/components/ui/tabs.tsx` | Base UI v1.7 Tabs wrapper (TabsTrigger uses `TabsPrimitive.Tab`, active = `data-active`) |
| `src/components/ui/spinner.tsx` | `LoadingState` component for loading states |
| `backend/src/db/schema.ts` | `printJobs` table definition with all columns |
| `backend/src/routes/reports.ts` | Reference: `monthRange()` helper, drizzle `and(gte, lt)` pattern, `authenticate` |
| `backend/src/app.ts` | Route registration (`await app.register(reportRoutes)`) |

---

## Phase 1: Backend — GET /api/jobs Endpoint

### Task 1.1: Create `backend/src/routes/jobs.ts`

**Create file:** `grafica-app/backend/src/routes/jobs.ts`

**Endpoint:** `GET /api/jobs`

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `machineId` | string | no | — | Filter by machine |
| `month` | string | no | current month | YYYY-MM format; applies month range filter |
| `monthScope` | `'month' \| 'all'` | no | `'month'` | `'month'` = within month range; `'all'` = ignore month |
| `q` | string | no | — | Search by job name or media type (`LIKE %q%`) |
| `page` | number | no | `1` | 1-indexed page |
| `pageSize` | number | no | `20` | Rows per page (max 100) |

**Response Shape:**
```ts
{
  rows: (PrintJob & { machineName: string | null })[]
  total: number
  page: number
  pageSize: number
}
```

**Implementation notes:**
- Follow exact pattern from `reports.ts`: import `FastifyInstance`, drizzle operators, `printJobs`/`machines`, `db`, `authenticate`
- Reuse `monthRange()` helper (copy into `jobs.ts` or extract to shared util — prefer copy to avoid cross-route coupling)
- `monthScope: 'all'` skips `gte`/`lt` date filters
- Search: `like(printJobs.jobName, \`%${q}%\`)` OR `like(printJobs.mediaType, \`%${q}%\`)` combined with `or()` from drizzle-orm
- `leftJoin` machines table on `printJobs.machineId = machines.id` to get `machineName`
- Use `orderBy(desc(printJobs.printEndDate))` for newest-first
- Use `limit`/`offset` with `count()` for total
- Swagger schema: tags `['Jobs']`, summary `'Listar jobs de impressão'`, full querystring/response schema
- Return 400 for invalid `page`/`pageSize`

**Drizzle query skeleton:**
```ts
import { and, gte, lt, like, or, eq, desc, count } from 'drizzle-orm';

// Build conditions array
const conditions = [];
if (query.machineId) conditions.push(eq(printJobs.machineId, query.machineId));
if (query.monthScope !== 'all' && month) {
  const { start, end } = monthRange(month);
  conditions.push(gte(printJobs.printEndDate, start));
  conditions.push(lt(printJobs.printEndDate, end));
}
if (query.q) {
  conditions.push(or(
    like(printJobs.jobName, `%${query.q}%`),
    like(printJobs.mediaType, `%${query.q}%`),
  ));
}
const where = conditions.length > 0 ? and(...conditions) : undefined;

// Paginated rows with machine name
const rows = await db
  .select({
    ...getTableColumns(printJobs),
    machineName: machines.name,
  })
  .from(printJobs)
  .leftJoin(machines, eq(printJobs.machineId, machines.id))
  .where(where)
  .orderBy(desc(printJobs.printEndDate))
  .limit(pageSize)
  .offset((page - 1) * pageSize)
  .all();

// Total count
const [{ total }] = await db
  .select({ total: count() })
  .from(printJobs)
  .where(where)
  .all();
```

### Task 1.2: Register route in `backend/src/app.ts`

**Modify:** `grafica-app/backend/src/app.ts`

- Add `import { jobRoutes } from './routes/jobs.js';` (line ~18, alongside other imports)
- Add `await app.register(jobRoutes);` (after `reportRoutes`, ~line 117)
- Add swagger tag `{ name: 'Jobs', description: 'Jobs de impressão auto-detectados' }` to the `tags` array

### Task 1.3: Backend Verification

- `cd grafica-app/backend && npm run typecheck` — must pass with no errors
- `npm run lint` — must pass
- `curl` test with seeded data:
  ```
  curl http://localhost:3001/api/jobs?machineId=<id>&month=2026-09
  curl http://localhost:3001/api/jobs?q=test&monthScope=all
  curl http://localhost:3001/api/jobs?page=2&pageSize=5
  ```
- Assert: filtering by month returns only rows within range, search matches jobName/mediaType, pagination works

---

## Phase 2: Dependencies — Install TanStack Table V9

### Task 2.1: Install `@tanstack/react-table`

**Command (in `grafica-app/`):**
```bash
npm install @tanstack/react-table
```

**Version target:** Latest v9.x (as of 2026, this will be the `@tanstack/react-table` v9 line). The package internally pulls `@tanstack/table-core` as a dependency — do NOT install `@tanstack/table-core` separately unless the peer dep is broken. After install, verify in `package.json` that the version appears under `dependencies`.

**Compatibility check:**
- `@tanstack/react-table` v9 supports React 18+/19 — compatible with this project's React 19.2.8
- TypeScript 5.x — compatible
- Does NOT require a specific bundler; works with Next.js static export

**Post-install verification:**
- `npm run build` in `grafica-app/` should complete without errors related to the new dep
- Verify `@tanstack/react-table` appears in `package.json` dependencies

---

## Phase 3: Frontend Query Layer

### Task 3.1: Add `jobKeys` to `src/lib/queries/query-keys.ts`

**Modify:** `grafica-app/src/lib/queries/query-keys.ts`

Add at the end:
```ts
export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (filters: { machineId?: string; month?: string; q?: string; page?: number }) =>
    [...jobKeys.lists(), filters] as const,
  detail: (id: string) => [...jobKeys.all, "detail", id] as const,
}
```

**Key design rationale:**
- `jobKeys.all` — root key for invalidating ALL job queries
- `jobKeys.lists()` — all list queries
- `jobKeys.list(filters)` — specific query with exact filter params; ensures cache key includes all filter state so different filter combos have separate cache entries
- `jobKeys.detail(id)` — for potential future detail view

### Task 3.2: Create `src/lib/queries/jobs.ts`

**Create file:** `grafica-app/src/lib/queries/jobs.ts`

**Content:**
```ts
"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { jobKeys } from "@/lib/queries/query-keys"

// --- Types ---

export interface PrintJobRow {
  id: string
  jobId: string
  jobName: string
  machineId: string
  machineName: string | null
  ripType: string
  inkCyanMl: number | null
  inkLightCyanMl: number | null
  inkMagentaMl: number | null
  inkLightMagentaMl: number | null
  inkYellowMl: number | null
  inkBlackMl: number | null
  inkOptimizerMl: number | null
  inkTotalMl: number | null
  mediaType: string | null
  mediaAreaM2: number | null
  resolutionDpi: number | null
  passCount: number | null
  printDirection: string | null
  printMode: string | null
  optimizerEnabled: boolean | null
  inkProfile: string | null
  status: string | null
  printEndDate: string | null
  stockDeducted: boolean | null
  deductedAt: string | null
  rawDataJson: string | null
  createdAt: string | null
}

export interface JobsListResponse {
  rows: PrintJobRow[]
  total: number
  page: number
  pageSize: number
}

export interface JobsFilters {
  machineId?: string
  month?: string
  monthScope?: "month" | "all"
  q?: string
  page?: number
  pageSize?: number
}

// --- Query hook ---

export function useJobs(filters: JobsFilters) {
  const params = new URLSearchParams()
  if (filters.machineId) params.set("machineId", filters.machineId)
  if (filters.month) params.set("month", filters.month)
  if (filters.monthScope) params.set("monthScope", filters.monthScope)
  if (filters.q) params.set("q", filters.q)
  if (filters.page) params.set("page", String(filters.page))
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize))
  const qs = params.toString()

  return useQuery({
    queryKey: jobKeys.list(filters),
    queryFn: () => api<JobsListResponse>(`/api/jobs?${qs}`),
    placeholderData: (prev) => prev,  // keepPreviousData for pagination stability
    staleTime: 30_000,                // match defaultStaleTime
    refetchInterval: 60_000,          // background refetch every 60s
    enabled: !!filters.month || filters.monthScope === "all",
  })
}

// --- Invalidation helper (for future mutations) ---
// When a write action is added later, use:
//   queryClient.invalidateQueries({ queryKey: jobKeys.all })
//   queryClient.invalidateQueries({ queryKey: reportKeys.all })  // consumption report depends on print_jobs
//   queryClient.invalidateQueries({ queryKey: stockKeys.all })   // stock deductions depend on print_jobs

export function useInvalidateJobs() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: jobKeys.all })
  }
}
```

### Task 3.3: Verification

- TypeScript: `cd grafica-app && npx tsc --noEmit` — must compile without errors
- Import check: `jobKeys` importable from `query-keys.ts`, `useJobs` importable from `queries/jobs.ts`
- No server data stored in zustand stores — only in react-query cache

---

## Phase 4: TanStack Table V9 Headless Grid

### Task 4.1: Create `src/components/machine-jobs-table.tsx`

**Create file:** `grafica-app/src/components/machine-jobs-table.tsx`

This is the core data grid component. It uses TanStack Table V9 headless mode with semantic HTML.

#### 4.1a: Stable `tableFeatures` Object

```ts
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type TableState,
} from "@tanstack/react-table"
```

**Feature plugins to include** (only what the product needs):
```ts
const tableFeatures = {
  getCoreRowModel,
  getFilteredRowModel,    // global filter for search
  getPaginationRowModel,  // client-side pagination (server handles page param)
  getSortedRowModel,      // optional: client-side sort if needed
} as const
```

**Note:** TanStack Table V9 uses a function-registry pattern. The `tableFeatures` object above represents the row models. For feature plugins (sorting, filtering, pagination state), configure via `state` and `onStateChange` in `useReactTable`.

#### 4.1b: Column Definitions

```ts
const columnHelper = createColumnHelper<PrintJobRow>()

const columns: ColumnDef<PrintJobRow, any>[] = [
  columnHelper.accessor("jobName", {
    header: "Job",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("printEndDate", {
    header: "Data",
    cell: (info) => {
      const val = info.getValue()
      if (!val) return "—"
      // Format as pt-BR date: DD/MM/YYYY HH:mm
      const d = new Date(val)
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    },
  }),
  columnHelper.accessor("machineName", {
    header: "Máquina",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("mediaType", {
    header: "Mídia",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("mediaAreaM2", {
    header: "Área (m²)",
    cell: (info) => {
      const val = info.getValue()
      return val != null ? val.toFixed(2) : "—"
    },
  }),
  columnHelper.accessor("inkTotalMl", {
    header: "Tinta total (ml)",
    cell: (info) => {
      const val = info.getValue()
      return val != null ? val.toFixed(1) : "—"
    },
  }),
  columnHelper.accessor((row) => `${row.printMode ?? ""} ${row.resolutionDpi ? `${row.resolutionDpi}dpi` : ""}`.trim() || "—", {
    id: "modeResolution",
    header: "Modo / Resolução",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue() ?? "completed"
      return <Badge variant={val === "completed" ? "default" : "secondary"}>{val}</Badge>
    },
  }),
  columnHelper.accessor("stockDeducted", {
    header: "Debitado",
    cell: (info) => {
      const val = info.getValue()
      return val
        ? <Badge variant="default" className="bg-emerald-100 text-emerald-700">Sim</Badge>
        : <Badge variant="secondary">Não</Badge>
    },
  }),
]
```

#### 4.1c: Table Instance & Reactive State

```ts
// Use TanStack Store-backed state (reactive via table.getState())
// External atoms only for slices the app must own: search query (debounced) and month filter
// These are managed via URL search params + React state, NOT zustand

const table = useReactTable({
  data: rows,          // from useJobs().data?.rows ?? []
  columns,
  // Feature registry — only the row models we need
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  state: {
    globalFilter: debouncedQ,       // external: debounced search
    pagination: {
      pageIndex: (page ?? 1) - 1,   // external: 0-indexed for TanStack
      pageSize: pageSize ?? 20,
    },
  },
  manualPagination: true,  // server handles pagination; TanStack just tracks page state
  pageCount: totalPages,   // derived from total / pageSize
})
```

**Reactive reads:** Use `table.Subscribe` or `table.getState()` for reactive reads. Avoid duplicating table state into zustand.

#### 4.1d: Semantic Table Render

```tsx
<div className="overflow-auto rounded-xl border border-gray-100">
  <table className="w-full text-sm">
    <thead>
      {table.getHeaderGroups().map((hg) => (
        <tr key={hg.id} className="border-b border-gray-100 bg-muted/50">
          {hg.headers.map((h) => (
            <th key={h.id} className="px-4 py-3 text-left font-semibold text-muted-foreground">
              {flexRender(h.column.columnDef.header, h.getContext())}
            </th>
          ))}
        </tr>
      ))}
    </thead>
    <tbody>
      {table.getRowModel().rows.map((row) => (
        <tr key={row.id} className="border-b border-gray-50 hover:bg-muted/30 transition-colors">
          {row.getVisibleCells().map((cell) => (
            <td key={cell.id} className="px-4 py-3">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Task 4.2: Verification

- TypeScript compiles without errors
- Semantic `<table>/<thead>/<tbody>/<tr>/<th>/<td>` elements present
- No zustand usage for server data — only `useJobs()` (react-query) + local React state for filters
- `tableFeatures` object contains only needed feature plugins
- `flexRender` used for cell/header rendering

---

## Phase 5: Tab UI Integration + States

### Task 5.1: Add "Jobs" Tab to Machine Detail View

**Modify:** `grafica-app/src/app/(dashboard)/maquinas/page.tsx`

**Changes at lines 401–417:**

```tsx
<Tabs defaultValue="status">
  <TabsList>
    <TabsIndicator />
    <TabsTrigger value="status">Status</TabsTrigger>
    <TabsTrigger value="consumo">Consumo</TabsTrigger>
    <TabsTrigger value="materiais">Materiais</TabsTrigger>
    <TabsTrigger value="jobs">Jobs</TabsTrigger>          {/* NEW */}
  </TabsList>
  <TabsContent value="status">
    <StatusTab machine={machine} />
  </TabsContent>
  <TabsContent value="consumo">
    <ConsumoTab machine={machine} />
  </TabsContent>
  <TabsContent value="materiais">
    <MateriaisTab machine={machine} items={items} canManage={canManage} />
  </TabsContent>
  <TabsContent value="jobs">                             {/* NEW */}
    <JobsTab machine={machine} />
  </TabsContent>
</Tabs>
```

### Task 5.2: Create `JobsTab` Component (inline or separate)

**Option A (recommended):** Extract to `src/components/machine-jobs-tab.tsx` to keep the 700+ line page clean.

**File:** `grafica-app/src/components/machine-jobs-tab.tsx`

**Responsibilities:**
1. Manage filter state: `month` (YYYY-MM), `q` (search string), `page` (number)
2. Sync `month` and `page` to URL search params (`useSearchParams` + `router.replace`) — consistent with existing `?id=` pattern
3. Debounce `q` input (~400ms) using a simple `useDeferredValue` or custom debounce hook
4. Render filter controls: month selector (input type="month"), search input (debounced)
5. Call `useJobs(filters)` and render `<MachineJobsTable>` with the data
6. Handle all UI states:

**UI State Handling:**

| State | What to render |
|-------|----------------|
| `isLoading` (initial) | `<LoadingState label="Carregando jobs..." />` |
| `isError` | Error message + retry button (`refetch()`) |
| `data.rows.length === 0` | Empty state: "Nenhum job encontrado para este período" with icon |
| `isFetching && !isLoading` | Subtle background refetch indicator (e.g., small spinner in header or `opacity-60` on table) |
| `isPreviousData` | Stale-data indicator: small text "Atualizando..." near table header |
| Success with data | Render `<MachineJobsTable>` |

**Filter Controls (pt-BR labels):**
```tsx
<div className="flex items-center gap-3 mb-4 flex-wrap">
  <Input
    type="month"
    value={month}
    onChange={(e) => { setMonth(e.target.value); setPage(1) }}
    className="w-40"
  />
  <Input
    placeholder="Buscar job ou mídia..."
    value={q}
    onChange={(e) => setQ(e.target.value)}
    className="w-64"
  />
  {/* Background refetch indicator */}
  {isFetching && !isLoading && <Spinner className="size-4 text-muted-foreground" />}
</div>
```

**Month selector pattern** (from relatorios page):
```ts
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
```

### Task 5.3: URL Search Param Sync

**Sync these params:** `month`, `q`, `page`

```ts
const searchParams = useSearchParams()
const router = useRouter()

// Initialize from URL
const [month, setMonth] = useState(searchParams.get("jobMonth") ?? currentMonth())
const [q, setQ] = useState(searchParams.get("jobQ") ?? "")
const [page, setPage] = useState(Number(searchParams.get("jobPage")) || 1)

// Sync to URL on change (replace, not push)
useEffect(() => {
  const params = new URLSearchParams(searchParams.toString())
  params.set("jobMonth", month)
  if (q) params.set("jobQ", q) else params.delete("jobQ")
  if (page > 1) params.set("jobPage", String(page)) else params.delete("jobPage")
  router.replace(`?${params.toString()}`, { scroll: false })
}, [month, q, page])
```

**URL naming:** Use `jobMonth`, `jobQ`, `jobPage` prefixes to avoid collision with existing `id` param and future tab-specific params.

### Task 5.4: Debounce Search Input

Use `useDeferredValue` (React 19 native) for the search query:

```ts
const deferredQ = useDeferredValue(q)
```

Pass `deferredQ` to `useJobs()` instead of raw `q`. This gives ~400ms natural debounce behavior without a custom hook.

**Alternative:** If `useDeferredValue` feels too fast/slow, create a small `useDebounce(value, delay)` hook in `src/hooks/use-debounce.ts` using `useState` + `useEffect` + `setTimeout`.

### Task 5.5: Pagination Controls

Render pagination at the bottom of the table:

```tsx
<div className="flex items-center justify-between mt-4 px-4">
  <span className="text-sm text-muted-foreground">
    {total} job{(total ?? 0) !== 1 ? "s" : ""} encontrado{(total ?? 0) !== 1 ? "s" : ""}
  </span>
  <div className="flex items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      disabled={page <= 1}
      onClick={() => setPage((p) => p - 1)}
    >
      Anterior
    </Button>
    <span className="text-sm text-muted-foreground">
      Página {page} de {totalPages}
    </span>
    <Button
      variant="outline"
      size="sm"
      disabled={page >= totalPages}
      onClick={() => setPage((p) => p + 1)}
    >
      Próxima
    </Button>
  </div>
</div>
```

### Task 5.6: Verification

- Tab renders in machine detail view alongside Status/Consumo/Materiais
- Clicking "Jobs" tab loads the jobs data grid
- Search input debounces and filters results
- Month selector changes trigger new query
- Loading state shows spinner
- Empty state shows message when no jobs found
- Background refetch indicator appears during refetch
- Pagination navigates between pages
- URL reflects filter state (`?id=<machine>&jobMonth=2026-09&q=test&jobPage=2`)
- No server data in zustand — only react-query cache + URL params

---

## File-by-File Change List

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `grafica-app/backend/src/routes/jobs.ts` | **CREATE** | New Fastify route: GET /api/jobs with machineId, month, monthScope, q, page, pageSize params |
| 2 | `grafica-app/backend/src/app.ts` | **MODIFY** | Import + register `jobRoutes`; add swagger tag |
| 3 | `grafica-app/package.json` | **MODIFY** | Add `@tanstack/react-table` dependency (via npm install) |
| 4 | `grafica-app/src/lib/queries/query-keys.ts` | **MODIFY** | Add `jobKeys` factory |
| 5 | `grafica-app/src/lib/queries/jobs.ts` | **CREATE** | `PrintJobRow` type, `JobsListResponse` type, `JobsFilters` type, `useJobs()` hook, `useInvalidateJobs()` helper |
| 6 | `grafica-app/src/components/machine-jobs-table.tsx` | **CREATE** | Headless TanStack Table V9 grid with `tableFeatures`, column defs, semantic HTML render, `flexRender` |
| 7 | `grafica-app/src/components/machine-jobs-tab.tsx` | **CREATE** | `JobsTab` wrapper: filter state, URL sync, debounced search, loading/error/empty/stale states, pagination controls |
| 8 | `grafica-app/src/app/(dashboard)/maquinas/page.tsx` | **MODIFY** | Add `TabsTrigger value="jobs"` + `TabsContent value="jobs"` with `<JobsTab machine={machine} />` |

---

## Verification Checklist

### Backend

- [ ] `cd grafica-app/backend && npm run typecheck` — passes
- [ ] `cd grafica-app/backend && npm run lint` — passes
- [ ] `GET /api/jobs` returns paginated rows with `machineName` joined
- [ ] `?machineId=<id>` filters to that machine's jobs only
- [ ] `?month=2026-09` returns only jobs within September 2026
- [ ] `?monthScope=all` ignores month filter and returns all jobs
- [ ] `?q=test` matches `jobName` or `mediaType` containing "test" (case-insensitive LIKE)
- [ ] `?page=2&pageSize=5` returns correct page slice with correct `total`
- [ ] Invalid `page` or `pageSize` returns 400
- [ ] Unauthenticated request returns 401

### Frontend

- [ ] `cd grafica-app && npm run build` — passes (static export succeeds)
- [ ] `npx tsc --noEmit` — passes
- [ ] New tab "Jobs" visible in machine detail view
- [ ] Clicking "Jobs" tab renders the data grid with job rows
- [ ] Search input debounces (~400ms via `useDeferredValue`) and updates query
- [ ] Month selector changes trigger new data fetch
- [ ] Loading state shows `<LoadingState>` spinner
- [ ] Empty state shows "Nenhum job encontrado" message
- [ ] Error state shows error message + retry button
- [ ] Background refetch shows subtle indicator (spinner or opacity)
- [ ] Pagination controls work (Anterior/Próxima)
- [ ] URL params sync: `jobMonth`, `jobQ`, `jobPage` visible in URL
- [ ] Page load with URL params restores filter state
- [ ] No zustand usage for server data (only `auth-store.ts` exists)

### Architecture

- [ ] No server data stored in zustand — only in react-query cache
- [ ] Query keys are domain-shaped (`jobKeys.list(filters)`)
- [ ] Query functions are colocated in `src/lib/queries/jobs.ts`
- [ ] `placeholderData: (prev) => prev` used for pagination stability
- [ ] Semantic `<table>/<thead>/<tbody>/<tr>/<th>/<td>` elements (not divs)
- [ ] `flexRender` used for cell/header rendering
- [ ] TanStack Table `tableFeatures` contains only needed row models
- [ ] External state (month, q, page) synced to URL; table state via TanStack table store

---

## Notes & Future Considerations

1. **Out of scope:** Manual job creation/editing/deletion endpoints. Jobs are auto-detected from the printer agent.
2. **Future mutation pattern:** If a "mark as deducted" toggle is added later, use `useMutation` with targeted invalidation:
   ```ts
   queryClient.invalidateQueries({ queryKey: jobKeys.all })
   queryClient.invalidateQueries({ queryKey: reportKeys.all })
   queryClient.invalidateQueries({ queryKey: stockKeys.all })
   ```
3. **Performance:** For large datasets (>1000 jobs), server-side pagination (already implemented) prevents loading all rows into the client. `getFilteredRowModel` is only used for client-side global filter refinement on the current page.
4. **Mobile responsiveness:** The table uses `overflow-auto` wrapper for horizontal scrolling on small screens. Consider adding `hidden md:table-cell` on less critical columns for mobile.
5. **Background refetch interval:** Set to 60s by default. Could be configurable or reduced during active production hours.
