# Estratégia de Testes — GraficaOS

> **Versão:** 1.0.0 · **Status:** ATIVO · **Owner:** Felipe · **Última atualização:** 2026-09-12
> **Pesos:** nenhuma regra de negócio é `IMPLEMENTED` sem teste + linha; ver `docs/governance/DOC_POLICIES.md` P3.

---

## 1. Pirâmide

| Nível | Onde | Ferramenta | Cobre |
|-------|------|------------|-------|
| **Unit (funções puras)** | `backend/src/lib/__tests__/` | vitest | `lib/math.ts` (Big.js, precisão, clamps) |
| **Integration (libs/rotas)** | `backend/tests/{routes,lib,helpers}/` | vitest + Fastify inject + DB in-memory | auth/RBAC, rotas estoque, filas (WA/Mimaki), anti-spam, CORS |
| **E2E (UI real)** | `e2e/specs/` | Playwright + Electron | fluxos: auth, estoque, titlebar |
| **Sniff/API** | — (ver `API.md`) | manual + OpenAPI snapshot | contrato público |

## 2. Convenção de nomeação `BR-*` (regra nova)

A partir deste ciclo, todo teste de **regra de negócio** carrega a sigla da regra no título e
um Sub ID sequencial, fechando o vínculo com `BUSINESS_RULES.md`:

```
it('BR-003.a: divideAreaToLength/areaM2 sobre largura em metros', ...)
it('BR-015.a: despacha 1º alerta LOW e cria notificação', ...)
it('BR-016.c: batch de 3,5s consolida N alertas em 1 mensagem', ...)
```

- **Sufixo**: `a`, `b`, `c`… por teste dentro da mesma regra.
- **Sem regra de negócio**: continua nome descritivo livre (`ids`, `cors`, `password`).
- **Backfill (opcional, lento):** os ~79 testes existentes hoje não têm tag BR-*; mapear na
  coluna `Prova/Teste` do `BUSINESS_RULES.md` (backlog P2).

## 3. Mapeamento atual (testes vs BR-*)

| Arquivo | Cobre principalmente |
|---------|----------------------|
| `tests/routes/users.test.ts` | BR-018 (RBAC) |
| `tests/routes/stock.test.ts` | BR-018, BR-008 (débito), BR-004 (ajuste) |
| `tests/routes/notifications.test.ts` | BR-015 (ack) |
| `tests/lib/dispatch-stock-alert.test.ts` | BR-015 (transição + anti-spam) |
| `tests/lib/whatsapp-queue.test.ts` | BR-016 (batch/dedupe) |
| `tests/lib/whatsapp.test.ts` | BR-016 (reconexão/QR) |
| `tests/lib/mimaki-queue.test.ts` | BR-012 (cálculo linear) |
| `tests/lib/cors.test.ts` | INFRA (origens) |
| `src/lib/__tests__/math.test.ts` | BR-011/012/013 (precisão aritmética) |

## 4. Comandos

```
cd grafica-app/backend && npm test            # unit + integration
npm run build                                  # typecheck dos dois
npx playwright test --config e2e/playwright.config.ts   # E2E (exige app + banco demos)
```

> Backend e frontend usam alias `@/`. Testes importam DB descartável via `tests/setup.ts`.

## 5. Regras de engajamento (test-engineer)

- Regra nova → **teste primeiro** (RED) quando possível (P3 apenas permite IMPLEMENTED com prova
  de teste OU verificação humana datada).
- Fila/timeout nos testes de WhatsApp/Mimaki: FIXMEs de `Math.random` e `setTimeout` são
  aceitos como injeção; jamais `sleep(>500ms)` para simular batch de 3,5s.
- E2E não depende de integração real (mocka impressora).

## 6. Gap (honesto)

- Cobertura das regras de integração (HP/Konica substrato+toner) é **zero em automação** —
  hoje sustentada por agentes no dispositivo + DIAG arquivado. Backlog P1.