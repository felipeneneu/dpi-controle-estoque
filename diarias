  ### Resumo das Implementações e Esclarecimentos
  ──────
  ### 1. Esclarecimento de Domínio & Estado do Débito de Tinta
  • Bobina vs. Folhas:
      • Bobinas (HP Latex / Mimaki): Material contínuo em rolo, medido estritamente em metros lineares (m), com largura cadastrada (width) e conversão de área m² ÷ largura.
      • Folhas (Konica Minolta AccurioPrint): Papéis cortados avulsos, medidos em unidades inteiras de folhas (fls), resmas (rms = 500) ou pacotes (pk = 50).
  • Tinta UV vs. Cartucho vs. Toner:
      • Tinta UV: Frascos/garrafas inteiras (Mimaki).
      • Cartuchos: Cartuchos inteiros (HP Latex 831).
      • Toner: Garrafas/cartuchos de toner (Konica TN-619).
  • A tinta já parou de debitar automaticamente?
      • SIM! 100% confirmado. Conforme a regra ADR-057 e emenda às regras BR-011 / BR-012, nenhum agente (HP Latex ou Mimaki) subtrai mais volume (ml/cc) do estoque de tinta por
      job. O consumo reportado pelos RIPs é gravado exclusivamente na tabela analítica ink_consumption_log para relatórios. O estoque de tinta agora conta apenas unidades inteiras
      disponíveis (NEW). Na Konica, o toner nunca foi debitado por job (TONER_EXPOSED = false), apenas acompanhado por telemetria e contador de páginas.

  ──────
  ### 2. Trava de Débito Automático por SKU na Impressora
  Implementada a trava em stock-deductor.ts e stock-deductor.ts:

  • Verificação via machine_items: Se o material detectado no RIP não estiver associado à impressora (ou se a impressora não tiver bobina ativa IN_USE correspondente no caso de
  grandes formatos), o débito automático é suspenso.
  • Status do Job: O job recebe materialStatus = 'PENDING_BIND', mantém stockDeducted = false, e fica visível na tabela como pendente para que o operador faça a associação e o
  débito via interface.
  • Correção na Konica: Corrigido o bug anterior onde jobs de papel não encontrados ou não vinculados eram indevidamente marcados com stockDeducted: true. Agora permanecem
  stockDeducted: false até o débito real.
  ──────
  ### 3. Ação em Massa Inteligente na Tabela de Jobs

  Para os casos em que múltiplos serviços foram impressos no mesmo material (mesma bobina ou mesmas folhas) e precisam ser debitados juntos:
  1. Seleção Múltipla com Checkboxes:
      • Adicionada coluna de seleção na MachineJobsTable, permitindo selecionar linhas individualmente ou marcar todos os jobs da página no checkbox do cabeçalho.
  2. Barra de Ação em Lote Inteligente:
      • Na aba de jobs (JobsTab), ao selecionar 1 ou mais jobs, surge uma barra destacada indicando:
          • Quantidade de jobs selecionados.
          • Somatório acumulado automático: Se Konica, soma o total de folhas (Σ X folhas); se HP/Mimaki, soma a metragem linear total (Σ X.XXXm lineares).
          • Botão destacado ⚡ Debitar Selecionados em Massa.
          • Botão de Limpar seleção.

  3. Modal Inteligente (BulkDeductDialog):
      • Diferenciação Clara de Domínio: Se Konica, exibe cabeçalho e orientações de papel em folhas; se HP/Mimaki, exibe orientações de bobina em metros lineares.
      • Auto-Detecção: Pre-seleciona automaticamente o SKU no catálogo caso os jobs selecionados tenham nomes de mídia coincidentes.
      • Bobina Ativa (Grandes Formatos): Permite vincular a uma bobina específica ou debitar da bobina atualmente em uso na máquina.
      • Justificativa Unificada: Registra uma única transação no histórico contábil (stock_transactions) referenciando todos os jobs do lote.
      • Baixa em 1 Clique: Chama POST /api/jobs/bulk-deduct, deduz o estoque, atualiza todos os jobs como stockDeducted = true e emite stock:updated via Socket.IO para atualizar a
      tela sem recarregar.

  ──────
  ### 4. Evidências de Validação

  • Backend: 26 arquivos de teste passando (193 testes 100% verdes), incluindo cenários de dedução em massa de bobina, folhas da Konica e jobs pendentes com PENDING_BIND.
  • Frontend: npx tsc --noEmit com zero erros de tipagem e build de produção Next.js Turbopack (npm run build) concluído com sucesso em todas as 15 rotas estáticas.
  • Git: Alterações comitadas na branch feature/estoque-tabela-tinta-unidade (commit e6de8b9). Checklist de execução em task.md atualizado.

  Todos os problemas relatados foram diagnosticados, corrigidos e validados diretamente com o arquivo real de fábrica (Teste 02.jpg).
  ──────
  ### 🔍 O Que Estava Causando os Problemas

  1. Aumento de tamanho e distorção de DPI:
      • O JpgExportOptions tinha um valor padrão fixo de 150 DPI. Como o arquivo de entrada (Teste 02.jpg) possui 353 DPI nativos, a resolução forçada a 150 DPI fazia com que
      visualizadores como o Photoshop interpretassem os pixels de forma reescalonada (em 2,35× o tamanho físico em cm).
      • O codec anterior não gravava marcadores de resolução em CMYK puro (para não emitir o proibido APP0 JFIF), fazendo com que o Photoshop fizesse fallback para 72 DPI.
  2. Distorção no fatiamento e margens:
      • A conversão de milímetros para pixels sofria perdas de arredondamento e padding desnecessário.

  ──────
  ### 🛠 Correções Implementadas
  1. Fidelidade 1:1 de Pixels e Preservação de DPI Nativo:
      • JpegCmykEncoder.ReadImageInfo: Varredura ultrarrápida nos cabeçalhos APP0, APP1 (Exif) e APP13 (Photoshop 3.0 ResolutionInfo 0x03ED) que detecta o DPI nativo em < 1 ms sem
      descompactar a imagem em memória RAM.
      • Injeção de Marcadores de Resolução: Ao salvar os painéis fatiados em CMYK puro, são gravados os blocos APP1 (Exif) e APP13 (Photoshop 8BIM 0x03ED). Isso garante que o
      Photoshop, Illustrator e RIPs reconheçam exatamente a densidade original (ex: 353 DPI) mantendo 100% de conformidade com a ISO/IEC 10918-5.
      • JpgExportOptions.Dpi agora é opcional (null por padrão). Se não for passado --dpi, o DPI da arte original é estritamente mantido.
  2. Corte e Fatiamento Fiel sem Interpolação:
      • Apenas o fatiamento (slice) pixel a pixel é realizado, adicionando a linha-guia tracejada K40% na sobreposição da emenda sem qualquer reescalonamento, sem interpolação e
      sem alterar as dimensões da arte original.
  3. Relato do Número de Emendas:
      • Adicionada a propriedade SeamCount ao resultado e ao JSON.
      • O console e o relatório agora exibem com precisão gramatical:
        [SeamsCLI] Sucesso: 2 painéis gerados (1 emenda).

  4. Seleção Interativa da Bobina no MontarEmendas.bat:
      • O script interativo agora pergunta de forma clara qual bobina será usada:
        QUAL A LARGURA DA BOBINA (ROLO) QUE VOCE VAI USAR?
         [1] 1520 mm   [ENTER - Padrao Industria BR]
         [2] 1270 mm
         [3] 1060 mm
         [4]  910 mm
         [5] Personalizado (digitar largura em mm)


  ──────
  ### 📊 Evidências de Validação Cruzada (R-021)

  Teste de fábrica executado sobre C:\Users\impressao\Desktop\Emenda Teste\Teste 02.jpg:

  • Dimensões de Entrada: 29.528 × 10.630 px @ 353 DPI (2.124,67 × 765,31 mm)
  • Bobina Utilizada: 1520 mm (área útil 1490 mm), margem lateral de 15 mm/lado, overlap de 10 mm (139 px):
      • Painel 01: 14.895 × 10.630 px @ 353 DPI (com linha-guia K40% no pixel 14.756)
      • Painel 02: 14.772 × 10.630 px @ 353 DPI
      • Soma exata: 14.756 + 14.772 = 29.528 px (100,00% da imagem preservada, 0 pixels esticados, 0 pixels perdidos).
  • Validação de Marcadores:
      • SOI (FF D8) e EOI (FF D9) válidos.
      • APP14 Adobe (FF EE) com ColorTransform = 0 (CMYK direto).
      • Marcadores de resolução: Has Exif APP1: True, Has Photoshop APP13: True.
  • Suíte de Testes Automatizados:
      • 269/269 testes aprovados (Core: 127, Render: 54, Pdf: 58, SeamsCLI: 30), 0 warnings, 0 erros.
      • Executável publicado em sidecars/bin/seams-cli/SeamsCLI.exe.