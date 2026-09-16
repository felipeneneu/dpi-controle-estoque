# ADR-018: Motor Gráfico de Saída Externo — CorelDRAW (COM/VGCore) vs Adobe Illustrator (COM/ExtendScript) — Avaliação

## Status
Proposto (Avaliação de viabilidade; sem implementação até critérios de aceite das seções abaixo)

## Contexto
A pré-impressão industrial da gráfica trabalha com chapas SRA3 (ImpositorKonica) e grandes formatos
(Step & Repeat). O fluxo de saída atual do ImpositorKonica exporta PDF via SkiaSharp — validado como
legível nos renders de referência (Windows.Data.Pdf e Chromium/pdfium) — mas duas necessidades permanecem
insatisfeitas no motor atual:

1. **PDF comercial gráfico**: presets PDF/X-4, cores de spot/overprint, fontes embutidas, sangria, perfil
   ICC — o que o banco de produção do CorelDRAW ou do Illustrator entrega nativamente.
2. **Impressão SRA3 profissional**: o spooler direto do Windows não oferece gerenciamento de cor / separação
   / marcas de registro no padrão que esses aplicativos aplicam em 1 passo.

Ao mesmo tempo, há um desejo de reaproveitar as instalações editoriais presentes nas workstations em vez de
duplicar motores: CorelDRAW Graphics Suite 26 e Adobe Illustrator 2026.

## Levantamento no Ambiente (2026-09-16)
Verificação técnica realizada na máquina real:

### CorelDRAW Graphics Suite 26
| Item | Resultado |
|---|---|
| Instalação | `C:\Program Files\Corel\CorelDRAW Graphics Suite\26\Programs64` |
| ProgID COM `CorelDRAW.Application.26` | **Registrado** em `HKEY_CLASSES_ROOT` |
| TypeLib de automação | `Programs64\TypeLibs\VGCoreAuto.tlb` (GUID `{95E23C91-BC5A-49F3-8CD1-1FC515597048}`) |
| DLLs internas (`CdrPDF.dll`, `cdrrip.dll`, `CdrPrn.dll`, `CdrGfx.dll`, `CdrPsi.dll`) | Presentes, mas **sem API pública/estável** e sem contrato de suporte externo |

### Adobe Illustrator 2026
| Item | Resultado |
|---|---|
| Instalação | `D:\Programas\Adobe Illustrator 2026` |
| Executável | `Support Files\Contents\Windows\Illustrator.exe` |
| ProgID COM `Illustrator.Application` | **Registrado** |
| TypeLib de automação | "Adobe Illustrator 2026 Type Library" `{38E4E28D-F058-4D11-A6F0-9F70ABF345DC}` via `Plug-ins\Extensions\ScriptingSupport.aip` |
| Motor de script | ExtendScript (JSX) — amostras oficiais em `Scripting\Sample Scripts\JavaScript` e `...\Visual Basic` |
| DLLs internas (`Illustrator.dll` do pipeline gráfico) | Presentes, mas **sem API pública/estável** |

## Decisão de Arquitetura
1. **Canal oficial e único**: automação COM via `VGCore.dll` (`CorelDRAW.Application.26`) e/ou
   `Illustrator.Application` (com `DoJavaScript` para ExtendScript). **Nenhuma** chamada direta
   (P/Invoke/`DllImport`) a `Cdr*.dll`, `cdrrip.dll`, `Illustrator.dll`, `skia.dll` etc. — peças internas
   sem ABI estável e de uso cinza no licenciamento.
2. **Papel do motor externo**: **saída de alto valor somente** — (a) exportação de PDF/X da folha
   impostada, (b) impressão SRA3 com gerenciamento de cor, (c) ingestão de arquivos do cliente
   (`.cdr/.ai/.eps`) — jamais motor de preview/UI ou cálculo de imposição.
3. **Interface e cálculo continuam nativos**: preview 60 FPS em WPF/DirectX + SkiaSharp e o motor de
   imposição permanecem exatamente como estão (ADR-014/015). A integração externa, quando ativa, é um
   passo posterior a pedido do operador.
4. **Condicionamento por licença**: a feature fica **desabilitada** quando o ProgID do motor não está
   registrado na workstation (detecção via registro na inicialização do sidecar).
5. **Serialização**: automação COM roda no processo do aplicativo editorial (apartment de thread única).
   Toda chamada é enfileirada em um único worker; a UI do ImpositorKonica nunca bloqueia esse processo.

---

## Comparação de Candidatos

| Critério | CorelDRAW (VGCore) | Adobe Illustrator (ExtendScript) |
|---|---|---|
| **PDF/X gráfico de saída** | Presets robustos | Presets robustos (reconhecido no mercado de pré-impressão) |
| **Ingestão `.cdr`** | Nativa (formato dono) | Não abre `.cdr` diretamente |
| **Ingestão `.ai`/`.eps`** | Limitações iterativas | Nativa (formato dono) |
| **Fluxo FineCut/Mimaki (ADR-017)** | Compositor paralelo | **Já é o fluxo real da bancada** (FineCut roda como plugin) |
| **Headless-oficial** | Não existe; processo GUI | Não existe; processo GUI |
| **Startup/sobrecarga** | ~10–20 s | ~10–30 s (mais pesado) |
| **CLI nativa** | `CdrConv.exe` (conversor de formatos) | Sem CLI; só via COM/CEP/UXP |
| **Comunidade de automação gráfica** | Menor | Extensa (JSX/CEP/UXP, amostras oficiais inclusas) |

**Conclusão preliminar da comparação:** para **saída PDF/X e ingestão de arquivo do cliente**, o Illustrator
é o favorito porque já domina o fluxo da bancada (FineCut/Mimaki e entrada `.ai/.eps`). O CorelDRAW continua
relevante apenas quando o cliente envia `.cdr` — caso em que a conversão pode ser feita localmente pelo
`CdrConv.exe` e o resultado tratado depois.

---

## Matriz de Escopo (Fronteira Anti-Escopo / Guardrails)

| Funcionalidade | No Escopo | Fora de Escopo (Proibido) | Justificativa |
|---|:---:|:---:|---|
| Exportação PDF/X-4 (preset gráfico, spot/overprint, fontes) | **SIM** | — | Maior valor agregado; entrega comercial. |
| Impressão SRA3 via motor externo (ICC, marcas, separação) | **SIM** | — | Preenchimento da lacuna do spooler direto. |
| Ingestão `.ai/.eps/.cdr` de cliente na chapa | **PILOTO PRÉ-APROVADO** | — | Depende de validação da saída via COM first. |
| Detecção dinâmica de instalação/licença | **SIM** | — | Recurso condicional por workstation. |
| Preview / UI do ImpositorKonica | — | **NÃO** | WPF/DirectX+Skia continuam donos da interface. |
| P/Invoke em `Cdr*.dll` / `cdrrip.dll` / `Illustrator.dll` / `skia.dll` internas | — | **NÃO** | ABI instável, suporte inexistente, risco de licença. |
| Substituir o motor de imposição/cálculo por outro | — | **NÃO** | Acoplar cálculo trava a evolução do motor headless (ADR-017). |
| Servir como engine headless/back-end para clientes sem o app editorial | — | **NÃO** | Ambos são processos GUI desktop, sem modo servidor oficial. |

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Startup do `CorelDRAW.exe` lento (ordem de 10–20s) | UX do operador | Feature acionada por botão explícito; indicação de progresso e cancelamento. |
| Automação COM pode quebrar em versões futuras do Corel | Manutenção | Encapsulamento total atrás de interface `ICorelGraphicEngine`; detecção de ProgID nominal. |
| Corel aberto na tela durante automação | Disciplina de bancada | Inicialização oculta via `Application.Visible = false` quando suportado; sessão dedicada. |
| Licença por workstation | Escalabilidade | Feature condicional por registro; fallback silencioso para o motor Skia/spooler atual. |
| 32/64-bit desalinhado | Crash | Publicação já é `win-x64`; validação do typeLib 64-bit (`WOW6432Node`, `Programs64`). |

## Critérios de Aceite para Eventual Adoção
Somente se todos os itens abaixo passarem na bancada real:
1. O PDF/X-4 gerado a partir de uma folha impostada (SRA3, grade dinâmica 2×N) abre no próprio CorelDRAW,
   no Adobe Acrobat Preflight e no visualizador Windows sem avisos de fonte/tinta.
2. Impressão via Corel do arquivo em impressoras de prova SRA3 reproduz marcas de corte, sangria e centro
   exatamente nas posições medidas (±0,5 mm).
3. Tempo de ponta a ponta (acionamento → PDF/printer) inferior a 30s inclusive com o Corel já aberto.
4. Máquina sem a suíte registrada exibe o fluxo clássico (Skia + spooler) sem regressão nem aviso.
5. Pack de testes automatizados continua verde (exportação atual permanece como fallback canônico).

## Gatilhos para Reavaliação
- Pedido formal de especificação gráfica de cliente que exija PDF/X-4 ou separação nativa.
- Incidente recorrente de cor/impressão atribuível ao spooler direto.
- Solicitação operacional de ingestão `.cdr` dos clientes.

## Status da Decisão
Em avaliação: a adoção fica **condicionada** aos critérios de aceite acima. Nenhuma mudança de código do
ImpositorKonica será feita até que um protótipo separado (fora do binário principal) prove os itens 1–5.