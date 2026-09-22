---
Status: Aprovado
Data: 2026-09-21
Autor: Agente PO / Agente IA
Domínio: Prepress / Marks
Links: PLAN-045-A-custom-marks, ADR-046
---
# ADR-045: Suporte a Marcas Customizadas via Arquivo Externo (--mark-file)

## Contexto e Problema
Operadores de gráfica gostam de usar marcas personalizadas (ex: marcas de dobra NELA, barras de cores) em vez de apenas cruzes simples geradas por código. O Kodak Preps faz isso através de SmartMarks, mas nós precisávamos injetar esses PDFs vetoriais externos diretamente no nosso processo C# (via imposition-pdf) e controlar offset pelo CLI.

## Decisão
1. Adicionar o enum MarkType.CustomPdf e estender o record MarksOptions com a propriedade string? CustomMarkFile.
2. O MarksRenderer.cs (em imposition-pdf) importará a primeira página do arquivo PDF alvo como um XObject e a instanciará nas quinas (canto a canto), respeitando os parâmetros de offset.
3. **Parâmetros no CLI**: AutoImposerCLI passará a aceitar --mark-type custom --mark-file <path>.

## Consequências

### Positivas
- Flexibilidade infinita para a gráfica injetar barras de calibração CMYK e tombetes customizados.

### Negativas / Mitigações
- **Fallback hardcoded D:\Programas\Marks\** — **Dívida técnica** temporária para não quebrar a máquina do PO durante a migração.
  - **Mitigação**: remover o fallback na v1.1 quando GRAFICA_MARKS_DIR estiver configurada em todas as máquinas. **Prazo:** 30 dias.
- O motor fica sujeito a falhar caso o arquivo de marca não exista ou esteja corrompido.

## Verificação
- Os testes unitários (ex: BR-MRK-*) garantirão a injeção do CustomMarkFile.

## Gatilhos
- Sempre que houver falhas com marcas, validar permissões de I/O na pasta de GRAFICA_MARKS_DIR.

<source: file:32>
