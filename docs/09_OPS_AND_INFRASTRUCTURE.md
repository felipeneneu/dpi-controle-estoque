# 🚀 Ops & Infrastructure Guide

---

### 1. Preparação do Ambiente Local
1. **Instalar Node.js v20+** no Computador 1.
2. **Configurar Variáveis de Ambiente (`.env`)**:
   ```env
   TURSO_DATABASE_URL="libsql://grafica-estoque-org.turso.io"
   TURSO_AUTH_TOKEN="seu_token_turso_aqui"
   JWT_SECRET="segredo_super_seguro_jwt"
   PORT=3001
   ```
3. **Rodar Migrações do Drizzle**:
   ```bash
   npx drizzle-kit push
   ```

### 2. Geração do Executável Electron
```bash
# Na raiz do monorepo
npm run build:export
npm run package:electron
```
Gerará o instalador `.exe` na pasta `dist/` para ser distribuído nos 3 computadores.
