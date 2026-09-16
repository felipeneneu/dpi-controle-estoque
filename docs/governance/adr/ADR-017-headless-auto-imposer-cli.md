# ADR-017: Motor Headless de Imposição Automática (Step & Repeat CLI)

## Status
Aprovado (Fase de Validação em Fábrica)

## Contexto
O processo de repetição de matrizes (Step & Repeat) para grandes formatos (chapas $70 \times 100\text{ cm}$, $100 \times 150\text{ cm}$ e bobinas Mimaki) é executado manualmente no Illustrator ou CorelDRAW, consumindo tempo excessivo da pré-impressão e sujeito a falhas operacionais (esquecimento de sangrias, alteração acidental de escalas e perda de camadas de corte).

Ao mesmo tempo, integrar essa rotina diretamente na interface visual interativa (`ImpositorKonica`) acoplou responsabilidades distintas e atrasou a entrega do motor puro de cálculo.

## Decisão de Arquitetura
1. **Desacoplamento Total:** Criação do módulo `sidecars/AutoImposerCLI` como executável de console independente (.NET 8).
2. **Zero Dependência Visual:** O módulo não possui janelas, WPF nem interação com mouse. Recebe argumentos exclusivamente via CLI (`args[]`) e emite logs via `stdout`.
3. **Preservação Vetorial com Form XObjects:** O PDF de entrada é encapsulado como objeto de formulário PostScript único e replicado apenas por matrizes de chamada afim (`cm`). Nenhuma arte será rasterizada ou convertida para bitmap durante o processo.

---

## Matriz de Escopo (Fronteira Anti-Escopo / Guardrails)

Para evitar retrabalho e garantir que a ferramenta seja testada de imediato na máquina real:

| Funcionalidade | No Escopo (MVP) | Fora de Escopo (Proibido no MVP) | Justificativa |
|---|:---:|:---:|---|
| **Cálculo de Matriz Ótima (0° vs 90°)** | **SIM** | — | Essencial para descobrir se cabem mais peças em pé ou deitado. |
| **Pass-through de CutContour / Spot Colors** | **SIM** | — | Obrigatório para o leitor óptico da Mimaki reconhecer a linha de corte. |
| **Execução Standalone via Terminal ou `.bat`** | **SIM** | — | Permite validar imediatamente na bancada sem abrir outros sistemas. |
| **Geração na Pasta Hotfolder** | **SIM** | — | Permite jogar o PDF direto para o operador ou Illustrator. |
| **Nesting Irregular / True-Shape** | — | **NÃO** | Complexidade matemática desnecessária para peças retangulares com sangra. |
| **Aplicação de Marcas da Mimaki no Código** | — | **NÃO** | O Illustrator / FineCut já faz isso em 1 clique nativamente. |
| **Interface Visual / Dropzone Web no React** | — | **NÃO** | Proibido até que a matemática seja validada em produção real. |
| **Extensão CEP do Adobe Illustrator** | — | **NÃO** | Ideia enviada para o Backlog Técnico. |

---

## Critérios de Aceite para Saída da Fase de Validação

O motor só será considerado homologado quando atender cumulativamente aos seguintes testes práticos no chão de fábrica:
1. O PDF imposto de $70 \times 100\text{ cm}$ deve abrir no Adobe Illustrator sem nenhum aviso de *corrupção*, *operando ausente* ou *substituição de fontes*.
2. As camadas de Spot Color (`CutContour` da Mimaki) devem permanecer ativas e editáveis no Illustrator.
3. As marcas de registro do FineCut devem ser aplicadas em volta da montagem sem erros de sobreposição.
4. Tempo total de execução inferior a 1 segundo para arquivos com até 100 repetições.