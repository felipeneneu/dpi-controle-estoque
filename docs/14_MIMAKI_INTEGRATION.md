# 14 — Integração Mimaki (M2M)

Guia completo da integração entre o GraficaOS e o Mimaki Tracker Electron.

---

## 1. Visão Geral

O GraficaOS se integra com a impressora **Mimaki** (IP: `192.168.234.28`) através do
aplicativo **Mimaki Tracker Electron**, que envia logs de impressão via API REST (M2M —
Machine-to-Machine).

### Fluxo Principal

```
🖥️ Mimaki Tracker Electron
│
│ POST /api/integrations/mimaki/jobs
│ Header: X-API-Secret: <secret>
▼
💻 GraficaOS Backend (Fastify)
├── Valida schema (Zod)
├── Calcula length_meters = (height_mm × pages × quantity_units) / 1000
├── Busca material por nome (LIKE) na tabela stock_items
│   ├── Encontrado → deduz estoque (transação OUT) + status BOUND
│   └── Não encontrado → status PENDING_BIND + Socket.IO mimaki:unmatched_material
└── Retorna 201 { job_id, length_meters, material_status, stock_item_id }
```

---

## 2. Autenticação M2M

O endpoint de recepção de jobs usa autenticação **M2M** (máquina-máquina), não JWT de usuário.

### Métodos Aceitos

| Método | Header | Exemplo |
|--------|--------|---------|
| `X-API-Secret` | `X-API-Secret: meu_secret_aqui` | `curl -H "X-API-Secret: abc123" ...` |
| `Bearer Token` | `Authorization: Bearer meu_secret_aqui` | `curl -H "Authorization: Bearer abc123" ...` |

### Configuração do Secret

O secret pode ser configurado de duas formas (em ordem de prioridade):

1. **Variável de ambiente** (recomendado para produção):
   ```env
   MIMAKI_INTEGRATION_SECRET="seu_secret_longo_e_aleatorio"
   ```

2. **Tabela `settings`** (fallback para desenvolvimento):
   ```sql
   INSERT INTO settings (key, value) VALUES ('MIMAKI_INTEGRATION_SECRET', 'seu_secret');
   ```

> **Segurança:** Nunca exponha o secret no frontend. Use um valor longo e aleatório.

---

## 3. Endpoint: Receber Job Mimaki

### `POST /api/integrations/mimaki/jobs`

Recebe um job de impressão Mimaki e processa automaticamente.

#### Headers

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| `X-API-Secret` ou `Authorization` | Sim | Secret M2M para autenticação |
| `Content-Type` | Sim | `application/json` |

#### Body (JSON)

```json
{
  "machine_id": "mimaki-001",
  "folder_timestamp": "2026-09-10T14:30:00Z",
  "job_name": "Banner Evento",
  "order_code": "OS-1234",
  "quantity_units": 1,
  "pages": 1,
  "width_mm": 1200,
  "height_mm": 3000,
  "ink_cyan_cc": 15.5,
  "ink_magenta_cc": 12.3,
  "ink_yellow_cc": 8.7,
  "ink_black_cc": 5.2,
  "ink_total_cc": 41.7,
  "raw_material_name": "Vinil Gloss Branco"
}
```

#### Campos Obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `machine_id` | string | ID da máquina Mimaki cadastrada |
| `folder_timestamp` | string | Timestamp da pasta de trabalho |
| `job_name` | string | Nome do job |
| `width_mm` | number | Largura em milímetros |
| `height_mm` | number | Altura em milímetros |

#### Campos Opcionais

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `order_code` | string | null | Código da OS associada |
| `quantity_units` | number | 1 | Quantidade de unidades |
| `pages` | number | 1 | Número de páginas |
| `raw_material_name` | string | null | Nome do material (para auto-deduction) |
| `ink_*_cc` | number | 0 | Consumo de tinta por cor (cc) |

#### Resposta 201

```json
{
  "job_id": "abc123",
  "length_meters": 9.0,
  "material_status": "BOUND",
  "stock_item_id": "stock-001"
}
```

#### Resposta 400

```json
{
  "error": "Invalid input",
  "details": { ... }
}
```

#### Resposta 401

```json
{
  "error": "Missing API secret"
}
```

ou

```json
{
  "error": "Invalid API secret"
}
```

---

## 4. Endpoint: Vincular Material

### `POST /api/integrations/mimaki/jobs/:id/bind-material`

Vincula um item de estoque a um job com material não identificado.

#### Autenticação

JWT (usuário logado) — qualquer role autenticado pode vincular.

#### Body (JSON)

```json
{
  "stock_item_id": "stock-001"
}
```

#### Resposta 200

```json
{
  "success": true
}
```

#### Resposta 404

```json
{
  "error": "Job not found"
}
```

#### Resposta 400

```json
{
  "error": "Job already bound"
}
```

---

## 5. Endpoint: Listar Jobs

### `GET /api/integrations/mimaki/jobs`

Lista jobs recebidos via M2M com status de material.

#### Query Parameters

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `status` | string | Filtrar por `BOUND` ou `PENDING_BIND` |
| `machine_id` | string | Filtrar por máquina |

#### Resposta 200

```json
[
  {
    "id": "abc123",
    "machineId": "mimaki-001",
    "jobName": "Banner Evento",
    "orderCode": "OS-1234",
    "rawMaterialName": "Vinil Gloss Branco",
    "lengthMeters": 9.0,
    "materialStatus": "BOUND",
    "stockItemId": "stock-001",
    "createdAt": "2026-09-10T14:30:00Z"
  }
]
```

---

## 6. Cálculo de Mídia

A quantidade de mídia consumida é calculada automaticamente:

```
length_meters = (height_mm × pages × quantity_units) / 1000
```

**Exemplo:**
- Altura: 3000 mm
- Páginas: 1
- Unidades: 1
- Resultado: (3000 × 1 × 1) / 1000 = **3.0 metros**

---

## 7. Status do Material

| Status | Descrição |
|--------|-----------|
| `BOUND` | Material identificado automaticamente e estoque deduzido |
| `PENDING_BIND` | Material não identificado, requer vinculação manual |

---

## 8. Eventos Socket.IO

### `mimaki:unmatched_material`

Emitido para a sala `estoque` quando um job é recebido com material não identificado.

```json
{
  "job_id": "abc123",
  "order_code": "OS-1234",
  "job_name": "Banner Evento",
  "raw_material_name": "Vinil Gloss Branco",
  "length_meters": 9.0,
  "timestamp": "2026-09-10T14:30:00Z"
}
```

---

## 9. Banco de Dados

### Tabela `mimaki_jobs`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | text | ID único do job |
| `machine_id` | text | FK para machines |
| `folder_timestamp` | text | Timestamp da pasta (único) |
| `job_name` | text | Nome do job |
| `order_code` | text | Código da OS (opcional) |
| `quantity_units` | integer | Quantidade de unidades |
| `pages` | integer | Número de páginas |
| `width_mm` | real | Largura em mm |
| `height_mm` | real | Altura em mm |
| `ink_*_cc` | real | Consumo de tinta por cor |
| `raw_material_name` | text | Nome do material informado |
| `length_meters` | real | Metros lineares calculados |
| `material_status` | text | BOUND ou PENDING_BIND |
| `stock_item_id` | text | FK para stock_items (opcional) |
| `created_at` | integer | Timestamp de criação |

---

## 10. Configuração da Máquina Mimaki

### Cadastro no Sistema

A máquina Mimaki deve estar cadastrada na tabela `machines`:

```sql
INSERT INTO machines (id, name, brand, model, technology, ip, status)
VALUES ('mimaki-001', 'Mimaki UJF-6042', 'Mimaki', 'UJF-6042', 'INKJET', '192.168.234.28', 'ACTIVE');
```

### IP da Máquina

- **IP padrão:** `192.168.234.28`
- **Rede:** Deve estar na mesma LAN do servidor GraficaOS

---

## 11. Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `401 Missing API secret` | Header não enviado | Verificar `X-API-Secret` ou `Authorization` |
| `401 Invalid API secret` | Secret incorreto | Verificar `MIMAKI_INTEGRATION_SECRET` no `.env` |
| `400 Invalid input` | Schema inválido | Verificar campos obrigatórios no body |
| `404 Job not found` | ID inexistente | Verificar o `job_id` retornado |
| Material não deduzido | Nome não encontrado | Verificar se `raw_material_name` corresponde ao cadastrado (busca LIKE) |
| Socket não emite | Sala não conectada | Verificar se frontend está na sala `estoque` |

---

## 12. Segurança

- **Secret M2M:** Use um valor longo e aleatório (mínimo 32 caracteres).
- **HTTPS:** Em produção, use HTTPS para proteger o secret em trânsito.
- **Rate Limiting:** Considere implementar rate limiting no endpoint M2M.
- **Logs:** Monitore os logs de acesso ao endpoint para detectar tentativas inválidas.
- **Rotación:** Rotate o secret periodicamente e atualize no Mimaki Tracker.
