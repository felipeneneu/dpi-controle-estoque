---
Contexto: "Evolução do .bat para incluir menus interativos e preflight"
Domínio: Operações / CLI
Status: Draft
Referências: ADR-045, ADR-046, PLAN-046-B, PLAN-045-A
---
# PLAN-045-C: Evolução interativa do MontarPDF.bat

## Escopo IN/OUT
- **IN**: Estender os .bat existentes para chamar um script unificado PowerShell (impor-interativo.ps1).
- **IN**: Leitura da variável GRAFICA_MARKS_DIR com fallback explícito para D:\Programas\Marks\.
- **IN**: Tratamento interativo de falhas de Preflight (Exit Code 5) perguntando ao operador se quer forçar (S/N).
- **OUT**: Criar scripts novos do zero (vamos centralizar a chamada e estender).

## Arquivos a tocar
- scripts/impor-interativo.ps1 (NOVO)
- Montar_SRA3_Konica.bat / MontarPDF.bat (estendidos)

## Fluxo Interativo (UX)
1. Pergunta distâncias das marcas (default [Enter = 3mm]).
2. Pergunta por Custom Mark de GRAFICA_MARKS_DIR.
3. Invoca AutoImposerCLI.exe.
4. Se Exit Code == 5: Beep, erro vermelho. Deseja forçar (S/N)? Se S -> --force-preflight.

## Testes Previstos
- Shell tests (manuais com PDFs locais em rquivos-testes/).

## Guardrails e STOP conditions
- **Dívida técnica**: Adicionar comentário no .ps1 com o TODO (30 dias) para remover o fallback.
- Sempre gerar _IMPOSTO_.pdf no hotfolder final.

<source: file:30>
