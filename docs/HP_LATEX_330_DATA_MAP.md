# HP Latex 330 — Mapa de Dados Disponível (Data Map)

> **Data:** 2026-09-03
> **Máquina:** HP Latex 330 — Hostname `NPIF9F89B` — IPv4 `192.168.234.10` (gateway `192.168.234.1`, /24, IPv6 link-local `fe80::eeb1:d7ff:fef9:f89b`)
> **Método:** Navegação + curl/invoke-webrequest no EWS integrado (Embedded Web Server)
> **Resultado da investigação:** **SIM — dá para puxar muito mais do que o accounting.xls que já usamos.**

---

## 1. Resumo executivo

A impressora expõe um **EWS completo** (JavaServer Pages `*.jsp`) com dados em tempo real e acumulados. As informações estão distribuídas em **páginas HTML interpretáveis** e **endpoints `*.jsp` que devolvem texto simples separado por `|`** (fáceis de parsear). Não há JSON/XML estruturado dedicado, mas o HTML é consistente e permite extração confiável.

**O que é especialmente valioso para o GraficaOS:**
- **Níveis de tinta atual de cada cartucho** (ml restante + capacidade) e **status de alerta** por cor → dá para alertar antes de acabar (já há um alerta: LM "Low" = 55ml/775ml)
- **Nome + largura da mídia carregada** (rolo atual no equipamento) → cruza com o estoque em tempo real
- **Temperaturas de secagem/cura** (aquecimento latex) em tempo real
- **Acumulados de uso (lifetime):** total de m², total de ml de tinta por cor, e **m² por tipo de mídia** → ótimos para conciliar estoque/consumo
- **Cartucho de manutenção** (45%) e **kits de manutenção preventiva** (Kit #1 40%, #2 13%, #3 0%)
- **Estado atual da impressora** via endpoint simples: `minor|LM cartridge is low on ink|`

---

## 2. EWS Root (acesso)

| URL | HTTP | Conteúdo |
|-----|------|----------|
| `http://192.168.234.10/` | 200 | Redireciona para `hp/device/webAccess/index.htm` |
| `http://192.168.234.10/hp/device/` | 403 | Bloqueado (não serve diretório) |
| `http://192.168.234.10/hp/device/webAccess/index.htm` | 200 | Página principal (aba Supplies) |
| `http://192.168.234.10/hp/jetdirect/index.html` | 200 | Página de rede (Setup networking) |

**Abas de navegação:** Main (Supplies) · Setup (device_setup) · Networking (`/hp/jetdirect/index.html`) · Printer Data Sharing Agreement (pdsa_configuration) · Support (image_quality)

**Para trocar de página:** `http://192.168.234.10/hp/device/webAccess/index.htm?content=<nome>`
Valores vistos: `supplies`, `usage`, `accounting`, `device_setup`, `pdsa_configuration`, `image_quality`.

> **Observação:** o EWS usa `jsessionid` nas URLs dos links, mas os endpoints `.jsp` respondem **sem** jsessionid (funcionou via GET e POST puro). Não pediu autenticação (usuário admin desabilitado por padrão).

---

## 3. Endpoints testados

| URL | Método | HTTP | Tipo / Tamanho |
|-----|--------|------|----------------|
| `/hp/device/webAccess/accounting.xls?cost=y` | GET | **200** | `application/vnd.ms-excel`, ~1.0 MB (já usado) |
| `/hp/device/webAccess/index.htm?content=usage` | GET | **200** | `text/html`, ~21 KB |
| `/hp/device/webAccess/index.htm?content=supplies` | GET | **200** | `text/html`, ~33 KB |
| `/hp/device/webAccess/index.htm?content=accounting` | GET | **200** | `text/html`, ~1.8 MB |
| `/hp/device/webAccess/index.htm?content=device_setup` | GET | **200** | `text/html`, ~46 KB |
| `/hp/device/webAccess/printer_status_core.jsp` | GET/**POST** | **200** | `text/html`, pipe-delimited |
| `/hp/device/webAccess/printer_temp.jsp` | GET/POST | 404 | (nome real diferente; temperatura vem no HTML) |
| `/hp/device/info_*.xml` / `.json` (`deviceStatus`, `config`, `maintenance`, `supplies`, `alerts`) | GET | **404** | endpoints XML/JSON não existem nesta firmware |
| `printer_status.jsp`, `history.jsp`, `usage_core.jsp`, `supplies_core.jsp`, `device_status.jsp`, `status.json`, `info.xml` | GET | 404 | não existem |
| SNMP (porta **161/UDP**) | — | **fechada** | SNMP não acessível pela rede | 

---

## 4. Dados em tempo real (atual)

### 4a. `printer_status_core.jsp` — estado da impressora
Resposta em **texto simples separado por `|`**:
```
minor|LM cartridge is low on ink|
```
Formato: `severidade|mensagem|`. Valores possíveis de severidade (inferidos): `normal`, `minor`, `major`. É o primeiro item da string.
> **Candidato direto** para o campo "Online/Offline + status" já usado no `downloader.ts` — dá o estado vivo sem depender só do TCP 80.

### 4b. Página `?content=supplies` — mídia + tinta + heads + temperatura (atual)

| Dado | Valor lido (no momento) | Formato |
|------|------------------------|---------|
| **Mídia carregada** | "STARPAC vinil brilho", largura **1.065 mm**, comprimento "Unknown" | texto |
| **Cartucho M** Magenta HP 831 | **389 ml** restante / 775 ml · status OK · CZ684A | ml |
| **Cartucho LM** Light magenta HP 831 | **55 ml** restante / 775 ml · status **Low (aviso!)** · CZ687A | ml |
| **Cartucho LC** Light cyan HP 831 | 475 ml / 775 ml · OK · CZ686A | ml |
| **Cartucho C** Cyan HP 831 | 662 ml / 775 ml · OK · CZ683A | ml |
| **Cartucho OP** Latex Optimizer HP 831 | 394 ml / 775 ml · OK · CZ706A | ml |
| **Cartucho Y** Yellow HP 831 | 763 ml / 775 ml · OK · CZ685A | ml |
| **Cartucho K** Black HP 831 | 722 ml / 775 ml · OK · CZ682A | ml |
| **6 printheads** (OP-OP, LM-LC, C-K, C-K, Y-M, Y-M) | todos "OK" (fora de garantia) | status |
| **Barras de temperatura** (secagem + cura) | curingo/cura exibido (ex: Drying/Curing) | °C |
| **Manutenção** | "Maintenance not required" | texto |
| **Cartucho de manutenção** | **45 %** · status OK · CZ681A | % |
| **Kits Preventivos** | Kit #1 **40%**, Kit #2 **13%**, Kit #3 **0%** | % de uso |

> A temperatura é atualizada via JS polling (`printer_temp.jsp` na página), mas o endpoint direto 404 — o valor também aparece estático no HTML (`DryingTemp` / `CuringTemp`). Dá para extrair do HTML inicial ou investigar o nome real do endpoint.

---

## 5. Dados acumulados (lifetime) — página `?content=usage`

Contadores totais desde o início de uso da impressora:

- **Substrato total impresso:** 23.949,87 m² (257.794,03 ft²)
- **Tinta total gasta:** 251.189,12 ml
- **Tinta por cartucho (ml):**
  - Magenta: 46.266,68
  - Light magenta: 17.161,07
  - Light cyan: 13.048,57
  - Cyan: 57.371,90
  - Latex Optimizer: 25.525,35
  - Yellow: 59.495,10
  - Black: 32.320,45

- **m² por tipo de mídia** (amostra das principais presentes no estoque):

| Mídia | m² | ft² |
|-------|-----|------|
| STARPAC vinil brilho | 5.122,25 | 55.135,42 |
| Starflex LONA brilho | 4.725,68 | 50.866,71 |
| STARPAC DP100 GTS 10P | 2.014,02 | 21.678,69 |
| Ritrama vinil Brilho | 2.059,12 | 22.164,20 |
| STARFLEX lona brilho 1600 | 325,09 | 3.499,22 |
| STARPAC vinil brilho blockout 1220 | 480,03 | 5.166,99 |
| STARPAC FOSCO | 931,88 | 10.030,67 |
| ... (dezenas de outros tipos) | | |

> **Uso forte:** cruzar os m² por tipo de mídia com o estoque do GraficaOS para validar/conciliar consumo — e o `accounting.xls` dá o detalhe por job.

---

## 6. Relatórios exportáveis

- **`accounting.xls`** — `http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y` → **OK** (1 MB) — já usado pelo agente.
- `usage_report.csv`, `media_log.csv`, `supplies_report.xls` → **não existem** (404). A exportação extra é feita pela **página Accounting** (`?content=accounting`, 1.8 MB HTML) com os mesmos dados do .xls.

---

## 7. SNMP

**Indisponível** — a porta 161/UDP não respondeu (`TcpTestSucceeded: False`). Não há caminho SNMP para puxar OIDs da impressora nesta rede.

---

## 8. Próximos passos possíveis (integrações candidatas ao GraficaOS)

1. **Status em tempo real sem round-trip de job** — usar `printer_status_core.jsp` no polling do agente para gravar `online/offline` + `severidade/mensagem` na máquina (mais rico que só o TCP 80).
2. **Alerta de tinta baixa** — puxar os ml restantes de cada cartucho da página `?content=supplies` e avisar quando `status=Low` / abaixo de um mínimo configurado (ex: a LM já está em 55ml).
3. **Mídia atual no equipamento** — capturar "STARPAC vinil brilho" + largura do rolo carregado e exibir/validar contra o estoque.
4. **Acumulados de uso** — gravar periodicamente os totais de m² e ml por cor da página `?content=usage` para histórico/consumo e conciliação de estoque.
5. **Preventive Maintenance** — alertar quando Kit #1/#2/#3 ou cartucho de manutenção atingirem um limite.

---

## 9. Limitações / notas

- **Sem endpoint JSON/XML** — a extração é via parse de HTML consistente ou do `*.jsp` pipe-delimited. O parsing de HTML é factível, mas mais frágil que JSON.
- **Endpoint de temperatura** com nome divergente (`printer_temp.jsp` → 404) — precisa descobrir o nome real se for usar; o valor também sai no HTML inicial.
- **SNMP fora** — sem telemetria via porta 161.
- Autenticação não exigida no acesso atual; pode ser habilitada depois pelo painel (`Configure admin user name`).
