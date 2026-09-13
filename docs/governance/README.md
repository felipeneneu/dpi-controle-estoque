# Governança de Decisões — GraficaOS

> **Propósito:** fluxo de decisão quando algo muda no produto ou na arquitetura. Mantém o propósito (BR-002: bobina-ativo; BR-021: config por empresa) vivo e evita que PLAN-* soltos virem padrão de facto.

---

## 1. Ciclo de vida de uma regra de negócio (BR-*)

```
PROPOSED ──(RFC aprovada)──► TARGET ──(implementado + teste)──► IMPLEMENTED
    │                          │                                  │
    └──── (congelada) ─────────┴── (comportamento superado) ─► SUPERSEDED
```

- **`PROPOSED`** — regra candidata, aguardando ADR.
- **`TARGET`** — regra aprovada como destino de produto, ainda não (totalmente) no código.
- **`PARTIAL`** — parcialmente verdade no código.
- **`IMPLEMENTED`** — verdade no código **e** pinado por teste (ou verificação humana datada).
- **`SUPERSEDED`** — substituída por outra regra (indica a sucessora).

Uma regra `IMPLEMENTED` só desce de status se um teste deixar de existir ou o comportamento mudar de fato.

## 2. Ciclo de vida de uma decisão arquitetural (ADR)

```
RFC (proposta) → Socratic gate → ADR (Accepted) → implementação → ADR (IMPLEMENTED) → eventualmente SUPERSEDED
```

1. **Proposta** — abra `governance/rfc/RFC-NNN-slug.md` (ou issue no GitHub se trivial).
2. **Socratic gate** — para qualquer coisa que toque BR-001..BR-021, compare as opções contra a **regra de propósito** (BR-002) e o **modelo de deploy** (BR-021). Qualquer tentativa de re-abrir decisões travadas é bloqueada aqui.
3. **Decisão** — admita a ADR em `adr/ADR-NNN.md` + registre em `ADR_INDEX.md`. RFC vira histórico (nunca deletado).
4. **Implementação** — mudança de código + **bump da BR-*** envolvida + entrada em `business/RULE_CHANGELOG.md`, tudo no mesmo PR.
5. **Acompanhamento** — quando o comportamento entrega a decisão, ADR e BR-* vão para `IMPLEMENTED`.

## 3. Quando NÃO precisa de RFC/ADR

- Correção de bug que não muda regra (teste que prenda a regra já existente).
- Refactor sem mudança de comportamento (movido com teste verde anterior).
- Normalização de texto de documento (bump de patch, sem código).
- Dúvida → abra RFC. É barato.

## 4. Relação com PLAN-* e Release Notes

- **`PLAN-*` é espaço de trabalho**, não classe de documentação. Adoção só vira realidade ao virar **ADR/RFC/regra**; o arquivo vai para `docs/_archive/`.
- **`ops/RELEASE_NOTES.md`** lista, por release, os ADRs e BR-* cuja implementação embarcou — uma fonte única para "a regra realmente chegou no ar?".

## 5. Aprovadores (padrão)

| Domínio | Aprova |
|---------|--------|
| inventory / deduction / ledger | Felipe (DEV_MASTER) |
| rbac / segurança | Felipe |
| integrações | Felipe + dono da integração |
| ops / infra | Felipe |
| UI/UX | Felipe |

## 6. Referências

- `DOC_POLICIES.md` — políticas de veracidade e integridade da documentação.
- `ADR_TEMPLATE.md` — template de ADR.
- `ADR_INDEX.md` — índice completo de ADRs.
- `business/RULE_CHANGELOG.md` — histórico de mudanças de BR-*.