# PLAN — Investigação da Arquitetura do Adobe Illustrator 2026

- **Arquivo:** `docs/PLAN-illustrator-arch.md`
- **Modo:** PLANNING — nenhum código de aplicação foi/é escrito; nenhum arquivo da instalação do Illustrator é modificado
- **Alvo da investigação:** `D:\Programas\Adobe Illustrator 2026` (instalação Windows, edition 2026)
- **Data:** 2026-09-18
- **Status:** AGUARDANDO APROVAÇÃO → depois IMPLEMENTAÇÃO (fases 1–5, ver abaixo)

---

## 1. Contexto / Objetivo

O usuário pediu: **"investiga D:\Programas\Adobe Illustrator 2026 como a ui do illustrator e os motores sao construidos"** — ou seja, entender como o Illustrator é construído internamente: engines, plugins, scripting, rendering e frameworks de UI.

**Decisão do Socratic Gate (contexto já estabelecido):**
- Objetivo: mapeamento arquitetural completo da instalação — engenharia reversa **estática** (árvore de diretórios, binários, manifestos, strings, scripts).
- Entregável: **documento de arquitetura** — plano (`docs/PLAN-illustrator-arch.md`, este arquivo) + relatório final (`docs/RELATORIO-illustrator-arch.md`, produzido na Fase 5).
- Motivação do repositório anfitrião (`dpi-controle-estoque`): o projeto lida com imposição/prepress e já possui artefatos de automação Illustrator (`test_ai_file.jsx`, `Impor_Illustrator.bat`, `.ai` de amostra). O relatório deve subsidiar futura integração via scripting (ExtendScript/JSX, UXP, CEP, COM).

**Sucesso mensurável:**
1. As 5 fases concluídas com evidência estática rastreável (arquivo + trecho de string/header/manifest).
2. Relatório final entregue em `docs/RELATORIO-illustrator-arch.md` com as seções obrigatórias.
3. Cada motor/framework identificado (AGM, PDFL, AdobePIE, adobeusd/USD, dxcompiler/GPU, dvaui/UI, NGL, CEP, UXP) ancorado a ≥1 evidência.
4. Seção de automação/APIs útil para integração futura de imposição no fluxo do repositório.
5. Nenhum arquivo da instalação alterado; nenhum binário decompilado/executado/debugado.

---

## 2. Escopo da investigação

> Convenção de tarefas: cada tarefa tem `INPUT → OUTPUT → VERIFY`. Tarefas pequenas e verificáveis. Todas as escritas de artefatos intermediários vão para `docs/notes/illustrator-arch/` (criado na implementação). Nada é escrito fora do workspace.

### Fase 1 — Inventário da instalação (árvore de diretórios, binários principais)

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T1.1** Árvore de diretórios com tamanhos (níveis 1–4) | Instalação alvo | `docs/notes/illustrator-arch/arvore.txt` (Get-ChildItem com profundidade limitada) | Arquivo existe; contém `Cool Extras`, `Plug-ins`, `Presets`, `Scripting`, `Support Files`, `AIFeatures.cfg` |
| **T1.2** Catálogo de binários principais (.exe/.dll/.aip/.aipx/.uxp/.8bf/.8BI/.smrd) com tamanho e datas | Árvore | `docs/notes/illustrator-arch/binarios.csv` | CSV com ≥246 `.aip`, ≥7 `.exe`, principais `.dll` listados |
| **T1.3** Contagens por categoria e pasta | Inventário | Tabela no rascunho do relatório | Contagens >0 por categoria (filtros, formatos, extensões UXP/CEP, scripts) |
| **T1.4** Estimativa de volume total e time-box por pasta | Árvore | Nota de custo/tempo por subárvore no `arvore.txt` | Cada subárvore grande (ex.: `Support Files`) tem métrica de tempo |

**Técnicas PowerShell:** `Get-ChildItem -LiteralPath ... -Recurse -File` com `-ErrorAction SilentlyContinue`, `Group-Object Extension`, `Measure-Object Length`, `Sort-Object Length -Descending`, `Select-Object -First N`. Evitar recursão irrestrita em pastas multi-GB sem time-box.

### Fase 2 — Arquitetura de binários/núcleo (exe/dll, dependências, motores de render, PDFL, imposição/prepress se presentes)

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T2.1** Headers PE dos binários-chave | `Illustrator.exe`, `AIRobin.exe`, `AISafeModeLauncher.exe`, `AGM.dll`, `AdobePIE.dll`, `AILib.dll`, `dvaui.dll`, `adobeusd_sdf.dll`, `adobeusd_usd.dll`, `dxcompiler.dll`, `acdb25.dll`, `adobe_c2pa.dll`, `dynamic-torqnative.dll`, `icudt77.dll` | `docs/notes/illustrator-arch/pes.txt` (machine, subsystem, linker version, características) via `System.Reflection.PortableExecutable` no PowerShell | ≥8 binários com PE lido e registrado |
| **T2.2** Tabela de imports de nível 1 (importações diretas de DLLs das DLLs-chave) | Binários listados em T2.1 | `docs/notes/illustrator-arch/imports-graph.md` (quem importa AGM/AdobePIE/PDFL/dvaui/etc.) | Grafo tem ≥10 nós e arestas verificáveis pelo campo import table |
| **T2.3** Extração de strings seletiva por padrões | Binários-chave | `docs/notes/illustrator-arch/strings-<binario>.txt` (padrões: `AGM`, `PDFL`, `AdobePIE`, `UXP`, `CEP`, `ExtendScript`, `svg`, `pdf`, `impose`, `prepress`, `csep`, `moire`, `rook`, `MOG`) | Cada motor declarado no relatório tem ≥1 trecho de string com nome de arquivo e offset |
| **T2.4** Identificação dos motores | Evidências T2.1–T2.3 | Seção "Núcleo e motores" no rascunho: render vetorial (AGM), PDF/imagem (AdobePIE + `PDFL Resource`), GPU (dxcompiler/DirectX), 3D/USD (`adobeusd_*`), C2PA (`adobe_c2pa`), fonte/Unicode (icudt77, `PreComputedFont*`), esteira de separação/imposição (se presentes) | 1 linha por motor com evidência; busca `impos*/prepress/csep` em **nomes** (resultado: nenhum arquivo) e em **strings** registrada |
| **T2.5** Inspeção de `AIFeatures.cfg` e arquivos de configuração de recurso | Raiz + `Support Files\Required` | Resumo de flags/recursos no rascunho | Parágrafo no relatório citando conteúdo (JSON/INI parseado com `ConvertFrom-Json`/`[xml]`) |

**Técnicas PowerShell:** leitura de PE via `System.Reflection.PortableExecutable` (ou `[System.Reflection.Metadata]`); extração de strings sem dump integral (ler bytes com `FileStream`, extrair sequências ASCII/UTF-16 legíveis que casem com regex, limitar por arquivo ex.: 2000 matches); `Format-Hex` para confirmação pontual; `Select-String`/`rg` apenas para arquivos de texto/JSON/XML. `dumpbin /imports` se disponível (fallback: parser próprio).

### Fase 3 — Frameworks de UI (RIBS_UI, CEP, UXP, NGL, AIRobin_Plug-ins)

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T3.1** Inventário CEP extensions | `Support Files\Required\CEP\extensions` (2: `com.adobe.DesignLibraries.angular`, `com.adobe.illustrator.OnBoarding`) | `docs/notes/illustrator-arch/cep-extensions.md` | Cada extensão com id, `CSInterface`/`index.html`, tipo (Panel/Web) |
| **T3.2** Inventário UXP extensions | `Support Files\Required\UXP\extensions` (17: `com.adobe.ccx.*`, `com.adobe.illustrator.*`, `com.adobe.uam`, `com.adobe.unifiedpanel`, `StockPanel`) | `docs/notes/illustrator-arch/uxp-extensions.md` | Cada `manifest.json` lido (id, nome, apis, entrypoint) |
| **T3.3** UI plugins nativos | `Plug-ins\Illustrator UI`, `Plug-ins\Extensions`, `AIRobin_Plug-ins` | Seção "UI nativa" no rascunho | Lista de `.aip` de UI com propósito inferido por nome/strings |
| **T3.4** Identification dos frameworks de UI | `dvaui.dll` (30 MB, strings), `NGL Resources`, RIBS_UI (iconografia PNG/ICO), `UxpResources`, `Resources\panels/ui` se existir | Seção "Frameworks de UI" no relatório | dvaui/NGL/RIBS/CEP/UXP cada um com evidência e papel descrito |

**Técnicas PowerShell:** `Get-ChildItem ... -Filter manifest.json -Recurse` + `Get-Content -Raw | ConvertFrom-Json`; `[xml]` para `*.xml`; leitura de `index.html`/`jsx`/`cxt` superficiais (apenas cabeçalhos/imports de framework); busca de strings `dvaui`/`ngl`/`panui` nos binários.

### Fase 4 — Scripts e automação (Scripting, Sample Scripts, ExtendScript/JSX, C-SEP, e APIs disponíveis para integração)

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T4.1** Inventário de scripts | `Scripting\Sample Scripts` (JavaScript + Visual Basic) | `docs/notes/illustrator-arch/scripts.md` (lista `.jsx`/`.jsxbin`/`.vbs`/`.bas` com categorias) | Ambas as pastas listadas com contagens |
| **T4.2** Superfícies de API | Binários + exemplos | Seção "APIs disponíveis" no rascunho: ExtendScript DOM (strings nos binários), UXP API (manifestos + `UxpResources`), CEP API (`CSInterface`), COM/ActiveX (indício: pasta `Visual Basic` + `AIRobin.exe` como runner) | Cada superfície com ≥1 evidência |
| **T4.3** Busca C-SEP / imposição / prepress | Nomes de arquivo (feito: **0 resultados**) + strings em binários + presets | Conclusão registrada (presente/ausente) | Linha no relatório com evidência e ressalva |
| **T4.4** Automação externa (integração futura) | `AIRobin.exe`, `AIMonitor.exe`, `AISniffer.exe`, `CRWindowsClientService.exe`, `IllustratorDiagnosys.exe`, `.bat` do repositório | Subseção "caminhos de integração" (ex.: `AIRobin -r script.jsx`, COM via PowerShell/.NET) | Hipóteses marcadas como "a validar durante implementação de integração" |

**Técnicas PowerShell:** `Get-ChildItem -Filter *.jsx -Recurse`; leitura de cabeçalhos de `.jsx`; `Get-Command` para COM (`New-Object -ComObject Illustrator.Application` **não executar nesta fase** — apenas documentar); análise de strings `ExtendScript`, `AMPS`, `script` nos binários.

### Fase 5 — Relatório final (documento de arquitetura em docs/ e/ou notes)

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T5.1** Redação do relatório | Todas as notas/evidências das Fases 1–4 | `docs/RELATORIO-illustrator-arch.md` com seções: visão geral, mapa de diretórios, núcleo/motores, UI frameworks, scripts/APIs, glosário, apêndice de evidências | Arquivo existe; todas as seções presentes; tabela de conteúdo navegável |
| **T5.2** Revisão cruzada achados × evidências | Notas + relatório | Relatório final revisado; itens não-conclusivos marcados como *não verificado* | 100% das afirmações de fatos têm referência a evidência |
| **T5.3** Execução da Fase X | Relatório + artefatos | Checklist da Fase X completo com `[x]` | Ver seção "Verification checklist (Phase X)" |

---

## 3. Estado atual (evidências já coletadas — NÃO refazer)

Levantamento preliminar já realizado nesta sessão (usar como ponto de partida na implementação):

- **Raiz:** `Cool Extras`, `Plug-ins`, `Presets`, `Scripting`, `Support Files`, `Adobe Illustrator 2026.lnk`, `AIFeatures.cfg` (sem `.exe` na raiz).
- **Binários (em `Support Files\Contents\Windows`):** `Illustrator.exe` (61,3 MB), `AIRobin.exe`, `AISafeModeLauncher.exe`, `AIMonitor.exe`, `AISniffer.exe`, `CRWindowsClientService.exe`, `IllustratorDiagnosys.exe`.
- **Top DLLs por tamanho:** `dynamic-torqnative.dll` (61 MB), `AdobePIE.dll` (59,6), `icudt77.dll` (35,5), `adobe_c2pa.dll` (31,3), `libdynamic-napi.dll` (30,8), `dvaui.dll` (30,1), `AIACPL.dll` (27,7), `AILib.dll` (24,9), `acdb25.dll` (18,1), `adobeusd_sdf.dll` (17,3), `dxcompiler.dll` (16,3), `mmsdk.dll` (15,8), `ASMKERN230A.dll` (13,7), `adobeusd_usd.dll` (13,2), `AGM.dll` (13).
- **Plug-ins:** 246 `.aip`, 6 `.8bf`, 6 `.smrd`, 2 `.8BI`; subpastas `Extensions | Illustrator Filters | Illustrator Formats | Illustrator UI | Photoshop Filters | Photoshop Formats | Text Filters | Tools` + `DebugPanel.aip`.
- **Support Files\Required:** `AIRobin_Plug-ins`, `CEP\extensions`, `NGL Resources`, `UXP\extensions`, `UxpResources`, `GlobalResources`, `Resources`, `PDFL Resource`, `pdfsettings`, `typesupport`, `Plug-ins`, `Fonts`, `Linguistics`, `New Document Profiles`, `PLGExperiment`, `cacert.pem`, `Default Patterns.pat`, `*.bin` de fontes, `familyLabels.csv`.
- **UXP extensions (17):** inclui `com.adobe.illustrator.propertiespanel`, `com.adobe.illustrator.agentsui`, `com.adobe.illustrator.onboarding`, `com.adobe.unifiedpanel`, `StockPanel`, `com.adobe.ccx.*`.
- **CEP extensions (2):** `com.adobe.DesignLibraries.angular`, `com.adobe.illustrator.OnBoarding`.
- **RIBS_UI:** ícones PNG/ICO (`ai_app_*.png`, `ai_cc_appicon_*.png`, `*.ico`, `*.icns`).
- **Scripting\Sample Scripts:** pastas `JavaScript` e `Visual Basic` (indício de automação COM).
- **Busca por nome `aipref/csep/impos*/prepress`:** **0 arquivos** — C-SEP e imposição devem ser procurados em *strings* (Fase 2/4), não em nomes.

---

## 4. Agents assignments

| Fase | Agente(s) | Responsabilidade |
|------|-----------|------------------|
| **Fase 1** | `explore` (Explorer Agent) | Varredura, inventário, contagens, métricas de volume |
| **Fase 2** | `code-archaeologist` (principal) | Headers PE, imports, strings, grafo de dependências, identificação de motores |
| **Fase 3** | `frontend-specialist` (principal) + `code-archaeologist` (apoio) | CEP/UXP extensions, manifestos, frameworks de UI, componentes nativos |
| **Fase 4** | `backend-specialist` (principal) + `documentation-writer` (apoio) | Scripts, superfícies de API, automação externa, caminhos de integração |
| **Fase 5** | `documentation-writer` (principal) + `code-archaeologist` (revisão) + `test-engineer` (Phase X) | Redação do relatório, revisão cruzada, checklist de verificação |

> Regra do fluxo: Fase 5 depende de 1–4; Fases 2–4 só iniciam com Fase 1 concluída (dependência hard). Dentro de cada fase, tarefas em arquivos distintos podem rodar em paralelo.

---

## 5. Verification checklist (Phase X)

> Nenhum item pode ser marcado `[x]` sem executar a verificação correspondente.

- [x] **F1:** `arvore.txt` e `binarios.csv` existem; contagens conferem com listing real (≥8 exe, ≥246 aip)
- [x] **F2:** PE lido para 23 binários-chave; `imports-graph.md` com 13 binários; ≥1 evidência de string por motor (AGM, AdobePIE/PDFL, adobeusd, dxcompiler, dvaui, adobe_c2pa, icudt77)
- [x] **F2:** resultado da busca C-SEP/imposição/prepress registrado (0 em nomes; 0 em strings — `csep-impos.md`, `motores.md`)
- [x] **F3:** 2 CEP + 17 UXP extensions documentadas com ids e papel; dvaui/NGL/RIBS_UI descritos com evidência
- [x] **F4:** `scripts.md` lista JavaScript + Visual Basic; superfícies de API (ExtendScript/UXP/CEP/COM) com evidência; caminhos de integração anotados
- [x] **F5:** `docs/RELATORIO-illustrator-arch.md` existe e contém todas as seções obrigatórias; fatos rastreáveis a evidências
- [x] **Conformidade estática:** nenhum arquivo da instalação modificado (verificação read-only); nenhum binário decompilado/executado/debugado (apenas headers/strings/manifests/scripts); nenhum dump binário grande (>10 MB) retido em `docs/`; time-box por comando respeitado (registrado nas notas)
- [x] **Marcador final** adicionado ao final do relatório:

```markdown
## ✅ FASE X COMPLETA
- Inventário: ✅
- PE/imports/strings: ✅
- UI frameworks: ✅
- APIs/automação: ✅
- Relatório entregue: ✅
- Data: 2026-09-18
```

---

## 6. Deliverables

| Artefato | Caminho | Quando |
|----------|---------|--------|
| Plano de investigação | `docs/PLAN-illustrator-arch.md` | **Agora (esta fase)** |
| Relatório final de arquitetura | `docs/RELATORIO-illustrator-arch.md` | Fase 5 |
| Evidências intermediárias (árvore, CSV, PE, strings, imports, CEP/UXP/scripts) | `docs/notes/illustrator-arch/` | Fases 1–4 |
| Checklist Fase X preenchido | Seções §5 acima + marcador no relatório | Fase X |

> **Não-escopo:** nenhuma modificação na instalação `D:\Programas\Adobe Illustrator 2026`; nenhum binário publicado/reproduzido; nenhum código de automação funcional do Illustrator (isso seria uma fase posterior de integração, fora deste plano).

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Software comercial/licenciado (Adobe, EULA)** | Restrições legais | Inspeção **estática** apenas, para entendimento pessoal/interno; não reproduzir, distribuir ou extrair algoritmos proprietários; nada além de metadados/strings/manifestos/scripts legíveis |
| **Proibição de decompilação/execução/debug** | Violação do escopo | Ler somente headers PE, strings, JSON/XML, JSX/JS/CXT; nunca executar `Illustrator.exe` ou DLLs; `COM` apenas documentado, não instanciado nesta fase |
| **Tamanho da instalação (multi-GB)** | Comandos lentos, saída gigante | `-ErrorAction SilentlyContinue`, `Select-Object -First`, time-box por comando (≤ ~3 min), profundidade limitada, sem recursão irrestrita em `Support Files` inteiro |
| **Dumps binários grandes** | Poluição do repo | Extração de strings seletiva (máx. ~2k matches/arquivo, só padrões relevantes); proibido manter dumps binários >10 MB em `docs/` |
| **Obfuscação/criptografia de binários Adobe** | Strings ilegíveis | Registrar "não analisável estaticamente" e seguir para próxima evidência; relatório marca limitação |
| **Falsos positivos em strings** | Conclusões erradas | Todo fato ancorado a arquivo + contexto; triagem por offset; itens duvidosos marcados como *hipótese* |
| **Diretórios read-only (`d-r---`) na instalação** | Falha de escrita | Escritas somente em `docs/` do workspace; instalação é lida apenas |
| **Ferramentas ausentes (`dumpbin`)** | Dependência quebrada | Fallback: parser PE puro em PowerShell (`System.Reflection.PortableExecutable` / parse manual da import table) |
| **Escopo estourar (rabbit hole)** | Tempo perdido | Time-box global estimado em ~2–4 h de execução; parcialidades documentadas como "não verificado" são aceitáveis; objetivo é o **mapa**, não exaustão byte a byte |

---

## 8. Próximos passos

1. Aprovação deste plano (usuário).
2. Iniciar IMPLEMENTAÇÃO: Fase 1 (`explore`) → Fase 2/3/4 (`code-archaeologist`, `frontend-specialist`, `backend-specialist`) → Fase 5 (`documentation-writer`).
3. Atualizar o checklist da §5 conforme cada fase termina.
4. Fechar com o marcador ✅ da Fase X no relatório final.
