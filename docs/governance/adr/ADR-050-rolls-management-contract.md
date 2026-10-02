# ADR-050: Contrato de Gestão de Rolos e Sugestão de Rolo Ótimo (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-09-30  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress / inventory  
> **Regra de Negócio:** BR-051  
> **Substitui / Complementa:** Complementa ADR-009, ADR-015, ADR-021, ADR-049  

---

## 1. Contexto

A divisão de banners em painéis depende criticamente da largura física do rolo de substrato carregado ou disponível na gráfica. Escolher o rolo incorreto causa desperdício excessivo de lona/vinil ou cria emendas desnecessárias que aumentam o tempo de solda e acabamento.

O módulo Seams necessita de:
1. Um catálogo padrão de rolos de mídia com as medidas físicas reais do mercado gráfico brasileiro.
2. Definição de margens de tração e presilha do equipamento (default 15 mm por lateral, 30 mm total).
3. Algoritmo determinístico de sugestão de rolo ótimo baseado em menor desperdício e menor número de emendas.
4. Persistência local segura das customizações de rolos pelo operador em formato JSON.

---

## 2. Decisões

### Decisão 1: Catálogo Padrão de Mercado Brasileiro
O catálogo padrão de rolos embarcado no Core (`DefaultRolls`) contém as 4 larguras físicas padrão da indústria:
- **1520.0 mm** (1,52 m — padrão de fábrica / default)
- **1270.0 mm** (1,27 m)
- **1060.0 mm** (1,06 m)
- **910.0 mm** (0,91 m)

*(Nota: Medidas como 2,20 m e 3,20 m são dimensões de lonas prontas/banners, não rolos padrão de impressoras de porte médio).*

### Decisão 2: Margem Operacional por Perfil (Default 15 mm/lado)
A largura útil imprimível de cada rolo é calculada por:
$$\text{UsableWidthMm} = \text{PhysicalWidthMm} - (\text{MarginLeftMm} + \text{MarginRightMm})$$
Com valor padrão de fábrica de `15.0 mm` para cada lateral (total de 30.0 mm de margem de proteção).

### Decisão 3: Algoritmo de Sugestão e Critérios de Desempate
O algoritmo `RollSuggester.Suggest`:
1. Avalia a viabilidade de cada candidato executando o cálculo de painéis (`PanelCalculator.Calculate`).
2. Descarta rolos tecnicamente inviáveis (`OverlapMm >= UsableWidthMm`).
3. Ordena os candidatos prioritariamente por:
   - **Menor Área de Desperdício** (`TotalWasteAreaM2`).
   - **Desempate 1: Menor Número de Painéis/Emendas** (`TotalPanels`) — menos solda na produção.
   - **Desempate 2: Maior Largura Útil** (`UsableWidthMm`).
4. Se a lista de candidatos for vazia ou nenhum rolo for viável, lança `ImpositionException` com código `ErrorCodes.RollNotFound`.

### Decisão 4: Persistência JSON Local com Escrita Atômica
As customizações do operador são persistidas localmente em JSON (`JsonRollRepository`). Em caso de arquivo ausente ou corrompido, o repositório realiza fallback automático para o catálogo padrão (`DefaultRolls.All`) sem travar a aplicação. A escrita utiliza substituição atômica via arquivo temporário.

### Decisão 5: Contratos Públicos em `Imposition.Core.Rolls`
Os tipos públicos (`RollSpecification`, `RollSuggestion`, `IRollRepository`, `DefaultRolls`, `RollSuggester`, `JsonRollRepository`) residem no namespace `Imposition.Core.Rolls`.

---

## 3. Consequências

- **Positivas:**
  - Redução drástica de refugo de lona com seleção automática do rolo ideal.
  - Eliminação de emendas supérfluas no acabamento.
  - Resiliência na persistência de configurações locais.
- **Negativas / Cuidados:**
  - O operador deve manter as margens físicas calibradas de acordo com as presilhas da sua impressora.

---

## 4. Referências

- PRD v3.2 (Módulo Seams / Gestão de Rolos)
- ADR-049 (Contrato de Cálculo e Compensação Térmica de Emendas)
- `docs/engineering/SEAMS-PLANO-FEATURES.md` (Feature 2)
