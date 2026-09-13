# Diagnóstico: por que o job de hoje não foi capturado

## Conclusão (04/09/2026)

O `accounting.xls` da HP Latex 330 **não contém jobs de 03-04/09/2026** — o último job
é `31057 - croce - testeira` de **02/09/2026**. O agente não capturou o job de hoje
simplesmente porque ele ainda não existe na fonte.

### Evidências

1. **4 variações de URL devolvem o mesmo arquivo** (1.013.747 bytes, mesmos 150 jobs):
   - `?cost=y` (o que o agente usa)
   - `?timestamp=<agora>&cost=y`
   - `?timestamp=09042026110046978&cost=y` (exata do navegador)
   - com `;jsessionid=...` + timestamp
   - O parâmetro `timestamp` **é ignorado pelo servidor** — é só cache-buster do navegador.

2. **Janela temporal do accounting**: jobs vão de **Aug 10 → Sep 2, 2026** (~24 dias).
   Não há atividade registrada para 03/09 nem 04/09, mesmo com a impressora ativa.

3. **Hipótese "ciclo de 30 dias"**: o accounting guarda jobs desde a última
   configuração/limpeza (≈10/08). Independente de ser ciclo exato de 30 dias, o fato
   concreto é que **a atividade de hoje não entrou no accounting**.

### Implicação

O `accounting.xls` da HP **não é fonte confiável para jobs em tempo real**. O job de
hoje ("starpac lona") passou despercebido. O usuário confirmou que o software de
impressão é o **SAi Flexi**, e que o rastreamento real deve ser feito nele.

### Próximo passo

- Investigar o que o **SAi Flexi** expõe (API, banco, logs em disco) na máquina separada.
- Decidir se substitui ou complementa o accounting HP.
