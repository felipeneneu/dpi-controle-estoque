# Plano de Implementação: Mesa de Imposição Three.js (Estilo Kodak Preps) & Quick-Switch F2

## 1. Overview
Substituição definitiva do antigo modal rígido de imposição por uma Mesa de Imposição Gráfica Profissional em tela cheia orientada a WebGL (Three.js), com câmera ortográfica milimétrica (1 unidade = 1 mm), controles de Pan/Zoom fluídos por GPU, AutoGang e exportação de PDF vetorial milimétrico para a impressora digital Konica Minolta (SRA3 330 × 480 mm).
Adicionalmente, implementação do componente de troca rápida `QuickSwitchBar.tsx` no Electron, ativado via atalho global `F2` para vinculação de bobinas em menos de 2 segundos.

- **Projeto:** GraficaOS (DPI Controle de Estoque)
- **Tipo de Projeto:** WEB / ELECTRON DESKTOP
- **Governança:** ADR-014 (Emenda 1 - 90×35mm), BR-002, BR-010, BR-021

---

## 2. Critérios de Sucesso
1. **Área de Trabalho em Tela Cheia:** Rota `/imposicao` (ou container full-viewport 100vw × 100vh) limpa, sem engessamento de modais pequenos, no padrão Studio Dark.
2. **WebGL / Three.js 2D:**
   - 1 unidade = 1 mm.
   - Folha de 330 × 480 mm, margem Konica de 5 mm e gap configurável (padrão 3 mm).
   - Grade vertical de 8 colunas × 5 linhas = 40 etiquetas (35 × 90 mm) e horizontal de 3 colunas × 12 linhas = 36 etiquetas (90 × 35 mm).
   - Pan (arraste do mouse) e Zoom (scroll do mouse de 0.3x a 5x) com foco centralizado.
   - Texturas nítidas dos slots preenchidos geradas via `CanvasTexture` com QR Code vetorial offline e textos legíveis.
   - Drag & Drop de insumos da barra lateral diretamente para as posições da chapa via raycasting Three.js.
   - Botão **⚡ AutoGang** preenchendo todos os slots vagos com 1 clique.
3. **PDF Vetorial para Konica:**
   - Resolução real milimétrica convertida para pontos PostScript ($1\text{ mm} = 2.83465\text{ pt}$).
   - Borda contínua preta de 1pt para guia de corte/meio-corte.
   - QR Codes PNG nítidos e textos vetoriais nativos Helvetica/Helvetica-Bold via `pdf-lib`.
4. **Quick-Switch Electron F2:**
   - Componente `QuickSwitchBar.tsx` fixo no layout com máquina ativa, bobina atual e metragem.
   - Tecla `F2` abre modal com input focado imediatamente; operador digita o código curto (`1042`), aperta `Enter` e a troca é concluída em < 2s.

---

## 3. Stack Tecnológica
- **Frontend / Desktop:** Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, Electron.
- **Renderização Gráfica:** Three.js (`three` + `@types/three`) com `OrthographicCamera`, `CanvasTexture`, `Raycaster`.
- **Geração de Documentos:** `pdf-lib` (geração vetorial client-side), `qrcode` (geração offline de matrizes QR).
- **Gerenciamento de Estado & Requisições:** TanStack React Query v5, Zustand, Sonner.

---

## 4. Estrutura de Arquivos e Modificações

```
grafica-app/
├── package.json                               # [MODIFY] Adicionar 'three' e '@types/three'
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                    # [MODIFY] Integrar <QuickSwitchBar />
│   │   │   └── estoque/
│   │   │       └── page.tsx                  # [MODIFY] Redirecionar botão para /imposicao
│   │   └── imposicao/
│   │       └── page.tsx                      # [NEW] Página dedicada em tela cheia (Preps Workspace)
│   ├── components/
│   │   ├── imposition-three-canvas.tsx       # [NEW] Viewport WebGL Three.js com Pan/Zoom/Raycast/D&D
│   │   ├── quick-switch-bar.tsx              # [NEW] Barra fixa de mídia ativa + modal atalho F2
│   │   └── label-imposition-dialog.tsx       # [REPLACE/CLEANUP] Deprecar modal engessado
│   └── lib/
│       └── labels/
│           └── imposition.ts                 # [VERIFY/REFINE] Motor matemático e gerador pdf-lib 90x35mm
```

---

## 5. Tarefas Detalhadas

### TAREFA 1: Workspace de Imposição em Tela Cheia (`/imposicao`)
- **Agente Responsável:** `frontend-specialist`
- **Skills:** `frontend-design`, `frontend-architecture`, `clean-code`
- **Descrição:**
  - Criar `src/app/imposicao/page.tsx` com ocupação de 100vw × 100vh, background `#0a0a0a` (Studio Dark).
  - Header:
    - Botão de retorno "← Voltar ao Estoque".
    - Contadores de ocupação: "X / 40 posições (Y%)".
    - Botão de rotação: "Vertical (8×5 = 40 un)" vs "Horizontal (3×12 = 36 un)".
    - Botão **⚡ AutoGang**.
    - Inputs numéricos de precisão para Margem (mm) e Gap (mm).
    - Controles de zoom (+, -, 100%, Fit).
  - Sidebar esquerda (w-80):
    - Abas "Todos", "Bobinas", "Tintas".
    - Busca instantânea por código/nome.
    - Cartões arrastáveis com `onDragStart`.
    - Botão (+) para inserção rápida no próximo slot livre.
  - Rodapé com estatísticas da chapa e botão destacado de exportação Konica.
- **INPUT:** Dados do estoque via TanStack Query (`useStockItems`, `useBobinas`, `useGarrafas`).
- **OUTPUT:** Rota `/imposicao` acessível e fluida.
- **VERIFY:** Navegação a partir do estoque abre o workspace em tela cheia sem barras de rolagem globais indesejadas.

---

### TAREFA 2: Viewport Three.js 2D com Câmera Ortográfica
- **Agente Responsável:** `frontend-specialist`
- **Skills:** `frontend-architecture`, `clean-code`, `performance-profiling`
- **Descrição:**
  - Instalar `three` e `@types/three` no `grafica-app`.
  - Criar `src/components/imposition-three-canvas.tsx`:
    - `OrthographicCamera` com foco em `(SHEET_WIDTH_MM / 2, SHEET_HEIGHT_MM / 2)`.
    - Manipulação de Pan (arrastar com botão do mouse atualiza `camera.position`).
    - Manipulação de Zoom (wheel event atualiza `camera.zoom` suavemente entre `0.3` e `5.0`).
    - Renderização da folha branca 330 × 480 mm e borda tracejada vermelha da margem de segurança da Konica (5 mm).
    - Renderização de slots vazios com wireframe/número do slot.
    - Renderização de slots preenchidos usando canvas offscreen convertido em `CanvasTexture` (com QR Code local, código `#1042`, título e 1pt border).
    - Raycasting para detecção de drop: ao soltar item arrastado da lista lateral sobre o canvas, calcula a coordenada milimétrica na folha e posiciona o item no slot correspondente.
    - Interatividade de clique/arraste entre slots diretamente na mesa (troca de posições).
    - Função de cleanup completa no unmount do React (`renderer.dispose()`, `cancelAnimationFrame`).
- **INPUT:** Array `sheet` com 40 ou 36 slots e parâmetros de margem/gap.
- **OUTPUT:** Componente WebGL 60 FPS com pan, zoom, raycast drop e renderização milimétrica.
- **VERIFY:** Arrastar itens da barra lateral para o canvas posiciona as etiquetas no slot correto com feedback visual.

---

### TAREFA 3: Geração de PDF Vetorial Real (`pdf-lib` + `qrcode`)
- **Agente Responsável:** `backend-specialist` / `frontend-specialist`
- **Skills:** `clean-code`, `lint-and-validate`
- **Descrição:**
  - Em `src/lib/labels/imposition.ts`, assegurar que a função `generateImpositionPdf`:
    - Dimensiona a página SRA3 exatamente em $330 \times 2.83465\text{ pt}$ por $480 \times 2.83465\text{ pt}$.
    - Aplica o contorno contínuo preto de 1pt em cada etiqueta.
    - Renderiza QR Code em PNG com alta fidelidade sem margem extra (`margin: 0`).
    - Insere textos vetoriais com Helvetica Bold para código curto `#xxxx` e Helvetica para especificações de mídia.
    - Suporta rotação 90° (40 etiquetas) e 0° (36 etiquetas).
    - Dispara download imediato ou visualização no Electron.
- **INPUT:** Array de slots preenchidos e opções de imposição.
- **OUTPUT:** Buffer PDF vetorial milimétrico pronto para impressão na Konica Minolta.
- **VERIFY:** Geração de PDF abre arquivo com medidas e guias de corte exatas.

---

### TAREFA 4: Componente Quick-Switch no Electron (Atalho F2)
- **Agente Responsável:** `frontend-specialist`
- **Skills:** `frontend-architecture`, `clean-code`
- **Descrição:**
  - Criar `src/components/quick-switch-bar.tsx`.
  - Fixar a barra no layout do dashboard (`src/app/(dashboard)/layout.tsx`):
    - Exibe máquina ativa atual.
    - Exibe bobina em uso e metragem restante.
    - Botão "Trocar Mídia (F2)".
  - Listener global `window.addEventListener('keydown', (e) => { if (e.key === 'F2') ... })`.
  - Modal minimalista:
    - Input com foco automático imediato.
    - Operador digita apenas os dígitos do código (ex: `1042`).
    - Pressionar `Enter` busca a bobina ativa/disponível correspondente.
    - Se a bobina já estiver em uso em outra máquina, exibe aviso claro de transferência e confirma com 2º `Enter`.
    - Executa mutação `useChangeBobina`, atualiza a máquina para a nova bobina com status `IN_USE` e fecha o modal.
    - Operação concluída em < 2 segundos.
- **INPUT:** Máquinas do sistema, lista de bobinas e digitação do operador.
- **OUTPUT:** Troca instantânea de mídia na máquina com atalho de teclado operacional.
- **VERIFY:** Pressionar `F2`, digitar código curto e teclar `Enter` atualiza a bobina ativa e o status no sistema.

---

## 6. Verificação e Testes (Fase X)
1. **Lint & Types:** `npx tsc --noEmit` no diretório `grafica-app`.
2. **Build:** `npm run build` no diretório `grafica-app` para certificar exportação estática Next.js compatível com Electron.
3. **Teste Funcional do Canvas:**
   - Zoom com wheel mouse entre 0.3x e 5x.
   - Pan arrastando o canvas.
   - Drag & Drop de bobina/tinta do painel lateral para a folha 3D.
   - AutoGang preenchendo todos os 40 slots.
   - Geração e inspeção visual do PDF SRA3.
4. **Teste Funcional do Quick-Switch:**
   - Tecla F2 aciona o popup em qualquer tela do sistema.
   - Digitação de código curto e Enter confirma a troca e atualiza a interface.
