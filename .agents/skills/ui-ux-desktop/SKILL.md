---
name: ui-ux-desktop
description: Desktop UI ergonomics, keyboard shortcuts, theming, density, and accessibility for operator-facing tools. Modeled after Adobe Illustrator, Kodak Preps, and other industry-standard software. Use when designing or reviewing desktop UX.
when_to_use: "When designing desktop UI ergonomics, keyboard shortcuts, theming, or accessibility. When the operator uses the software 8+ hours/day."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# ui-ux-desktop

## Filosofia
**A experiência tem que ser GOSTOSA de usar.** O operador passa 8+ horas nesse software. Cada clique extra é dor. Cada travada é ódio. Cada atalho que não funciona é traição.

## Modelo mental: Illustrator / Preps
Estude como o operador trabalha. Os padrões que eles esperam:

| Ação | Atalho consagrado |
|---|---|
| Zoom Extents (ajustar tela) | F4 |
| Centralizar na seleção | P |
| Centralizar horizontalmente | C |
| Centralizar verticalmente | E |
| Duplicar | Ctrl+D |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Pan | Space + drag ou botão do meio |
| Zoom | Scroll + Ctrl |
| Cancelar | Esc |
| Confirmar | Enter |
| Selecionar tudo | Ctrl+A |
| Salvar | Ctrl+S |
| Preview | Ctrl+P |

**Nunca invente um atalho sem checar se o Illustrator usa outro.**

## Theming: Studio Dark
- **Background**: `#1E1E1E` a `#2D2D2D` (gradiente de profundidade)
- **Text primary**: `#FFFFFF` ou `#E8E8E8`
- **Text secondary**: `#A0A0A0`
- **Border**: `#3F3F3F`
- **Accent**: definido pelo produto (GraficaOS: `#E63946`)
- **Sem cores puras** (`#FF0000`, `#00FF00`, `#0000FF`)
- **Contraste WCAG AA**: 4.5:1 mínimo para texto

## Densidade
- **Comfortable**: 8px padding (formulários)
- **Compact**: 4px padding (listas, toolbars)
- **Operator-tight**: 2px padding (canvas panels)

**Regra**: o operador quer **ver mais informação**, não mais espaço.

## Responsividade (percepção de velocidade)
- **Feedback imediato** (< 100ms): clique, hover, seleção.
- **Operação rápida** (< 500ms): cálculo, preview.
- **Operação longa** (> 500ms): barra de progresso + cancelar.
- **Operação muito longa** (> 5s): modal, background, notificação ao final.

**Nunca**: botão que não responde, spinner sem contexto, travamento sem aviso.

## Micro-interações (o que faz "gostoso")
- **Hover**: transição suave (150ms)
- **Seleção**: outline limpo, sem piscar
- **Drag**: ghost do elemento, drop zone destacada
- **Snap**: feedback visual quando encaixa no grid
- **Undo**: sempre disponível, Ctrl+Z funciona

## Acessibilidade
- Screen readers: `AutomationProperties.Name`, `HelpText`
- Keyboard nav: Tab order lógico, Enter/Space ativam
- Alto contraste: respeitar configuração do Windows
- Fontes: mínimo 11px, não depender de cor apenas

## Anti-patterns
- ❌ Hover-only actions (mobile-first em desktop)
- ❌ Modal para tudo (modal só para decisão crítica)
- ❌ Confirmação dupla ("tem certeza que quer salvar?")
- ❌ Toast que desaparece antes do operador ler
- ❌ Loading spinner sem contexto ("carregando o quê?")
- ❌ Erro sem ação ("algo deu errado")
- ❌ Ícones sem label em toolbars (operador não sabe o que faz)
