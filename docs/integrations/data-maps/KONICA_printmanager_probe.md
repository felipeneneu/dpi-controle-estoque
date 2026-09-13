# Konica Minolta C3070 — PrintManager Data Map (Discovery T1)

> **Data:** 08/09/2026 — Probes realizados diretamente no equipamento real.
> **Fonte consultada:** AccurioPro ProfiWEB (PrintManager) em `http://192.168.234.68:30083` e
> Web Connection do dispositivo em `http://192.168.234.67` (`/wcd`).

## Endpoints Testados

| URL | Código | Tipo | Observação |
|-----|--------|------|------------|
| `http://192.168.234.67/` | 200 | text/html | Frame que redireciona p/ `/wcd/index.html` (Web Connection do dispositivo). |
| `http://192.168.234.67/wcd/index.html` | 200 | text/html | Web Connection (bizhub) — configuração/estado do equipamento. Sem feed de jobs por job. |
| `http://192.168.234.67/printmanager.html` | 404 | html | Não existe nesta IP. |
| `http://192.168.234.68:30083/printmanager.html` | 200 | text/html | **PrintManager** (SPA Angular `ng-app="profiweb"`). |
| `http://192.168.234.68:30083/` | 200 | text/html | Serve o printmanager.html (base do online-check). |
| `http://192.168.234.68:30083/bundle.js` | 200 | text/javascript | 5,3 MB — bundle da SPA (202 endpoints `.fcgi` mapeados). |
| `http://192.168.234.68:30083/register.fcgi` | 200 | application/json | **Sessão:** `{"sessionId":"...","viewId":0}`. **Sem login.** |
| `http://192.168.234.68:30083/jobList.fcgi?containerId=268435444&sessionId=...&viewId=0` | 200 | application/json | **Histórico de jobs concluídos** (usado pelo agente). |
| `http://192.168.234.68:30083/jobList.fcgi` (no params) | 200 | json | `{"result":{"type":"error",...}}` — pede parâmetros. |
| `http://192.168.234.68:30083/alive.fcgi` | 200 | json | `{"result":{"type":"ok"}}` — heartbeat. |
| `http://192.168.234.68:30083/accountingDownload.fcgi` | 200 | json | Exige `password` (admin) — CSV com histórico limitado. **Não usado** (sem credencial). |
| `http://192.168.234.68:30083/accountingGetLimits.fcgi` | 200 | json | Exige `password` (admin). |
| `http://192.168.234.68:30083/jobDetails.fcgi` | 200 | json | Só aceita containers `hold/hdd/secure/activeHold` — **não** finished. |
| `http://192.168.234.68:30083/deviceInfo.fcgi`, `masterList.fcgi`, `paperProfileList.fcgi`, `sessionLogin.fcgi` | 200 | json | Precisam de parâmetros/sessão; não usados para jobs. |

## Auth

- **Sessão:** `GET /register.fcgi` → `{sessionId, viewId}` (mesma para todas as chamadas).
  O printmanager.html da SPA faz isso ao carregar. As chamadas seguintes mandam
  `sessionId` + `viewId` como query string.
- **Login:** `POST /sessionLogin.fcgi` (params `username,userpassword,accountname,accountpwd`)
  existem, mas o `jobList` do container FINISHED funciona **sem autenticação**.
- Tratamento no fetcher: se a resposta vier `{"result":{"type":"error"}}` (sessão expirada),
  re-registrar a sessão e repetir uma vez.

## Campos Descobertos (exemplo real, job 184)

```json
{
  "jobId": 184,
  "name": "Loja 49 - STOPPER.pdf",
  "owner": "Gustavo",
  "pages": 1,
  "jobType": "print",
  "pagesPrinted": 1,
  "copiesPrinted": 1,
  "datePrintStart": 1788918268,
  "datePrintEnd": 1788918368,
  "dateRipStart": 1788918265,
  "dateRipEnd": 1788918266,
  "ripDuration": 1,
  "jobReceptionDate": 1788918265,
  "colorPagesPrinted": 1,
  "isPrinted": "False",
  "result": "ok",
  "printFeatures": {
    "TargetPaperSize": "Custom",
    "Layout": "None",
    "MediaTypeAuto": "CoatedG",
    "mainPaperProfileName": ""
  }
}
```

| Campo | Semântica | Uso no agente |
|-------|-----------|---------------|
| `jobId` | Inteiro **monotônico** (1..184 observado) | Chave de dedupe → `konica_<jobId>` |
| `name` | Nome do job (usado pelo operador, pode ter "couche 250g" etc.) | `jobName`; dica de gramatura |
| `pages` | Páginas de origem (niil p/ jobs que nunca imprimiram) | `pages` |
| `pagesPrinted` | **Impressões físicas = páginas × cópias** (ex.: 1×3=3) | **`sheets` (folhas debitadas)** |
| `copiesPrinted` | Cópias | `copies` (contexto) |
| `monochromePagesPrinted` | Impressões mono | (contexto) |
| `colorPagesPrinted` | Impressões coloridas | `colorMode` = Color/Mono |
| `datePrintStart` / `datePrintEnd` | **Unix seconds** (1788918368 = 09/08/2026 22:46) | `printEndDate` (ISO) |
| `result` | `ok` / `userCancel` | Só jobs `ok` são debitados |
| `printFeatures.TargetPaperSize` | `A4` / `A3` / `13x19` / `Custom` / `Auto` | Token de tamanho do papel |
| `printFeatures.MediaTypeAuto` | `Plain` / `CoatedG` / `NoSet` | Token de classe (`sulfite` / `couche` / vazio) |
| `printFeatures.mainPaperProfileName` | Sempre vazio nos jobs observados | — |
| `owner` | Usuário do painel | (contexto) |
| `isPrinted` | Sempre `"False"` (string) mesmo em `ok` | Não usado |

## Mecanismo Real-time

- O ProfiWEB faz **polling de `jobList.fcgi`** (~2s na SPA) e também tem push via WebSocket
  (`websocketSrv`). Para o agente, **polling JSON de `jobList.fcgi` a cada 30s** é suficiente
  e não exige scraping.
- Retenção do container FINISHED: observados **180 jobs, do 29/01/2025 até hoje**
  (192 jobs/mês de folga — folga longa). IDs nunca reutilizados na janela.
- **Limitação conhecida:** a lista é uma janela dos últimos ~180 jobs; se >180 jobs forem
  impressos entre dois polls, alguns poderiam cair da janela sem serem debitados. Improvável
  na operação atual (descartado).

## Decisões fechadas (D2/D3/D5/D6/D7)

| Decisão | Resultado |
|---------|-----------|
| **D2 — unidade de débito** | `unit: 'fls'`/`rms`; **`sheets = pagesPrinted`** (impressões físicas já incluem cópias; sem duplex exposto → 1 folha por impressão). |
| **D3 — toner** | **NÃO exposto por job** (nada de consumo/gramas por cor). Débito de toner = **ajuste manual**; mapa `KONICA_TONER_COLOR_MAP` fica pronto para um futuro campo. |
| **D5 — dedupe** | `konica_<jobId>` (jobId real, monotônico). Fallback hash `konica_<hash(name::endDate)>`. |
| **D6 — aquisição** | Polling JSON `jobList.fcgi` ✔ (sem scraping; `cheerio` desnecessário). |
| **D7 — auth** | Sem login para `jobList` (sessão register.fcgi). `KONICA_USER/PASS` não são usados até aparecer necessidade. |
| **P2/P3/P5** | Nome/gramatura específica do papel **não é exposta** por job; `MediaTypeAuto`+`TargetPaperSize` + dica de gramatura no `name` é o melhor sinal disponível. Sides/duplex não exposto. |

## Matching de papel (stock-deductor)

1. Parser deriva `paperName` = `[classe][tamanho]`, ex.: `"couche a4"`, `"sulfite a4"`, `"couche 13x19"`.
2. `normalizeMediaName` remove acentos (NFD) — necessário pois `couché` vs `couche`.
3. Match por **tokens** (todos contidos no nome do item, ordem independente) + **gramatura**
   do `name` do job quando presente (ex.: "250g" escolhe `Couché A4 250g`).
4. Se não houver item, **não debita** e loga warning (mesmo comportamento do HP).

## Stack / dependências

- Nenhuma dependência nova: TypeScript ESM + `fetch` nativo (Node 20). `cheerio` **não** necessário.
- Offline check usa a própria base `KONICA_URL` (`/` → 200).