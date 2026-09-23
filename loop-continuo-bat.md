# Plano de Implementação — Loop Contínuo e Suporte a Múltiplos Arquivos nos Scripts .bat

> **Status:** Proposto para aprovação  
> **Arquivos afetados:** [`MontarPDF.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/MontarPDF.bat) e [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat)

---

## 1. Descrição do Problema e Objetivo

Atualmente, ao executar [`MontarPDF.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/MontarPDF.bat) (seja diretamente ou através dos atalhos [`Montar_SRA3_Konica.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Montar_SRA3_Konica.bat), [`Montar_Chapa_70x100.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Montar_Chapa_70x100.bat) e [`Montar_Rolo_Mimaki.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Montar_Rolo_Mimaki.bat)) ou [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat), o script processa apenas 1 arquivo PDF e atinge a seção `:sair` com `pause`, finalizando o terminal. 

O operador de pré-impressão precisa reabrir a janela `.bat` toda vez que for montar um novo arquivo.

### Objetivos:
1. **Loop Contínuo Interativo:** Após finalizar a imposição de um arquivo com sucesso (ou após cancelar um erro), o terminal permanece aberto e solicita imediatamente o próximo PDF:
   ```
   ============================================================
     Arraste o próximo arquivo PDF (ou pressione ENTER para sair):
   ============================================================
   >> PDF: 
   ```
   - Se o operador arrastar um arquivo e der Enter: inicia o fluxo de configuração do novo arquivo.
   - Se o operador der Enter sem digitar nada: o script encerra amigavelmente (`exit /b 0`).
2. **Preservação de Contexto (Presets):** Se o operador abriu por um atalho específico (como `Montar_SRA3_Konica.bat`), a variável `MONTAR_PRESET=sra3_konica` permanece ativa durante todo o loop daquela sessão, mantendo a agilidade.
3. **Limpeza de Estado entre Ciclos:** Reset rigoroso de variáveis temporárias (`PDF`, `TARGET_ARG`, `SURPLUS_ARG`, `OUTPUT_ARG`, dimensões, etc.) para evitar contaminação de dados entre um arquivo e o próximo.
4. **Suporte a Múltiplos Arquivos Arrastados:** Se o operador selecionar vários PDFs no Windows Explorer e soltá-los juntos no `.bat`, o script processa um a um, solicitando as configurações de cada um individualmente (conforme preferência confirmada).

---

## 2. Decisões do Usuário Alinhadas

- **Ação pós-processamento:** Pedir imediatamente o próximo PDF (basta arrastar e dar Enter; Enter vazio encerra).
- **Múltiplos arquivos soltos juntos:** Processar cada arquivo em sequência, permitindo configurar cada um individualmente.
- **Escopo:** Aplicar em [`MontarPDF.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/MontarPDF.bat) (que abastece todos os atalhos) e em [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat).

---

## 3. Mudanças Propostas

### Componente: Scripts de Automação Batch

#### [MODIFY] [`MontarPDF.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/MontarPDF.bat)

1. **Gestão de Argumentos Iniciais (`%*`):**
   - Se `%1` contiver um ou mais arquivos válidos arrastados, processar o primeiro e preparar fila ou passar ao fluxo interativo.
   - Caso não haja mais argumentos em fila, saltar para o prompt interativo contínuo `:pedir_pdf`.
2. **Loop em `:sucesso` e `:sair`:**
   - Em vez de saltar direto para `pause` e fechar o script:
     ```bat
     :sucesso
     echo.
     echo ============================================================
     echo  [OK] Imposicao concluida com sucesso!
     echo ============================================================
     echo.
     goto pedir_pdf
     ```
3. **Detecção de Saída no `:pedir_pdf`:**
   - Se `!USER_INPUT!` for vazio no loop:
     ```bat
     if "!USER_INPUT!"=="" (
         echo.
         echo Encerrando sessao de imposicao. Ate logo!
         goto sair
     )
     ```
4. **Reset de Variáveis por Iteração:**
   - Criar uma rotina `:resetar_estado` que limpa: `PDF`, `USER_INPUT`, `PW`, `PH`, `GAP`, `MARG`, `ROT`, `ROTOPCAO`, `COPIAS`, `TARGET_ARG`, `SURPLUS_ARG`, `SUBSTRATE_ARG`, `TRIM_ARG`, `MARKS_ARG`, `OUTPUT_ARG`, `PEDIDO`, `STDERR_FILE`, etc., mantendo `MONTAR_PRESET`.
5. **Tratamento de Cancelamento em Erros:**
   - Ao optar por "Cancelar" nos menus de erro, em vez de fechar a janela, retornar ao `:pedir_pdf` para que o operador possa tentar outro arquivo sem reabrir o terminal.

---

#### [MODIFY] [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat)

1. **Estrutura de Loop Contínuo:**
   - Adicionar rótulo `:inicio_loop` e `:pedir_pdf`.
   - Limpeza de aspas e espaços no final (`trim_space`) ao receber o caminho do PDF.
2. **Detecção de Saída Amigável:**
   - Se o campo de PDF for deixado em branco ao pressionar Enter:
     ```bat
     if "!USER_INPUT!"=="" (
         echo Encerrando sessao do Illustrator. Ate logo!
         goto sair
     )
     ```
3. **Pós-processamento:**
   - Após executar `"%BIN%" ...` com sucesso:
     ```bat
     echo ============================================================
     echo  [OK] Arquivo gerado com sucesso no Illustrator!
     echo ============================================================
     goto pedir_pdf
     ```
4. **Reset de Parâmetros:**
   - Resetar `PDF`, `SHEET_W`, `COPIAS`, `GAP`, `MARGIN`, `MODO`, `MANTER`, `OUTPUT`, `DIRNAME`, `BASENAME` a cada novo ciclo.

---

## 4. Plano de Verificação

### Verificação Manual
1. **Execução Interativa `MontarPDF.bat`:**
   - Rodar em terminal ou via duplo clique.
   - Fornecer um arquivo PDF de teste.
   - Confirmar opções e verificar geração.
   - Constatar que o script **não** fecha a janela e exibe o prompt para o próximo PDF.
   - Pressionar [ENTER] vazio e constatar que encerra normalmente.
2. **Execução via Atalho `Montar_SRA3_Konica.bat`:**
   - Abrir o atalho e verificar se o preset SRA3 é mantido no primeiro arquivo e nos arquivos subsequentes no loop.
3. **Execução `Impor_Illustrator.bat`:**
   - Abrir o script, validar a mensagem de repetição contínua e a saída com Enter vazio.
4. **Sintaxe e Ausência de Erros no CMD:**
   - Validar que variáveis com espaços ou aspas não quebram o interpretador `cmd.exe`.
