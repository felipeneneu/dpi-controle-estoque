# PROMPT PARA OPENCODE — Agente Espião HP Latex 330
## Backend Node.js / Fastify — Polling de Excel EWS

> Cole este prompt no OpenCode (modo Plan primeiro, depois Build).  
> Contexto: projeto GraficaOS (Electron + Next.js + Fastify + SQLite).  
> O agente roda no PC1 (servidor) e bate no IP da impressora pela rede.

---

## CONTEXTO DO PROJETO

O GraficaOS é um sistema de controle de estoque para gráfica digital. Stack:
- **Frontend:** Next.js 16 (static export) + React 19 + Tailwind + shadcn/ui, embalado no Electron
- **Backend:** Fastify 5 + Drizzle ORM + Turso/LibSQL (SQLite local)
- **Realtime:** Socket.IO
- **Desktop:** Electron (modo servidor no PC1, modo client nos demais PCs)

A gráfica tem 3 impressoras:
- **HP Latex 330** (IP: `192.168.234.10`) — esta é a que vamos integrar agora
- **Mimaki UCJV** — já integrada via parser XML do RasterLink
- **Konica AccurioPrint** — pendente (SNMP + AccurioPro Print Manager)

---

## O QUE FOI DESCOBERTO

A HP Latex 330 tem um **servidor web embutido (EWS)** que expõe uma página de "Contabilização" com histórico completo de jobs. Essa página pode ser exportada como **Excel (.xls)** via URL direta:

```
http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y
```

O Excel contém uma tabela com:
- Nome do arquivo (Documento)
- Tipo de trabalho, Fonte, Estado
- Tipo do substrato (mídia) + Uso de substrato (m²)
- Tinta usada total (ml) + Tinta usada por cor (M, LM, LC, C, OP, Y, K)
- Data da impressão
- Modo de impressão (string parseável: "600dpi - 10P - Bidi - 40ips - Ink-110 - OE")
- Otimização retilínea, Deslocamento atraso interpasse

**A HP está em sub-rede diferente** (`192.168.234.10` vs LAN principal `192.168.1.x`), mas o PC1 consegue acessar diretamente via HTTP.

---

## TAREFA

Implementar um **Agente Espião HP** que rode no backend (PC1), faça polling periódico no IP da impressora, baixe o Excel, processe os jobs e integre com o sistema de estoque existente.

### Arquivos a criar/alterar

```
backend/src/
├── agents/
│   └── hp-latex/
│       ├── index.ts              # Entrypoint do agente
│       ├── downloader.ts         # Baixa o Excel da HP
│       ├── parser.ts             # Parse XLS → JSON
│       ├── job-detector.ts       # Detecta jobs novos vs. banco
│       └── stock-deductor.ts     # Deduz estoque de tinta + mídia
├── db/
│   └── schema.ts                 # Adicionar tabela print_jobs (se não existir)
└── app.ts                        # Inicializar agente no startup do servidor
```

---

## REQUISITOS FUNCIONAIS

### R1 — Download do Excel
- Fazer HTTP GET para `http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y`
- Salvar arquivo temporário em `/tmp` ou pasta `temp/` do projeto
- **NÃO** usar browser/puppeteer — é HTTP direto com `fetch` ou `axios`
- Timeout de 10 segundos
- Se falhar (timeout, 404, 500, ECONNREFUSED), registrar erro e agendar retry

### R2 — Parse do Excel
- Ler o arquivo `.xls` (formato Excel 97-2003, não .xlsx)
- Converter para array de objetos JSON
- Mapear colunas do Excel para campos do schema:
  - `Documento` → `job_name`
  - `Tipo do substrato` → `media_type`
  - `Uso de substrato` → `media_area_m2` (parsear string "0,8639 m²" → número)
  - `Tinta usada` (linha Total) → `ink_total_ml`
  - `Data da impressão` → `print_end_date` (parsear formato "Jul 10, 2026 3:05:02 PM")
  - `Modo de impressão` → `print_mode` (string bruta) + `resolution_dpi`, `pass_count`, `print_direction` (parseados)
  - `Estado` → `status` ("impresso" → "completed", "cancelado" → "cancelled")
- **Tinta por cor:** O Excel tem linhas filhas (sub-rows) para cada cor. Extrair:
  - M → `ink_magenta_ml`
  - LM → `ink_light_magenta_ml`
  - LC → `ink_light_cyan_ml`
  - C → `ink_cyan_ml`
  - OP → `ink_optimizer_ml`
  - Y → `ink_yellow_ml`
  - K → `ink_black_ml`

### R3 — Parse do "Modo de impressão"
String exemplo: `"600dpi - 10P - Bidi - 40ips - Ink-110 - OE"`
- `600dpi` → `resolution_dpi: 600`
- `10P` → `pass_count: 10`
- `Bidi` → `print_direction: 'bidirectional'`
- `Unidi` → `print_direction: 'unidirectional'`
- `OE` → `optimizer_enabled: true`
- `Ink-110` → `ink_profile: '110'`
- Ignorar `40ips` (velocidade, não usada no estoque)

### R4 — Detecção de jobs novos
- Comparar jobs do Excel com jobs já salvos no banco (`print_jobs`)
- Chave única: combinação de `job_name` + `print_end_date` (ou hash)
- Se job já existe → ignorar
- Se job é novo → processar (deduzir estoque + notificar)

### R5 — Deduzir estoque automaticamente
Para cada job novo:
1. **Tinta:** Para cada cor (M, LM, LC, C, OP, Y, K), buscar item no estoque:
   - SKU: `hp_tinta-{cor}` (ex: `hp_tinta-cyan`, `hp_tinta-light-magenta`)
   - Categoria: `tinta`
   - Decrementar `quantity` pelo valor em ml
   - Se `quantity < min_quantity`, emitir alerta Socket.IO
   - Registrar transação em `stock_transactions` (type: 'OUT')

2. **Mídia:** Buscar item no estoque:
   - `name` similar ao `media_type` (ex: "STARPAC Vinil Transparente 1500")
   - Categoria: `midia`
   - Decrementar `quantity` pelo valor em m²
   - Se estoque for em metros lineares, converter m² → m (usando largura padrão da bobina, ex: 1.37m)
   - Registrar transação em `stock_transactions`

### R6 — Notificações em tempo real
- Emitir evento Socket.IO `printer:job_completed` com dados do job
- Emitir evento `notification:new` se estoque ficou baixo após dedução
- Todos os clients conectados (PC2, PC3, PC4, PC-HP) recebem a notificação

### R7 — Polling e Retry
- Intervalo padrão: **60 segundos** (configurável via env `HP_POLL_INTERVAL_MS`)
- Se HP offline (ECONNREFUSED, timeout):
  - Retry com backoff exponencial: 30s → 1min → 2min → 5min → 10min (máx)
  - Logar no console: `[HP Agent] Impressora offline, retry em Xs`
- Se HP voltar após estar offline:
  - Processar TODOS os jobs acumulados no Excel de uma vez
  - Logar: `[HP Agent] Processando N jobs pendentes`

### R8 — Limpeza de arquivos temporários
- Após parsear o Excel, **excluir o arquivo .xls** do disco
- Usar `fs.unlinkSync()` ou equivalente
- Garantir que não acumule arquivos na pasta temp (mesmo se der erro no parse)
- Usar `try/finally` ou `.finally()` para garantir exclusão

### R9 — Configuração
- IP da HP: `HP_LATEX_IP` (env var, default: `192.168.234.10`)
- Intervalo de polling: `HP_POLL_INTERVAL_MS` (env var, default: `60000`)
- Timeout de download: `HP_DOWNLOAD_TIMEOUT_MS` (env var, default: `10000`)
- Habilitar/desabilitar agente: `HP_AGENT_ENABLED` (env var, default: `true`)

---

## REQUISITOS NÃO-FUNCIONAIS

- **Não bloquear o servidor:** O agente deve rodar em background (setInterval), nunca bloquear o event loop
- **Idempotência:** Rodar o agente 2x não deve criar duplicatas no banco
- **Resiliência:** Erros no agente não devem derrubar o servidor Fastify
- **Logs claros:** Todo evento importante deve ter log no console (`[HP Agent] ...`)
- **TypeScript:** Todo código com tipos, sem `any`
- **Sem dependências pesadas:** Para parse de .xls, usar biblioteca leve (ex: `xlsx` do SheetJS, já popular no ecossistema Node)

---

## SCHEMA DO BANCO (adições necessárias)

Se a tabela `print_jobs` ainda não existir, criar:

```sql
CREATE TABLE print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,              -- nome do arquivo + hash da data
  job_name TEXT NOT NULL,            -- nome do arquivo (ex: "Sem título-1.pdf")
  machine_id INTEGER NOT NULL,       -- FK → machines.id (HP Latex = ID fixo)
  rip_type TEXT NOT NULL DEFAULT 'hp-ews',

  -- Tinta (ml)
  ink_cyan_ml REAL DEFAULT 0,
  ink_light_cyan_ml REAL DEFAULT 0,
  ink_magenta_ml REAL DEFAULT 0,
  ink_light_magenta_ml REAL DEFAULT 0,
  ink_yellow_ml REAL DEFAULT 0,
  ink_black_ml REAL DEFAULT 0,
  ink_optimizer_ml REAL DEFAULT 0,
  ink_total_ml REAL DEFAULT 0,

  -- Mídia
  media_type TEXT,                   -- ex: "STARPAC Vinil Transparente 1500"
  media_area_m2 REAL,                -- ex: 0.8639

  -- Parâmetros de impressão
  resolution_dpi INTEGER,
  pass_count INTEGER,
  print_direction TEXT,              -- "unidirectional" | "bidirectional"
  print_mode TEXT,                   -- string bruta do modo
  optimizer_enabled INTEGER DEFAULT 0, -- 0 ou 1
  ink_profile TEXT,                  -- ex: "110"

  -- Status e datas
  status TEXT DEFAULT 'completed',   -- "completed" | "cancelled" | "error"
  print_end_date TEXT,               -- ISO 8601

  -- Controle de estoque
  stock_deducted INTEGER DEFAULT 0,  -- 0 = pendente, 1 = deduzido
  deducted_at TEXT,

  -- Metadados
  raw_data_json TEXT,                -- JSON com dados brutos do Excel (para debug)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_print_jobs_machine ON print_jobs(machine_id);
CREATE INDEX idx_print_jobs_date ON print_jobs(print_end_date);
CREATE INDEX idx_print_jobs_deducted ON print_jobs(stock_deducted);
```

---

## FLUXO COMPLETO (passo a passo)

```
1. Servidor Fastify sobe (PC1)
   └─> Inicializa HP Agent (se HP_AGENT_ENABLED=true)

2. A cada 60 segundos:
   a. Fazer HTTP GET para http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y
   b. Salvar em /tmp/hp-accounting-{timestamp}.xls
   c. Parsear XLS → array de jobs JSON
   d. Para cada job:
      - Verificar se já existe no banco (job_name + print_end_date)
      - Se novo:
        * Inserir em print_jobs
        * Deduzir estoque de tinta (por cor)
        * Deduzir estoque de mídia
        * Registrar transações em stock_transactions
        * Emitir Socket.IO: printer:job_completed
        * Se estoque ficou baixo: emitir notification:new
   e. Excluir arquivo /tmp/hp-accounting-{timestamp}.xls
   f. Logar: "[HP Agent] X jobs processados, Y novos, Z pendentes"

3. Se HP offline:
   a. Logar erro
   b. Agendar retry com backoff
   c. Não excluir nada (não baixou nada)
   d. Quando voltar: processar todos os jobs acumulados de uma vez
```

---

## RESTRIÇÕES

1. **NÃO alterar** lógica de negócio existente (RBAC, usuários, chat, notificações gerais)
2. **NÃO remover** funcionalidades existentes
3. **NÃO adicionar** dependências sem justificar. Para .xls, `xlsx` (SheetJS) é aceitável.
4. **NÃO** fazer o agente rodar no frontend/client — é backend-only
5. **TypeScript** em todo código novo
6. **Testar build** (`npm run build`) sem erro de TypeScript antes de finalizar

---

## CRITÉRIOS DE ACEITE (Checklist)

- [ ] Agente inicia automaticamente quando o servidor sobe
- [ ] Faz polling a cada 60s (configurável)
- [ ] Baixa o Excel da HP via HTTP direto
- [ ] Parseia o XLS corretamente (todos os campos mapeados)
- [ ] Detecta jobs novos (não duplica existentes)
- [ ] Deduz estoque de tinta por cor automaticamente
- [ ] Deduz estoque de mídia automaticamente
- [ ] Emite alerta Socket.IO quando estoque fica baixo
- [ ] Exclui o arquivo .xls após processamento (não acumula no disco)
- [ ] Retry com backoff se HP offline
- [ ] Processa jobs acumulados quando HP volta
- [ ] Logs claros no console com prefixo `[HP Agent]`
- [ ] Build passa sem erro de TypeScript
- [ ] Não quebra o servidor se o agente der erro

---

## COMANDO SUGERIDO NO OPENCODE

```
/opencode

@backend/src/app.ts
@backend/src/db/schema.ts
@backend/src/db/index.ts

Implemente o Agente Espião HP Latex 330 no backend Fastify. O agente deve:
1. Fazer polling em http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y
2. Baixar, parsear e excluir o arquivo .xls
3. Detectar jobs novos e deduzir estoque automaticamente
4. Emitir Socket.IO para notificar clients
5. Ter retry com backoff se impressora offline

Crie os arquivos em backend/src/agents/hp-latex/. Adicione a tabela print_jobs no schema se não existir. Inicialize o agente no app.ts. Valide build e checklist.
```

---

## NOTA SOBRE O EXCEL

O arquivo é `.xls` (Excel 97-2003), não `.xlsx`. A biblioteca `xlsx` (SheetJS) lê ambos.

O Excel da HP usa **vírgula como separador decimal** (ex: "0,8639 m²", "5,517 ml") e **ponto-e-vírgula** pode ser usado como delimitador interno. O parser deve normalizar:
- `"0,8639 m²"` → `0.8639` (número)
- `"5,517 ml"` → `5.517` (número)
- `"Jul 10, 2026 3:05:02 PM"` → ISO 8601

O Excel contém **linhas filhas** (sub-rows) para cada cor de tinta. O parser deve identificar que uma linha é "filha" de outra (provavelmente via indentação ou estrutura de árvore no XLS) e associar as cores ao job pai correto.
