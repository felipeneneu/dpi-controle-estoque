# ADR-025: Preview Nativo C# para Imposição (substitui roll-math.ts)

- **Status:** Proposto
- **Data:** 2026-09-18
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** desktop / imposition / preview
- **Links:** BR-010, BR-021; complementa ADR-015, ADR-017, ADR-021; altera
  ADR-021 §Decisão 5 (roll-math.ts).

---

## Contexto

O `ADR-021` §Decisão 5 definiu que `roll-math.ts` seria rebaixado a
"interpolador de UI" — usado durante drag de slider e confirmado pelo
core ao soltar. A auditoria do PR #3b (relatório
`docs/engineering/AUDITORIA-roll-math-pr3b.md`) expôs **3 divergências
estruturais** entre o `roll-math.ts` e o `GridSearchEngine`:

1. **Tolerância:** roll-math usa `Math.floor` puro; core usa
   `max(toleranceMm, registerMm, 0.1)`. Em casos de borda exata
   (`665/19 = 35.0000001`), o roll-math retorna `34` onde o core retorna `35`.
2. **Política de sobra:** roll-math prefere grades "cravadas"
   (`isExact`) mesmo com desperdício; core usa função de custo
   ponderada (`wA=0.50, wL=0.30, wS=0.20`).
3. **Estouro de rolo:** roll-math calcula grades sem respeitar
   `maxLengthMm`; core lança `E_GRID_OVERFLOW`.

Manter duas implementações — mesmo com testes de contrato — obriga a
sincronizar conhecimento de domínio em dois lugares. Cada feature nova
(banner tiler, gang-run, mimaki kit) duplicaria regras no roll-math.

Simultaneamente, o `ADR-015` já provou que **janelas C# nativas com
DirectX/SkiaSharp entregam 60 FPS** para canvas denso (o
`ImpositorKonica.exe` é o precedente). A arquitetura de preview via
Electron + IPC (`ADR-021` §Decisão 3) tem latência de 50-150ms por
chamada — aceitável para "confirmar", ruim para drag em tempo real.

A pergunta central: **vale manter 2 motores (TS + C#) para o preview,
sabendo que vão divergir em features futuras?**

---

## Decisão

### 1. Preview passa a ser C# nativo (in-process)

O preview de imposição será uma **janela C# nativa**, **in-process** ao
`imposition-core` (ProjectReference, sem IPC, sem JSON intermediário,
sem serialização). Reaproveita o canvas do `ImpositorKonica` (ADR-015).

### 2. Extensão do `ImpositorKonica` com modo `--preview`

O binário `ImpositorKonica.exe` ganha um **modo read-only** acionado por
flag:

```powershell
ImpositorKonica.exe --preview --data <path-para-input.json>
```

Nesse modo:
- Lê ImpositionInput (contrato do imposition-core).
- Chama GridSearchEngine.Plan(input) in-process.
- Renderiza a grade sem interação (read-only).
- Exit codes preservados (0/1/2/3, ADR-015).
- O modo normal (interativo, com edição, gang-run) permanece inalterado.

### 3. roll-math.ts deprecado
Marcado com `@deprecated` no JSDoc. Nenhum consumidor novo permitido.
Deleção após confirmação de que o frontend migrou para o preview C#
(PR #3b-2, futuro).

### 4. imposition-grid.exe continua existindo
O binário NativeAOT (ADR-021 §Decisão 3) continua válido — mas sua
missão muda:
- Deixa de ser a fonte do preview no Electron.
- Passa a ser CLI de cálculo puro para:
  - .bat da raiz (que já usa).
  - Scripts externos (integração com ERP, automação).
  - CI (golden-master cross-motor via dotnet test).

### 5. Electron continua sendo o shell principal
O Electron permanece como UI de orquestração (OS, fila, configuração).
A janela C# é spawnada quando o operador quer preview interativo —
mesmo padrão do ImpositorKonica hoje.

---

## Consequências

### Positivas
- **Fonte única de verdade real.** Preview usa o mesmo código que o PDF.
- **Zero divergência estrutural** (as 3 do PR #3b desaparecem por eliminação).
- **Performance garantida.** In-process, sem IPC, sem serialização. Preview de 60 FPS viável (precedente ADR-015).
- **Consistência operacional.** Operador reconhece a "mesinha" — mesmo visual do ImpositorKonica.
- **Features futuras viáveis.** BannerTiler, GangPlanner, MimakiKit precisam de canvas interativo — C# nativo é o caminho natural.
- **Dívida eliminada.** roll-math.ts não precisa ser auditado, corrigido, ou sincronizado.

### Negativas / Mitigações
- **Inconsistência visual.** A janela C# tem "cara de WPF", diferente do Electron. Mitigação: tema escuro Studio Dark compartilhado com ImpositorKonica.
- **Duas stacks para o dev.** Mitigação: ImpositorKonica já existe; um novo dev Electron puro não mexe no preview.
- **Empacotamento.** ImpositorKonica.exe já é empacotado como extraResources (ADR-015); o modo `--preview` não muda packaging.
- **Acoplamento do ImpositorKonica ao imposition-core.** O `.csproj` ganha ProjectReference. Se o core mudar, o Konica rebuilda. Isso é o comportamento desejado (fonte única).

---

## Alternativas rejeitadas
- **Manter roll-math.ts como interpolador** (ADR-021 §Decisão 5 original). Rejeitada após a auditoria — 3 divergências estruturais.
- **IPC no Electron para imposition-grid.exe** (ADR-021 §Decisão 3). Rejeitada como fonte de preview por latência (50-150ms) incompatível com drag em tempo real. Mantida como CLI para .bat e automação.
- **Novo binário C# dedicado** (PreviewExe.exe). Rejeitada — duplicaria canvas, tema, protocolo de IPC com Electron. Estender o Konica é mais barato.
- **Híbrido** (Electron para preview rápido, C# para interativo). Rejeitada — mantém 2 stacks e 2 fontes de verdade.

---

## Verificação
- `dotnet test` do AutoImposerCLI.Tests continua verde (25/25 no core).
- Novo teste de integração: `ImpositorKonica --preview --data <canonical.json>` retorna exit 0 e renderiza 35×29 = 1015 para o caso canônico.
- `roll-math.ts` marcado `@deprecated`; nenhum novo import em main.
- `grep -r "imposition-roll-math" src/ grafica-app/src/` retorna apenas o próprio arquivo (auto-referência do deprecated).

---

## Gatilhos para Reavaliação
- Se o Electron ganhar WebGL com performance >60 FPS em grid denso — reconsiderar Arquitetura A.
- Se o ImpositorKonica crescer a ponto de virar "canivete suíço" — extrair canvas para lib compartilhada e criar preview.exe dedicado.
