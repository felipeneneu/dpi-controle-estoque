# ADR-058: Contrato de Logging e Diagnóstico Headless (Módulo Seams / CLI)

> **Status:** Aprovado  
> **Data:** 2026-10-08  
> **Autor:** Engenharia GraficaOS  
> **Domínio:** imposition / prepress / cli  
> **Regra de Negócio:** BR-058  
> **Complementa:** ADR-055, ADR-056; Aplica Regras R-009, R-013, R-019  

---

## 1. Contexto

O utilitário `SeamsCLI` e seu launcher `MontarEmendas.bat` são distribuídos para operadores em ambientes de fábrica e parceiros externos de impressão. Quando ocorrem falhas operacionais, exceções de pré-voo ou problemas de compatibilidade de arquivo, o diagnóstico remoto fica inviabilizado se não houver um registro persistente e contextualizado das execuções.

Hoje, mensagens de erro vão apenas para `stderr` do console e são perdidas no fechamento da janela. Além disso, exceções com *stack trace* completo são mascaradas ou não registradas, impossibilitando identificar exatamente qual etapa falhou no ambiente do cliente.

---

## 2. Decisões

### Decisão 1: Log de Diagnóstico por Execução
- Cada execução do `SeamsCLI` gera um arquivo de log individual na pasta `<pasta do SeamsCLI.exe>/logs/`.
- O padrão de nomenclatura é determinístico e cronológico:
  `YYYY-MM-DD_HH-mm-ss_<jobName>.log` (ex: `2026-10-08_14-32-15_banner1.log`).

### Decisão 2: Formato Legível e Timestamps em Milissegundos
- O arquivo é texto puro UTF-8 (`StreamWriter`).
- Cada linha segue o formato: `[HH:mm:ss.fff] [LEVEL] Mensagem` (onde LEVEL é `INFO`, `WARN` ou `ERROR`).
- Seções lógicas usam delimitadores visuais (`===`) para leitura rápida humana.

### Decisão 3: Cabeçalho com Contexto Completo do Ambiente
Toda execução inicia registrando o contexto de infraestrutura:
- Versão do `SeamsCLI`.
- Data e hora UTC / Local.
- Hostname, Sistema Operacional e versão do runtime .NET.
- Recursos da máquina (núcleos de CPU e RAM física total).
- Linha de comando completa recebida.
- Caminho absoluto do arquivo de log.

### Decisão 4: Rastreamento em 9 Pontos do Pipeline
O log deve registrar obrigatoriamente:
1. Início e ambiente.
2. Parâmetros parseados e resolvidos.
3. Informações da arte de entrada (caminho, tamanho, dimensões, DPI detectado/fallback).
4. Resultado do cálculo geométrico de painéis (larguras, overlap, encolhimento).
5. Início do processo de exportação (formato, pasta de saída).
6. Conclusão de cada painel com dimensões, tamanho de arquivo e tempo decorrido.
7. Conclusão da execução com código de saída (exit code) e tempo total.
8. Erros e exceções com mensagem de negócio e *stack trace* completo.
9. Avisos técnicos emitidos durante o fluxo.

### Decisão 5: Stack Trace Completo em Erros
- Em qualquer exceção inesperada ou erro fatal, o *stack trace* completo do .NET é gravado no log, garantindo diagnóstico preciso sem depender de reprodução em ambiente de desenvolvimento.

### Decisão 6: Opções de Controle (`--no-log` e `--log-dir`)
- Flag `--no-log`: desativa totalmente a escrita de arquivos de log (útil para testes automatizados, CI e benchmarks).
- Opção `--log-dir <caminho>`: permite redirecionar a pasta de gravação dos logs.

### Decisão 7: Resiliência e Fail-Safe (Falha de IO no Log Nunca Aborta o Job)
- Caso o diretório de logs esteja protegido contra escrita ou ocorra qualquer erro ao tentar abrir ou gravar o arquivo de log, o CLI emite um aviso em `stderr` e continua o processamento gráfico normalmente. Falha no subsistema de diagnóstico **nunca** aborta a produção gráfica.

### Decisão 8: Templates de Suporte (`README.txt` e `feedback.txt`)
- Na primeira execução com logging ativo, se ausentes na pasta `logs/`, o CLI cria automaticamente:
  - `README.txt`: Instruções claras para o operador/testador ("execute o .bat, avalie os resultados, preencha o feedback.txt, compacte esta pasta e envie").
  - `feedback.txt`: Questionário estruturado ("O que funcionou bem", "O que falhou", "Sugestões de melhoria").

### Decisão 9: Preservação Estrita do `stdout` (Compatibilidade com `--json`)
- O subsistema de logging escreve estritamente no disco e, quando verboso, em `stderr`.
- O `stdout` permanece 100% puro para a emissão de `RESULT_JSON`, mantendo a integração headless com outros processos intacta.

---

## 3. Consequências

- **Positivas:** Diagnóstico remoto imediato de problemas em birôs de terceiros através de um simples zip da pasta `logs/`. Visibilidade total de performance e rastreamento de falhas.
- **Negativas / Mitigações:** Acúmulo de pequenos arquivos texto em disco ao longo do tempo. Como logs pesam poucos kilobytes por execução, o impacto em armazenamento é insignificante; política de expiração futura poderá ser avaliada se necessário.
