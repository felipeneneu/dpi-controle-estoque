# GOV-004: Política de Isolamento e Ciclo de Vida dos Sidecars

## 1. Princípio da Não-Contaminação (Zero Shared Code entre Engines)
- O diretório `sidecars/` pode conter múltiplos utilitários nativos, mas **nenhum projeto `.csproj` de sidecar pode referenciar outro projeto `.csproj` dentro de `sidecars/`**.
- Cada sidecar deve compilar de forma autocontida (`--self-contained true -p:PublishSingleFile=true`) gerando seu próprio executável em pastas de binários distintas:
  * `sidecars/bin/gui/ImpositorKonica.exe`
  * `sidecars/bin/cli/AutoImposerCLI.exe`
- A quebra de compilação de um módulo em manutenção não pode impedir o build dos demais utilitários.

## 2. Regra da Trava de Integração (The "CLI First" Gate)
Fica estritamente proibido criar botões, rotas no React, telas no Electron ou componentes de interface visual para qualquer novo motor de processamento gráfico antes que:
1. O executável de linha de comando (CLI) tenha sido compilado.
2. Ao menos 3 arquivos de produção real tenham sido processados via terminal.
3. O operador da máquina correspondente tenha validado a saída física impressa ou cortada.

## 3. Diretriz de Preservação de Arquivo Gráfico
Todo utilitário nativo deve tratar o PDF de entrada como um documento de leitura estrita (*read-only*):
- É vedado converter fontes em curvas quando o documento for apenas replicado como Form XObject (preservar integridade do PDF de origem).
- É vedado converter espaços de cor Spot/Pantone para CMYK durante a etapa de imposição.
- O resultado deve sempre ser gerado como um novo arquivo em diretório configurado, nunca sobrescrevendo a arte matriz do cliente.