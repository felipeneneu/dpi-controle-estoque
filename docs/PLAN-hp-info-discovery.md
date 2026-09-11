# PLAN — HP Latex 330: Descoberta de Fontes de Dados

> **Modo:** Discovery / Levantamento (sem escrita de código de produção)
> **Data:** 2026-09-03
> **Caminho do plano:** `docs/PLAN-hp-info-discovery.md`
> **Caminho do relatório de descoberta (saída):** `docs/HP_LATEX_330_DATA_MAP.md`

---

## 1. O que JA e puxado hoje

| Fonte | Endpoint | Dados extraidos | Status |
|-------|----------|-----------------|--------|
| EWS accounting.xls | `http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y` | job_name, media_type, media_area_m2, ink por cor (C/LC/M/LM/Y/K/OP), ink_total_ml, print_end_date, print_mode, resolution_dpi, pass_count, print_direction, optimizer_enabled, status | **Implementado** em `grafica-app/backend/src/agents/hp-latex/` |

**Arquivos existentes:**
- `downloader.ts` — HTTP GET + cleanup do .xls
- `parser.ts` — Parse XLS → ParsedJob (inclui parse pt-BR: virgula→ponto)
- `job-detector.ts` — Deduplica por job_name + print_end_date
- `stock-deductor.ts` — Deduz estoque (tinta + midia) + notifica via Socket.IO + WhatsApp
- `index.ts` — Orquestra polling com backoff

---

## 2. Fontes de dados NAO mapeadas (o que queremos descobrir)

### 2a. EWS Web Access — Outros endpoints HTTP

A HP Latex 330 (e linhas similares como 315/335/360/570) tem um EWS completo. Alem do accounting.xls, endpoints comuns incluem:

| Possivel endpoint | Dados esperados | Como validar |
|-------------------|-----------------|--------------|
| `/hp/device/` (raiz) | HTML com links para todas as paginas do EWS | Abrir no navegador, inspecionar |
| `/hp/device/webAccess/` | Pagina de contabilizacao (ja mapeada) | Ja validado |
| `/hp/device/info_deviceStatus.xml` ou `.json` | Status geral: Idle/Printing/Error, temperatura, uptime | curl ou browser |
| `/hp/device/info_config.xml` ou `.json` | Configuracao: IP, nome, firmware version, idioma | curl ou browser |
| `/hp/device/info_maintenance.xml` ou `.json` | Contadores: total_impressoes, tempo_de_cabeca, ciclos_de_limpeza, HEAD_REPLACEMENT_COUNT | curl ou browser |
| `/hp/device/info_supplies.xml` ou `.json` | Niveis de cartuchos: % restante por cor, ml estimados, vida util | curl ou browser |
| `/hp/device/info_alerts.xml` ou `.json` | Alertas/erros ativos e historico | curl ou browser |
| `/hp/device/webAccess/usage_report.csv` ou `.xls` | Relatorio de uso (possivelmente mais detalhado que accounting) | tentar download |
| `/hp/device/webAccess/media_log.csv` | Log de midia utilizada | tentar download |

> **IMPORTANTE:** Endpoints exatos variam por firmware. A HP Latex 330 pode usar `.xml`, `.json`, ou HTML. O discovery real sera feito com curl/navegador no IP da impressora.

### 2b. SNMP (se habilitado)

A HP Latex 330 suporta SNMP v1/v2c. Porta padrao: **161/UDP**.

| OID classico HP | Dados |
|------------------|-------|
| `1.3.6.1.2.1.25.3.5.1.1.1` | Horas de operacao da head |
| `1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.x` | Contador de pages por cor |
| `1.3.6.1.4.1.11.2.3.9.4.2.1.1.1.x` | Nivel de supply (%) por slot |
| `hrPrinterStatus` | Estado geral (idle/printing/warmup/error) |

> **Necessario:** Verificar se SNMP esta habilitado na impressora (menu de configuracao de rede). Se sim, mapear OIDs com `snmpwalk -v2c -c public 192.168.234.10`.

### 2c. Metodos de descoberta

| Metodo | Comando/Passo | O que revela |
|--------|---------------|--------------|
| Navegar na raiz | Abrir `http://192.168.234.10/` no Chrome | Mapa completo de links do EWS |
| View Source | Inspect Element → Sources/Network na pagina raiz | URLs de endpoints, chamadas JS/AJAX |
| accounting.xls | `curl -o test.xls "http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y"` | Ja mapeado |
| Testar XML/JSON | `curl http://192.168.234.10/hp/device/info_deviceStatus.xml` | Status em formato estruturado |
| Testar SNMP | `snmpwalk -v2c -c public 192.168.234.10 1` | MIB inteira da impressora |
| Exportar relatorios | Testar URLs com `.csv`, `.xls`, `.pdf` em `/hp/device/webAccess/` | Relatorios adicionais |

---

## 3. Tarefas acionaveis e verificaveis

### Tarefa 1 — Mapear a pagina raiz do EWS
- **Acao:** Abrir `http://192.168.234.10/` no navegador e documentar todos os links/endpoints visiveis
- **Entrada:** Navegador web apontando para o IP da HP
- **Saida:** Lista de URLs encontradas (HTML source)
- **Verificacao:** Salvar screenshot ou copiar HTML em `docs/HP_LATEX_330_DATA_MAP.md` secao "EWS Root"
- **Tempo estimado:** 5 min

### Tarefa 2 — Testar endpoints de status XML/JSON
- **Acao:** Testar os endpoints comuns e registrar quais retornam 200 vs 404:
  ```
  curl -v http://192.168.234.10/hp/device/info_deviceStatus.xml
  curl -v http://192.168.234.10/hp/device/info_deviceStatus.json
  curl -v http://192.168.234.10/hp/device/info_config.xml
  curl -v http://192.168.234.10/hp/device/info_maintenance.xml
  curl -v http://192.168.234.10/hp/device/info_supplies.xml
  curl -v http://192.168.234.10/hp/device/info_alerts.xml
  ```
- **Entrada:** Terminal com curl
- **Saida:** Tabela HTTP Status + tamanho da resposta + trecho do body
- **Verificacao:** Documentar em `docs/HP_LATEX_330_DATA_MAP.md` secao "Endpoints Testados"
- **Tempo estimado:** 10 min

### Tarefa 3 — Exportar e analisar o XML/JSON de status
- **Acao:** Para cada endpoint que retornar 200, baixar o conteudo completo e mapear a estrutura
- **Entrada:** Arquivos XML/JSON brutos
- **Saida:** Documentacao de cada campo: nome, tipo, significado, valor atual
- **Verificacao:** Secao "Campos Descobertos" no relatorio com ao menos 10 campos documentados
- **Tempo estimado:** 15 min

### Tarefa 4 — Verificar SNMP
- **Acao:** Testar se SNMP responde na porta 161:
  ```
  snmpwalk -v2c -c public 192.168.234.10 1.3.6.1.2.1.1
  ```
  Se responder, mapear OIDs relevantes para niveis de tinta e status
- **Entrada:** Terminal com `snmpwalk` (instalar `net-snmp` se necessario)
- **Saida:** Tabela de OIDs validos + valores
- **Verificacao:** Secao "SNMP" no relatorio (ou "SNMP: Nao disponivel" se nao responder)
- **Tempo estimado:** 10 min

### Tarefa 5 — Testar outros relatorios exportaveis
- **Acao:** Testar URLs de download adicionais:
  ```
  curl -v "http://192.168.234.10/hp/device/webAccess/usage_report.csv"
  curl -v "http://192.168.234.10/hp/device/webAccess/media_log.csv"
  curl -v "http://192.168.234.10/hp/device/webAccess/supplies_report.xls"
  ```
- **Entrada:** Terminal com curl
- **Saida:** Quais URLs funcionam + amostra do conteudo
- **Verificacao:** Secao "Relatorios Exportaveis" no relatorio
- **Tempo estimado:** 10 min

### Tarefa 6 — Montar o relatorio final
- **Acao:** Consolidar todas as descobertas em `docs/HP_LATEX_330_DATA_MAP.md`
- **Entrada:** Saidas das tarefas 1-5
- **Saida:** Documento completo e navegavel
- **Verificacao:** Arquivo existe, tem todas as secoes, campos documentados com tipo e exemplo
- **Tempo estimado:** 15 min

---

## 4. Ordem de execucao e dependencias

```
Tarefa 1 (Navegar raiz EWS)          ← independent, first step
    ↓
Tarefa 2 (Testar endpoints XML/JSON) ← depende de Tarefa 1 (saber quais URLs testar)
    ↓
Tarefa 3 (Analisar conteudo)         ← depende de Tarefa 2 (precisa de respostas 200)
Tarefa 4 (SNMP)                      ← independent (pode rodar em paralelo com 2/3)
Tarefa 5 (Relatorios exportaveis)    ← independent (pode rodar em paralelo com 2/3)
    ↓
Tarefa 6 (Montar relatorio final)    ← depende de todas anteriores
```

---

## 5. Arquivo de saida esperado

**Caminho:** `docs/HP_LATEX_330_DATA_MAP.md`

**Secoes obrigatorias:**
1. Resumo (o que a HP Latex 330 expoe)
2. EWS Root (links encontrados na pagina principal)
3. Endpoints Testados (tabela: URL, HTTP status, tamanho, tipo de conteudo)
4. Campos Descobertos (tabela: campo, tipo, valor exemplo, endpoint de origem)
5. Relatorios Exportaveis (quais URLs de download funcionam)
6. SNMP (OIDs validos ou "Nao disponivel")
7. Proximos Passos (quais dados valem integrar ao GraficaOS)

---

## 6. Perguntas em aberto

| # | Pergunta | Impacto |
|---|----------|---------|
| P1 | A HP Latex 330 da gráfica tem firmware que suporta endpoints JSON/XML ou apenas HTML? | Determina se podemos puxar dados estruturados via HTTP |
| P2 | SNMP esta habilitado na impressora? (precisa ir ate o painel da maquina) | Se sim, fonte adicional de dados em tempo real |
| P3 | Existe credencial de autenticacao no EWS? (algumas HPs pedem user/senha) | Pode bloquear acesso a endpoints sensiveis |
| P4 | A sub-rede 192.168.234.x permite comunicacao SNMP (porta 161 UDP)? | Firewall pode bloquear |

---

## 7. Fase X — Verificacao

### Criterios de conclusao

| Check | Metodo | Status |
|-------|--------|--------|
| [ ] Pagina raiz do EWS acessivel | Abrir http://192.168.234.10/ no navegador → HTTP 200 | |
| [ ] accounting.xls continua funcionando | `curl -o /dev/null -w "%{http_code}" "http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y"` → 200 | |
| [ ] Ao menos 3 endpoints testados | Documentar resultado de cada curl na Tarefa 2 | |
| [ ] Estrutura XML/JSON documentada | Pelo menos 10 campos com nome, tipo e valor exemplo | |
| [ ] SNMP verificado | snmpwalk executado OU documentado como indisponivel | |
| [ ] Relatorio final criado | `docs/HP_LATEX_330_DATA_MAP.md` existe e tem todas as secoes | |
| [ ] Build do backend nao quebra | `npm run build` em grafica-app/backend continua passando (nenhum codigo novo foi adicionado) | |

### Comandos de verificacao

```bash
# Testar se a HP responde na raiz
curl -v -o /dev/null -w "HTTP %{http_code}\n" http://192.168.234.10/

# Testar accounting.xls (ja validado, redundancia)
curl -v -o /dev/null -w "HTTP %{http_code}\n" "http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y"

# Testar endpoint de status (exemplo)
curl -v -o /dev/null -w "HTTP %{http_code}\n" http://192.168.234.10/hp/device/info_deviceStatus.xml

# Verificar SNMP
snmpwalk -v2c -c public 192.168.234.10 1.3.6.1.2.1.1 2>&1 | head -20

# Confirmar que o relatorio foi criado
dir docs\HP_LATEX_330_DATA_MAP.md
```

---

## 8. Entregaveis

| Entregavel | Formato | Depois de |
|------------|---------|-----------|
| `docs/PLAN-hp-info-discovery.md` | Este plano | Agora |
| `docs/HP_LATEX_330_DATA_MAP.md` | Relatorio de descoberta | Apos Tarefa 6 |
| (Opcional) Novos endpoints adicionados ao `downloader.ts` | Codigo TypeScript | Apos decidir quais dados integrar |
