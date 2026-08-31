# 🚀 Ops & Infrastructure Guide

---

### 1. Preparação do Ambiente Local
1. **Instalar Node.js v20+** no Computador 1 (PC1 / Server).
2. **Variáveis de Ambiente (`.env`)**:
   - O instalador **Server** já cria um `.env` local automaticamente na 1ª
     execução (banco `file:./local-replica.db`, `JWT_SECRET` aleatório) — sem
     credenciais de nuvem.
   - Opcionalmente, para usar **Turso cloud** (sincronização entre máquinas),
     edite o `.env` **somente no PC1**:
   ```env
   TURSO_DATABASE_URL="libsql://grafica-estoque-org.turso.io"
   TURSO_AUTH_TOKEN="seu_token_turso_aqui"
   JWT_SECRET="segredo_super_seguro_jwt"
   PORT=3001
   ```
   > Nunca commite `.env*` no git (é gitignored). O instalador **não embute**
   > mais `.env`.
3. **Migrações**: o backend aplica as migrations (`drizzle/`) **sozinho no boot**,
   no banco configurado (`TURSO_DATABASE_URL` ou `file:`). Em dev, para
   sincronizar com o Turso cloud, use `npx drizzle-kit push`.

### 2. Testes e CI
- **Unit (backend)**: `cd grafica-app/backend && npm test` (Vitest, DB em memória).
- **E2E (UI + API)**: `npm run e2e` na raiz (Playwright roda o backend real em
  DB temporário + serve o `out/` estático).
- **CI**: workflow GitHub Actions em `.github/workflows/ci.yml` (typecheck +
  lint + unit + build + E2E em cada push/PR).

### 3. Geração do Executável Electron
```bash
# Na raiz do monorepo
npm run build:export
npm run package:electron
```
Gerará os instaladores `.exe`:
- `dist/server/*-server-setup.exe` → **PC1 (Server)** (UI + backend embutido)
- `dist/client/*-setup.exe` → **PC2–PC4 (Client)** (somente UI)

Distribua conforme `docs/13_LAN_CONEXAO_SERVER_CLIENT.md`.