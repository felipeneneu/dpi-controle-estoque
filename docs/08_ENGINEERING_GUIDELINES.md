# 🛠️ Engineering Guidelines

---

### 1. Padrões de Código
- **TypeScript Strict Mode**: Tipagem estática obrigatória para todas as entidades e endpoints.
- **Components UI**: Padrão Shadcn UI (`zinc` palette), sem bibliotecas de CSS conflitantes. Utilizar ícones do `@remixicon/react`.
- **Validation**: Validação de schemas no frontend e backend utilizando `zod`.

### 2. Fluxo de Commits & Git
- Siga o padrão *Conventional Commits*:
  - `feat:` Novas funcionalidades.
  - `fix:` Correção de bugs.
  - `docs:` Alterações de documentação.
  - `refactor:` Ajustes de código sem alteração de regra de negócio.
