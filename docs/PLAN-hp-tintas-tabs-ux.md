# Plan: Cadastro Tintas HP + Melhoria UX das Tabs

Data: 04/09/2026

## Contexto
1. **Seed das tintas HP** — deixa pronto para rodar a máquina hoje e validar o débito automático de estoque quando um job for detectado.
2. **UX das tabs** — o usuário diz que não consegue ver visualmente em qual tab está. Precisa de indicador claro (não só mudar o conteúdo).

## Prioridades

### Task 1: Rodar seed das tintas HP (operacional, não é código)
- Rodar `npm run seed:hp:inks` no backend.
- Verifica/víncula 7 itens `hp_tinta-*` com 1550 ml, mínimo 775 ml, vinculados à máquina HP Latex 330.
- **Verificação:** confirmar que os 7 itens aparecem no estoque e traduzem para débito automático quando o job rodar.

### Task 2a: Melhorar seleção visual das tabs
**Problema:** na versão atual, a tab ativa só muda o conteúdo — sem indicador visual forte de qual está selecionada. O `data-[selected]` do Base UI usa a classe `data-selected` (sem colchetes) na v1.7.

**Abordagem escolhida (Option A) — Adicionar underline/estado visual claro:**
- Usar o `Indicator` nativo do Base UI (`TabsPrimitive.Indicator`) que desliza entre tabs, OU
- Incrementar o contraste do tab ativo com cor de fundo + texto colorido + peso da fonte, usando a classe real aplicada pelo Base UI.

**Causa raiz:** o componente `tabs.tsx` usa `data-[selected]:bg-background` etc., mas o Base UI v1.7 aplica `data-selected` (sem colchetes) no elemento. Se não estiver aplicando, a tab ativa não muda de estilo. Precisamos verificar qual atributo o v1.7 coloca (pode ser `data-selected` ou `data-active`).

**Verificação visual:**
- Abrir `/maquinas?id=<hp>` e clicar entre Status / Consumo / Materiais.
- A tab ativa deve ter contraste claro (fundo escuro/claro + texto colorido + possível underline/indicador deslizante).

### Task 2b (opcional): Testar indicador deslizante
- Adicionar `<TabsPrimitive.Indicator>` dentro do `TabsList` caso o underline padrão não seja suficiente.

## Critérios de aceite
- [ ] Seed rodou: 7 tintas HP no estoque (1550 ml cada, mín 775), vinculadas à HP 330.
- [ ] Débito automático funciona quando a máquina rodar (verificar `stock_transactions` após o job).
- [ ] Tab ativa visualmente distinta (user consegue dizer em qual tab está sem olhar o conteúdo).

## Nota sobre Agent
- Seed é operacional: rodar comando no backend (não muda código).
- UX das tabs: backend-specialist não necessário — é puramente frontend (`tabs.tsx`).
