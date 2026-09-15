# PLAN: Implementação do ADR-014 — Etiquetas Físicas (106x35mm), Imposição Konica e Quick-Switch

> **Status:** Concluído (Executado e Verificado)  
> **ADR Base:** `docs/governance/adr/ADR-014-Padronização de Etiquetas Físicas (106x35mm).md`  
> **Domínio:** frontend / inventory / electron  

---

## 1. Contexto e Objetivos

Implementar o módulo client-side de imposição de etiquetas adesivas (106×35 mm) para aproveitamento em folhas SRA3 (330×480 mm) na Konica Minolta (32 etiquetas/folha a 90°), além de refinar o atalho `F2` do `MediaSelectDialog` no Electron com normalização de entrada (`BOB-xxxx`) e política de confirmação de transferência entre máquinas.

---

## 2. Decisões Travadas (Sessão de Brainstorming)

- **P0-A:** Payload semântico no QR (`BOB:1042` / `TNK:502`). Entrada manual no Quick-Switch normaliza `BOB-xxxx`, `BOB:xxxx` ou apenas `xxxx`. Leitura física por scanner fica para fase 2.
- **P1-A:** Motor de imposição 100% Client-Side no React/Electron utilizando `pdf-lib` e `qrcode`, com preview em tempo real e zero carga no Fastify backend.
- **P2-A:** Conflito de máquina no Quick-Switch: se a bobina estiver em uso em outra máquina, modal avisa e exige confirmação com segundo `Enter` (`F2` → `[código]` → `Enter` → `Enter`).

---

## 3. Arquivos Envolvidos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `grafica-app/package.json` | Modificar | Instalar `pdf-lib` e `qrcode` (+ `@types/qrcode`) |
| `grafica-app/src/lib/labels/imposition.ts` | Criar | Lógica matemática do grid e gerador de PDF via `pdf-lib` |
| `grafica-app/src/components/label-imposition-dialog.tsx` | Criar | Modal com preview interativo do espelho de folha 330×480mm e exportação |
| `grafica-app/src/components/media-select-dialog.tsx` | Modificar | Normalização de input (`BOB-xxxx`) + confirmação de transferência com Enter |
| `grafica-app/src/app/(dashboard)/estoque/page.tsx` | Modificar | Adicionar botão/ação para abrir o gerador de etiquetas |
| `grafica-app/src/app/(dashboard)/maquinas/page.tsx` | Modificar | Atalho global F2 + botão de atalho visual no canal |

---

## 4. Detalhamento Técnico

### 4.1 Gerador de PDF e Grid (`grafica-app/src/lib/labels/imposition.ts`)
- **Folha:** 330 × 480 mm (em pontos: `330 * 2.83465` × `480 * 2.83465` ≈ 935.43 × 1360.63 pt).
- **Margem:** 5 mm (14.17 pt). Área útil: 320 × 470 mm.
- **Etiqueta:** 106 × 35 mm (300.47 × 99.21 pt).
- **Gap:** 3 mm (8.50 pt).
- **Modos de Rotação:**
  - `0°`: 2 colunas × 12 linhas = 24 etiquetas/folha.
  - `90°`: 8 colunas × 4 linhas = 32 etiquetas/folha.
- **Conteúdo da Etiqueta:**
  - Borda preta contínua de 1pt.
  - QR Code (`BOB:1042` ou `TNK:502`) no lado esquerdo (~27×27 mm).
  - Lado direito: Código curto em destaque (`#1042`), Nome/Descrição da Mídia, Metragem/Quantidade e Lote.

### 4.2 Interface de Imposição (`LabelImpositionDialog`)
- Preview em SVG escalado proporcionalmente à folha 330×480 mm.
- Toggle de orientação (Padrão 0° [24 un] vs Rotacionada 90° [32 un]).
- Lista de seleção de bobinas/tintas cadastradas para compor o lote com preenchimento rápido.
- Botão "Imprimir Folha Konica" gerando o Blob PDF e abrindo o diálogo nativo/download do navegador.

### 4.3 Refinamento do `MediaSelectDialog` (Quick Switch F2)
- Parser de entrada: extrai dígitos se o usuário digitar `BOB-1042`, `BOB:1042` ou `1042`.
- Verificação de conflito: se a bobina encontrada possui `location` apontando para outra máquina ativa e `state === "IN_USE"`, armazena estado de confirmação pendente:
  - Alerta visual no dialog: *"Bobina está em uso na [Máquina]. Pressione Enter para confirmar a transferência."*
  - Segundo `Enter` executa a troca.
- Preserva o modal aberto com foco e seleção do texto em caso de erro.

---

## 5. Critérios de Aceite

- [x] `pdf-lib` e `qrcode` instalados e funcionando no Next.js client.
- [x] O componente `LabelImpositionDialog` renderiza preview em tempo real da folha 330×480mm com 24 ou 32 posições.
- [x] O PDF gerado respeita milimetricamente o tamanho da folha, a margem de 5mm, o gap de 3mm e a borda de corte de 1pt.
- [x] O QR Code impresso possui o payload semântico correto (`BOB:xxxx` ou `TNK:xxxx`).
- [x] Pressionar `F2` na página de máquinas permite buscar por `BOB-xxxx` diretamente.
- [x] Transferência de bobina entre máquinas no `MediaSelectDialog` exige confirmação com segundo `Enter` sem travar a produção.
