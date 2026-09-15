# PLAN: F2 Media Select Dialog na Página de Máquina

## Contexto

Na página da máquina (`/maquinas?id=X`), o operador precisa selecionar rapidamente a mídia/bobina que será carregada. Atualmente, para trocar bobina, o botão "Trocar Bobina" no `MimakiInfoPanel` abre um modal que pede apenas o serial — sem busca visual por código ou nome. O usuário quer pressionar **F2** para abrir um **modal de seleção de mídia** com busca incremental por código (campo `StockItem.code`) e por nome, similar ao estilo do `MimakiBindDialog` mas como ação global da página da máquina.

## Decisão — Emenda 2 ao ADR-009

Criar a **Emenda 2** ao `docs/governance/adr/ADR-009- bobina como ativo.md` documentando:
- Atalho F2 na página de canal da máquina abre modal de seleção de mídia
- Busca incremental por código (`StockItem.code`) e por nome (`StockItem.name`)
- O modal é do tipo "selecionar mídia" (não apenas trocar bobina por serial)
- Fluxo: F2 → digita código/nome → lista filtra em tempo real → seleciona → pode ser usado para vincular bobina ou material à máquina

## Arquivos Envolvidos

| Arquivo | Ação |
|---------|------|
| `docs/governance/adr/ADR-009- bobina como ativo.md` | Adicionar Emenda 2 |
| `grafica-app/src/components/media-select-dialog.tsx` | Criar — modal de seleção por F2 |
| `grafica-app/src/app/(dashboard)/maquinas/page.tsx` | Adicionar handler F2 + render do dialog |

## Task Breakdown

| # | Task | Agente |
|---|------|--------|
| 1 | Criar `MediaSelectDialog` — componente reutilizável | frontend-specialist |
| 2 | Adicionar listener F2 no `MachineChannelView` | frontend-specialist |
| 3 | Integrar `MediaSelectDialog` no `MachineChannelView` | frontend-specialist |
| 4 | Criar Emenda 2 no ADR-009 | documentation-writer |
| 5 | Verificar lint, tipo, e que F2 abre o modal corretamente | general |

## Detalhes de Implementação

### 1. `MediaSelectDialog` (novo componente)

```
Componente: MediaSelectDialog
Props: { open: boolean, onOpenChange: (o: boolean) => void, onSelect: (item: StockItem) => void, machine?: Machine }
```

- Input de busca no topo (ícone lupa, autofocus quando abre)
- Lista filtrada: busca por `item.code.toLowerCase().includes(query)` OU `item.name.toLowerCase().includes(query)` —或 seja, digitar código filtra por código, digitar nome filtra por nome
- Mostra `item.code` (se existir) e `item.name` no resultado
- Botão "Cadastrar nova mídia" (dashed) — opcional, pode ser Adicionar Material existente
- Ao selecionar: chama `onSelect(item)` e fecha

### 2. Handler F2 no MachineChannelView

```
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'F2') {
      e.preventDefault()
      setMediaSelectOpen(true)  // estado local do MachineChannelView
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [])
```

- Só ativo quando estamos na página da máquina (MachineChannelView está montado)
- Não interfere com outros modais (o `EscapeActionsMenu` só captura ESC)

### 3. Integração no MachineChannelView

- Adicionar estado `mediaSelectOpen`
- Renderizar `<MediaSelectDialog open={mediaSelectOpen} onOpenChange={setMediaSelectOpen} onSelect={...} machine={machine} />`
- `onSelect`: por enquanto, pode logar/toast a mídia selecionada —后续 será integrado com o fluxo de check-in de bobina (M1/M2)

### 4. Emenda 2 ao ADR-009

Formato similar à Emenda 1 existente no final do arquivo:

```markdown
## Emenda 2: Atalho F2 — Seleção Rápida de Mídia na Página da Máquina
- **Data da Emenda:** 2026-09-14
- **Contexto:** ...
- **Decisão:** ...
```

## Critérios de Aceite

- [ ] Pressionar F2 na página da máquina abre o modal de seleção de mídia
- [ ] Digitando código (ex: `001`) aparecem apenas mídias com `code` contendo `001`
- [ ] Digitando nome (ex: `vinil`) aparecem apenas mídias com `name` contendo `vinil`
- [ ] Selecionar uma mídia fecha o modal e executa callback `onSelect`
- [ ] ESC fecha o modal normalmente
- [ ] O modal não conflita com o `EscapeActionsMenu` (ESC do app)
- [ ] Emenda 2 adicionada ao ADR-009

## Notas

- `StockItem.code` já existe no schema (coluna `text('code')`) e está exposta no tipo TS como `string | null`
- O `useStockItems("PAPER_MEDIA")` já retorna todos os itens de mídia — pode ser passado como prop ou buscado dentro do dialog
- O `MimakiBindDialog` tem a estrutura de busca similar (filtrar por nome) — pode ser inspiração
- Não há conflito com o handler ESC do `escape-actions-menu.tsx` porque F2 ≠ ESC
- Google Fonts timeout (Inter) é problema de rede — não é blocker
