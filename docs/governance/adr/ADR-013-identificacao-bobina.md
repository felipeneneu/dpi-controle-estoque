# Consolidado — Fluxo de Bobina (M1-M3), Geração de Etiquetas e Identificação via Nome de Arquivo

> **Propósito:** consolidar as correções feitas em cima de `ADR-010-identificacao-bobina.md`
> após validação com a arquitetura real do sistema (screenshot da tela de Equipamentos),
> mais duas features novas: geração de etiquetas pelo próprio sistema e identificação
> automática de bobina via convenção de nome de arquivo.
> **Escopo:** documento de decisão — não é ainda um prompt de implementação.

---

## 1. Correção de arquitetura — não existe "terminal separado"

A ADR-010 original mencionava um "atalho de teclado no terminal Electron ao lado da
máquina" como se fosse um dispositivo dedicado. **Isso não corresponde à arquitetura
real.** O que existe:

- **1 PC servidor** (o PC do DEV_MASTER) — roda o backend Fastify + os agentes (HP,
  Konica, Mimaki) + o Electron em modo server.
- **N PCs cliente** (um por máquina/operador) — rodam **o mesmo Electron**, só que em
  modo client (sem backend embutido), cada um já aberto o dia todo no canal daquela
  máquina específica (ex: operador da HP Latex 330 fica com o canal "#HP Latex 330"
  aberto, como mostra a tela real do sistema).

**Consequência de design:** o check-in de bobina não precisa de nenhuma tela nova nem
hardware — ele é um elemento **dentro do canal da máquina que o operador já deixa
aberto**. Não existe "ir até um terminal" — o terminal já é a tela na frente dele.

### 1.1 Onde o check-in mora na UI real

Dentro do canal de cada máquina (ex: `#HP Latex 330`), ao lado do badge de status
("Conectado"), um widget fixo:

```
Bobina ativa: #1042 — Vinil Brilho — 8.2m restantes    [Trocar bobina]
```

Clicar em "Trocar bobina" abre um campo simples: digitar o ID curto ou colar o
resultado da leitura do QR (celular/PWA), Enter confirma. Isso muda
`Bobina.state = IN_USE` e `Bobina.location = machine:<id>` para aquela máquina
específica.

### 1.2 Evidência de que o problema já acontece hoje (sem processo formal)

Na tela real de Jobs da HP Latex 330, o job "Reisa CAIXA DISPLAY Feliz Natal SET26"
(OS 31129, 10/09 13:31) aparece com **`Debitado = Não`**, sem nenhuma fila de pendência
nem aviso ativo para o operador resolver — é, na prática, um job órfão acontecendo sem o
processo do ADR-010 para tratá-lo.

## 2. Aviso de fim de turno — ajuste de horário

Em vez de travar o fechamento do dia (proposta original da ADR-010), o aviso vira uma
notificação agendada:

- **Horário:** 17:10, horário de Brasília, próximo do fim do turno.
- **O que faz:** varre jobs com `Debitado = Não` (ou bobina não vinculada) de cada
  canal/máquina e dispara alerta, reaproveitando a infraestrutura de notificação já
  existente (toast interno + WhatsApp, incluindo o mecanismo de grupo/escalonamento já
  desenhado nas conversas anteriores) — não é um canal de aviso novo.
- **Relação com BR-017:** essa automação de horário fixo já estava prevista como
  "briefing agendado" (`PROPOSED` no `RULES.md`), mas sem gatilho concreto que
  justificasse implementar. Este é esse gatilho.

## 3. Geração de etiquetas pelo próprio sistema (sem Illustrator)

Como a criação de bobina não é uma tarefa de alta frequência (não é "todo dia"), não
vale construir um editor visual de template dentro do sistema — um layout fixo resolve.

### 3.1 Ferramentas

| Peça | Ferramenta | Observação |
|---|---|---|
| Gerar o QR code | lib `qrcode` (Node) | Payload: `BOB:1042` |
| Montar o layout da etiqueta + repetir na folha adesiva | `pdf-lib` | Reaproveita a mesma lógica de "melhor encaixe" (grid nesting) já desenhada para imposição — aqui repete o layout de etiqueta em vez de arte de impressão |
| Imprimir | Diálogo padrão do Windows/Konica | Manual, esporádico — não precisa de fila automatizada |

### 3.2 Conteúdo da etiqueta (herda o payload já definido na ADR-010)

- QR Code: `BOB:1042`
- ID numérico grande: `#1042`
- Texto pequeno: SKU, lote, metragem original

### 3.3 Fluxo de uso

Botão "Gerar etiquetas" na tela de cadastro de bobina — por bobina individual (ao
cadastrar) ou em lote (se cadastrar várias de uma vez e imprimir juntas numa folha).
Gera um PDF pronto para impressão manual.

## 4. NOVO — Identificação automática via convenção de nome de arquivo

### 4.1 A ideia

Em vez do operador nomear o arquivo de forma livre (ex: `vinil branco brilho -
cardapio.pdf`, que depende do matcher por tokens — BR-010, hoje frágil), ele inclui o
**ID curto da bobina** no nome do arquivo antes de mandar pro RIP:

```
vinil-1040-cardapio.pdf
      └─ ID da bobina, sem ambiguidade
```

Quando o job chega no agente (via polling HP ou webhook Mimaki), o parser de nome de
job — que já existe hoje para outras finalidades (`parseMediaWidthM(job.jobName)` no
HP, por exemplo) — passa a também procurar o padrão de ID de bobina no nome. Se
encontrar, resolve o material **diretamente pela `Bobina`** (que já sabe seu próprio
SKU), sem depender de heurística de texto.

### 4.2 Por que isso é melhor que só o check-in físico, e por que não deve substituí-lo

**Ganho 1 — resolve o matcher frágil de vez.** ID é inequívoco; não tem "nome parecido
com dois itens diferentes" nem problema de acento/token que hoje afeta Konica/HP.

**Ganho 2 — funciona como segunda confirmação, não como substituto do check-in físico.**
O check-in (`Trocar bobina` no canal da máquina) registra **qual bobina está fisicamente
carregada agora**. O ID no nome do arquivo registra **qual bobina o operador pretendia
usar** quando preparou aquele job específico. São informações diferentes, e a
divergência entre elas é um sinal útil:

```
SE ID do nome do arquivo (ex: 1040) != ID da bobina IN_USE na máquina (ex: 1041)
  → não decidir silenciosamente qual está certo
  → gerar alerta de divergência (mesmo padrão de "nunca falhar em silêncio" já
    adotado nas outras decisões do projeto)
  → operador confirma qual dos dois estava certo
```

Isso é estritamente melhor que confiar só numa fonte: se o operador esquecer de trocar
o nome do arquivo mas fizer o check-in físico corretamente, o check-in físico prevalece
(e vice-versa) — mas a divergência fica visível para auditoria, em vez de mascarada.

**Ganho 3 — reduz a dependência do check-in ser perfeito.** Mesmo que o operador
esqueça o check-in em algum momento, se o nome do arquivo tiver o ID, o sistema ainda
consegue debitar a bobina certa (reduzindo a taxa de jobs órfãos), com o check-in físico
funcionando como confirmação complementar quando presente.

### 4.3 Risco conhecido (mesma classe de erro, só que movida)

Digitar o ID errado no nome do arquivo é o mesmo tipo de erro humano que digitar errado
no check-in — não elimina erro de digitação, só move onde ele pode acontecer. Não é
motivo para não implementar, é motivo para manter a validação cruzada da seção 4.2 em
vez de tratar o ID do nome do arquivo como fonte de verdade absoluta.

## 5. Resumo do que muda em relação à ADR-010 original

| Item | ADR-010 original | Ajustado |
|---|---|---|
| Onde o check-in acontece | "Terminal Electron ao lado da máquina" (implicava hardware dedicado) | Dentro do canal da máquina no mesmo Electron client que o operador já usa |
| Aviso de pendência | Trava no fechamento do dia | Notificação agendada às 17:10 (Brasília), reaproveitando infra de alerta existente |
| Geração de etiqueta | Mencionada como "impressão interna na Konica", sem detalhar ferramenta | Detalhado: `qrcode` + `pdf-lib`, layout fixo, botão sob demanda (não é fluxo diário) |
| Identificação de material | Só check-in físico + matcher por nome (BR-010, frágil) | Adição do ID de bobina no nome do arquivo como segunda fonte, com validação cruzada contra o check-in físico |

## 6. Próximo passo

Este documento ainda **não é um prompt de implementação**. Antes de montar o prompt
para o opencode, decidir:
- [ ] Escopo do M1 inclui já a geração de etiqueta, ou fica como tarefa separada
      pós-M1?
- [ ] O parser de nome de arquivo (seção 4) entra no M1 (matcher) ou só no M3 (dedução
      por bobina), já que depende da entidade `Bobina` existir primeiro?