# Plan: Criar script `npm run app`

## Contexto

O projeto é um monorepo com:
- `grafica-app/` — frontend Next.js (static export)
- `grafica-app/backend/` — API Fastify + Turso
- `electron/` — app desktop Electron

Scripts existentes no root `package.json`:
- `dev:backend` → roda o backend com hot reload (`tsx watch`)
- `start:electron` → abre o Electron em modo client
- `dev:electron` → builda tudo e abre Electron em modo server (spawna backend embutido)

**Problema:** Não existe um único comando que rode backend + electron em paralelo para desenvolvimento.

---

## Abordagem

Usar `concurrently` para rodar `dev:backend` e `start:electron` ao mesmo tempo.

---

## Tarefas

### 1. Instalar `concurrently`

Adicionar `concurrently` como devDependency no root `package.json`:

```bash
npm install -D concurrently
```

### 2. Adicionar script `app`

No `package.json` raiz, adicionar na seção `scripts`:

```json
"app": "concurrently --names backend,electron --prefix-colors cyan,yellow \"npm run dev:backend\" \"npm run start:electron\""
```

**Parâmetros do `concurrently`:**
- `--names backend,electron` — labels legíveis no terminal
- `--prefix-colors cyan,yellow` — cores distintas para cada processo

### 3. Script resultante final

```json
{
  "scripts": {
    "dev:ui": "npm --prefix grafica-app run dev",
    "dev:backend": "npm --prefix grafica-app/backend run dev",
    "app": "concurrently --names backend,electron --prefix-colors cyan,yellow \"npm run dev:backend\" \"npm run start:electron\"",
    ...demais scripts existentes...
  }
}
```

---

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `package.json` | +1 devDependency (`concurrently`), +1 script (`app`) |

---

## Verificação

1. Rodar `npm run app`
2. Confirmar que o backend inicia na porta 3001
3. Confirmar que o Electron abre a janela
4. Confirmar que `Ctrl+C` encerra ambos os processos

---

## Notas

- O Electron em modo **client** (`start:electron`) não spawna backend próprio — ele espera que o backend já esteja rodando. Por isso o `concurrently` é necessário.
- Se quiser o backend com hot reload + Electron com hot reload do frontend, basta rodar `npm run app` — o backend já usa `tsx watch`.
- Para rodar sem hot reload (produção local), usar `npm run dev:electron` (que builda tudo antes).
