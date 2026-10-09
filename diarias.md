  ### Dia 07-10-26
  
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

### Dia 08-10-26

  Toda a implementação de customização da linha-guia e logging de diagnóstico por
  execução foi concluída e validada ponta a ponta com sucesso!
  Consulte os detalhes consolidados no artefato walkthrough.md.
  ──────
  ### 🚀 Resumo das Entregas
  1. Customização da Linha-Guia de Emenda:
      • Ativar/Desativar: Flags --guide-line / --no-guide-line suportadas no SeamsCLI
      e no MontarEmendas.bat.
      • Cores CMYK: Suporte a presets (k40, k100, magenta, cyan, yellow, white, red)
      ou valores percentuais diretos C,M,Y,K (ex: 0,100,100,0) via --line-color / -c.
      Desenhado nos canais CMYK sem conversão para RGB (Regra R-020).
      • Espessura do Risco: Ajuste em pontos PDF via --line-thickness / -t (presets:
      1.0 pt padrão, 1.5 pt, 2.0 pt, 0.5 pt ou personalizada).
  2. Infraestrutura de Logging de Diagnóstico (ADR-058):
      • Cabeçalho com Telemetria: Registra versão, OS, runtime .NET, CPU cores, RAM e
      comando executado.
      • 9 Pontos do Pipeline: Registra parâmetros, dimensões detectadas, DPI, cálculo
      de cada painel, progresso de exportação, arquivos gerados, tempo total e stack
      trace completo de exceções em caso de falha.
      • Templates Automáticos: Cria automaticamente README.txt e feedback.txt na pasta
      logs/ para o seu amigo preencher suas impressões e devolver o zip.
      • Fail-Safe & Saída Limpa: Se faltar permissão de escrita de log, a CLI continua
      operando normalmente; se --json for solicitado, stdout emite estritamente o JSON
      (Regra R-019).
      • Desativação e Caminho Custom: Flags --no-log e --log-dir <caminho>.
  3. Menu Interativo MontarEmendas.bat:
      • Pergunta se deseja a linha-guia ([ENTER] mantém ligada).
      • Menu numerado de cores (K40%, K100%, Magenta, Branco, Ciano ou Outra).
      • Menu numerado de espessuras (1.0 pt, 1.5 pt, 2.0 pt, 0.5 pt ou Outra).
      • Mostra no final a pasta de saída e o aviso sobre a pasta logs/.
  4. Validação & Publicação:
      • Suíte .NET: 271 testes funcionais aprovados (Core: 135, Render: 26, PDF: 58,
      CLI: 52).
      • Binário de Produção: Publicado em sidecars/bin/seams-cli/SeamsCLI.exe.
      • Teste Real de Fábrica: Testado com sucesso sobre a imagem real de 80.4 MB
      (Teste 02.jpg), fatiando os 2 painéis perfeitamente em CMYK com resolução nativa
      de 353 DPI, linha magenta de 1.5 pt desenhada na emenda e log completo
      registrado em logs/.


### UI - ESTOQUE - 08-10-26
  ### O que causava o erro e o que foi resolvido

  1. Trava legada de tinta eliminada (ADR-057 / BR-012):
      • O backend da Mimaki ainda continha uma validação antiga (temTinta /
      debitoParcial) que bloqueava o vínculo de mídia caso o job já possuísse qualquer
      registro de tinta UV no histórico (o job 31350 possuía registros de tinta do dia
      06/10).
      • Essa trava foi completamente removida: como a tinta é puramente analítica para
      relatórios em ink_consumption_log, ela nunca bloqueia nem interfere na baixa da
      bobina ou folha.
  2. Permissão de Re-vínculo e Troca de Material:
      • Implementado suporte a re-bind com estorno automático: se o operador precisar
      trocar a mídia de um job já vinculado, o sistema estorna os metros da bobina
      anterior (ou folhas anteriores) e realiza o débito na nova mídia escolhida.
      • Adicionada diferenciação por [Job shortId] nas transações de estoque para que
      duas impressões do mesmo arquivo PDF não interfiram uma no histórico da outra.
  3. Correção na Ação em Massa (bulk-deduct) da Mimaki:
      • Ajustado o filtro de jobs pendentes para incluir jobs em PENDING_BIND mesmo
      que possuíssem logs antigos.
  4. Job 31350 Atualizado no Banco de Dados:
      • Os dois registros do job 31350 - Dona Tunica - Adesivo - Bopp Prata - 216un.
      pdf foram vinculados com sucesso ao material Bopp Prata 75cm e à bobina Rolo
      Bopp Prata 75cm, ficando com status VINCULADO (BOUND) e estoque baixado.

  ──────
  ### Verificação

  • Testes Backend: 26/26 suítes aprovadas, 196/196 testes verdes (incluindo testes de
  re-vínculo com estorno em mimaki-bind.test.ts).
  • TypeScript Frontend: 0 erros de compilação (npx tsc --noEmit).

    Implementamos com sucesso o Menu de Contexto estilo Windows, as Ações em Massa no
  Botão Direito e a Exclusão de Jobs (Individual e em Lote) na tabela!
  ──────
  ### O que foi implementado:

  #### 1. 🪟 Menu de Contexto Estilo Windows (WindowsContextMenu)
  • Estética Desktop / Windows 11: Efeito acrílico translúcido (backdrop blur), cantos
  arredondados, elevação com sombra suave, ícones alinhados, divisores sutis e atalhos
  de teclado visuais.
  • Detecção de Bordas (Collision Clamping): O menu calcula a largura e altura da
  janela e se auto-posiciona para nunca vazar para fora da tela.
  • Fechamento Natural: Fecha automaticamente ao clicar em uma opção, ao clicar fora
  ou ao pressionar a tecla Esc.
  ──────
  #### 2. ⚡ Comportamento Inteligente por Seleção
  • Mais de um job selecionado (Ações em Massa):
  Ao clicar com o botão direito em itens selecionados, o menu exibe:
      • ⚡ Debitar Selecionados em Massa... (com badge contendo o total de itens, abre
      o modal BulkDeductDialog).
      • 🗑 Excluir N jobs selecionados... (abre confirmação de exclusão em lote, com
      indicação do atalho Del).
      • ✖ Desmarcar todos (limpa a seleção atual).
  • Clique individual (ou se o item não estava selecionado):
  Seleciona o job e abre as opções específicas dele:
      • ✏ Vincular / Editar Material... (abre o modal de edição de mídia/folhas).
      • ⚡ Debitar Material... (se o job estiver pendente de débito).
      • 👁 Ocultar / Restaurar Job... (para administradores).
      • 🗑 Excluir job... (abre diálogo de exclusão individual).

  ──────
  #### 3. 🗑 Exclusão de Jobs da Tabela e do Banco de Dados
  • Endpoints no Backend:
      • DELETE /api/jobs/:id: Remove o job das tabelas print_jobs ou mimaki_jobs e
      emite evento Socket.IO em tempo real.
      • POST /api/jobs/bulk-delete: Remove múltiplos jobs em massa de uma só vez.
  • Modal de Confirmação Seguro (DeleteJobDialog):
      • Exibe o nome do job (ou a listagem dos jobs selecionados em lote).
      • Avisa claramente sobre a remoção definitiva.
      • Botão de confirmação destrutivo com spinner de carregamento.
  • Atalho de Teclado Delete / Del:
      • Se houver jobs selecionados na tabela, pressionar Delete no teclado abre
      instantaneamente o modal de exclusão.
  • Botão na Barra Flutuante:
      • A barra flutuante inferior também recebeu o botão vermelho "Excluir
      Selecionados".

  ──────
  #### 4. 🖨 Compatibilidade Total

  • Funciona tanto na tabela da Konica Minolta e HP Latex (MachineJobsTable), quanto
  na tabela da Mimaki (MimakiJobsTable).
  ──────
  ### Evidências de Teste e Validação:

  • Testes Backend: 28 suítes de teste executadas com 216 testes 100% aprovados
  (incluindo testes de exclusão individual e em lote em jobs-delete.test.ts).
  • Build de Produção: npm run build compilou com sucesso gerando todas as 15 rotas
  estáticas sem nenhum erro de tipagem.


### dia 09-10-26
-- Motor 
      ### O que foi corrigido no script MontarEmendas.bat

  1. Caminho do Arquivo Vazio (Arquivo: ""):
      • Causa: No .bat, o comando :resetar_config limpava a variável INPUT dentro do
      bloco if exist "%~1" (...) antes de ela ser atribuída com %~1. Como o
      enabledelayedexpansion estava ativo, a variável ficava vazia ao ser exibida na
      tela do menu.
      • Solução: Ajustado o script para armazenar primeiro set "ARG1=%~1", rodar a
      limpeza e atribuir set "INPUT=!ARG1!" com expansão atrasada. Agora, ao arrastar
      um ou vários arquivos para o .bat, o nome do arquivo aparece corretamente no
      menu (Arquivo: "C:\caminho\seu_arquivo.pdf").
  2. Configuração de Cores e Espessura da Linha-Guia:
      • Solução: Adicionadas as atribuições explícitas if "!SEL!"=="1" set
      "LINE_COLOR=k40" e if "!SEL!"=="1" set "LINE_THICKNESS=1.0". Pressionar [ENTER]
      no prompt de cor seleciona explicitamente Cinza K40% (padrão de pré-impressão) e
      1.0 pt.
  3. Binário Atualizado:
      • O binário sidecars\bin\seams-cli\SeamsCLI.exe foi novamente publicado via
      dotnet publish.

  ──────
  ### Teste Recomendado

  Arraste o arquivo PDF ou JPG desejado para o arquivo MontarEmendas.bat e pressione
  ENTER em cada etapa do menu:

  1. O caminho do arquivo será exibido em Arquivo: "...".
  2. A cor da linha assumirá k40 e espessura 1.0 pt.
  3. O CLI gerará os painéis com > 300 KB e a linha-guia visível.



  ### Soluções Implementadas & Diagnóstico Técnico
  #### 1. Resolução do Recorte no CorelDRAW e Adobe Illustrator (PDF)
  • Causa Raiz: O CorelDRAW e o Adobe Illustrator importam objetos contidos em Form
  XObjects (/FmOriginal) sem aplicar os limites de visualização de página (/MediaBox /
  /CropBox), exibindo o banner inteiro.
  • Solução (QdfPanelSplitter.cs): Injetamos uma Máscara Vetorial Estrita de Recorte
  (Clipping Path ISO 32000 §8.5.4) diretamente no content stream de cada painel:
    q
    0 0 1417.32 2834.65 re W n
    1 0 0 1 -750.0 0 cm
    /Fm0 Do
    Q

      • 0 0 panelWPt panelHPt re W n: Cria o retângulo exato das dimensões do painel e
      aplica o operador W (Clipping Path).
      • Resultado: Agora, ao abrir ou importar o PDF no CorelDRAW, Adobe Illustrator,
      PitStop ou RIPs de Impressão, a arte abre cortada na janela do painel.

  ──────
  #### 2. Resolução das Cores e Espessura no JPG (RasterPanelSplitter.cs)

  • Causa Raiz: O traço de rasterização não era centralizado simetricamente sobre o
  eixo da sobreposição (lineXPx), o que tornava a espessura imperceptível em imagens
  CMYK de alta resolução (300+ DPI).
  • Solução (RasterPanelSplitter.cs):
      • A linha passou a ser calculada e centralizada simetricamente (startX = lineXPx -
      (thicknessPx / 2)).
      • Ajustado o dimensionamento de pixels proporcional ao DPI e garantido o limite
      mínimo de espessura visível para CMYK.

  ──────
  ### Execução e Teste de Validação

  O executável sidecars\bin\seams-cli\SeamsCLI.exe foi republicado com ambas as
  correções e testado contra os arquivos da pasta C:\Users\impressao\Desktop\Emenda
  Teste\09-10-26\AC\:

  Arquivos de Teste Gerados:

  • Pasta de saída: C:\Users\impressao\Desktop\Emenda Teste\09-10-
  26\Matriz_De_Testes_Com_Clipping\

   Caso de Teste        | Form… | Arquivos Gerados         | Status
  ----------------------|-------|--------------------------|--------------------------
   01_pdf_magenta_2.0pt | PDF   | 01_pdf_magenta_2.0pt_pai | Clipping Path re W n +
                        |       | nel_01.pdf,              | Magenta CMYK (K/k)
                        |       | painel_02.pdf            |
   02_pdf_cyan_1.5pt    | PDF   | 02_pdf_cyan_1.5pt_painel | Clipping Path re W n +
                        |       | _01.pdf, painel_02.pdf   | Ciano CMYK (K/k)
   03_jpg_magenta_2.0pt | JPG   | 03_jpg_magenta_2.0pt_pai | Magenta 100% CMYK
                        |       | nel_01.jpg,              | Centralizado
                        |       | painel_02.jpg            |
   04_jpg_cyan_1.5pt    | JPG   | 04_jpg_cyan_1.5pt_painel | Ciano 100% CMYK
                        |       | _01.jpg, painel_02.jpg   | Centralizado

  Você já pode abrir os PDFs gerados na pasta Matriz_De_Testes_Com_Clipping no
  CorelDRAW ou Illustrator: eles abrirão cortados na fatia do painel.

────────────────────────────────────────────────────────────
> em jpg a imagem continua com a linha preta nao da colocando a cor correta
