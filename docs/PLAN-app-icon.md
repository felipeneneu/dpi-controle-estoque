# Plano: Corrigir Ícone da Área de Trabalho e do Aplicativo

## Objetivo

Resolver o problema onde o ícone do atalho da área de trabalho e do próprio executável (.exe) do GraficaOS não aparecem, mostrando apenas o ícone padrão do Electron.

## Diagnóstico

### Estado Atual dos Ícones

| Artefato | Caminho | Status |
|----------|---------|--------|
| `icon.ico` | `electron/build/icon.ico` | ✅ Existe (5116 bytes, 256x256) |
| `icon.png` | `electron/build/icon.png` | ✅ Existe (4676 bytes, 256x256) |
| Config electron-builder (client) | `electron/electron-builder.client.yml` | ✅ Referencia `build/icon.ico` |
| Config electron-builder (server) | `electron/electron-builder.server.yml` | ✅ Referencia `build/icon.ico` |
| Config electron-builder (base) | `electron/electron-builder.yml` | ⚠️ **NÃO inclui** `build/icon.ico` / `build/icon.png` na seção `files` |
| `windowIcon()` no main.js | `electron/main.js:164-167` | ✅ Usa `build/icon.png` (BrowserWindow) |

### Causa Raiz Identificada

**Problema principal: `signAndEditExecutable: false`**

Nos dois arquivos de configuração de build (`electron-builder.client.yml` e `electron-builder.server.yml`), a opção `signAndEditExecutable` está definida como `false`:

```yaml
win:
  icon: build/icon.ico
  signAndEditExecutable: false  # ← ESTE É O PROBLEMA
```

**O que acontece:**
1. `electron-builder` monta o `.exe` usando o binário base do Electron
2. Normalmente, a ferramenta `rcedit` é chamada para gravar o ícone (e informações de versão) na seção de recursos do `.exe`
3. Com `signAndEditExecutable: false`, **o passo `rcedit` é pulado**
4. Resultado: o `.exe` fica com o ícone padrão do Electron (a seta azul)
5. O NSIS cria o atalho da área de trabalho referenciando o ícone do `.exe` — que é o ícone padrão

**Problema secundário: falta de `shortcutIcon` no NSIS**

A configuração NSIS tem `installerIcon` e `uninstallerIcon`, mas **não define `shortcutIcon`** explicitamente. O NSIS herda o ícone do `.exe` para o atalho, mas como o `.exe` não tem o ícone correto (por causa do problema acima), o atalho também fica sem ícone.

---

## Tarefas

### Tarefa 1: Remover `signAndEditExecutable: false` dos configs de build

**Arquivos:** `electron/electron-builder.client.yml`, `electron/electron-builder.server.yml`

**Ação:**
- Remover a linha `signAndEditExecutable: false` de ambos os arquivos (ou alterar para `true`)
- Isso permite que o `rcedit` grave o ícone no `.exe`

**INPUT:** `electron-builder.client.yml` e `electron-builder.server.yml` atuais
**OUTPUT:** Arquivos sem `signAndEditExecutable: false`
**VERIFY:** `grep -r "signAndEditExecutable" electron/` deve retornar vazio ou mostrar `true`

---

### Tarefa 2: Adicionar `build/icon.ico` e `build/icon.png` à seção `files` do `electron-builder.yml` base

**Arquivo:** `electron/electron-builder.yml`

**Ação:**
- Adicionar `- build/icon.png` e `- build/icon.ico` na seção `files` do `electron-builder.yml` base, para consistência com os configs client e server

**INPUT:** `electron-builder.yml` atual
**OUTPUT:** `electron-builder.yml` com ícones na seção `files`
**VERIFY:** A seção `files` deve conter as 5 linhas: `main.js`, `preload.js`, `discovery.js`, `build/icon.png`, `build/icon.ico`

---

### Tarefa 3: Adicionar `shortcutIcon` à seção NSIS (defense-in-depth)

**Arquivos:** `electron/electron-builder.client.yml`, `electron/electron-builder.server.yml`

**Ação:**
- Adicionar `shortcutIcon: build/icon.ico` na seção `nsis` de ambos os arquivos, garantindo que o atalho da área de trabalho use o ícone correto independentemente do `.exe`

**INPUT:** Seções `nsis` dos dois arquivos
**OUTPUT:** Seção `nsis` com `shortcutIcon: build/icon.ico`
**VERIFY:** `grep -r "shortcutIcon" electron/` deve mostrar os dois arquivos

---

### Tarefa 4: Limpar cache do build e reconstruir

**Ação:**
1. Deletar as pastas `dist/client` e `dist/server`
2. Executar `npm run package:client` (dentro de `electron/`)
3. Verificar que o `.exe` gerado em `dist/client/` tem o ícone correto
4. Repetir para `npm run package:server`

**INPUT:** Builds antigos em `dist/`
**OUTPUT:** Builds novos com ícone correto no `.exe`
**VERIFY:**
- Abrir `dist/client/win-unpacked/Dpi Controle de Estoque.exe` → verificar ícone nas propriedades
- Rodar o instalador NSIS → verificar que o atalho da área de trabalho tem ícone
- Abrir o app → verificar que a barra de tarefas mostra o ícone correto

---

### Tarefa 5 (Opcional/Recomendação): Gerar `.ico` multi-resolução

**Ação:**
- O `icon.ico` atual tem apenas 5116 bytes (256x256 único). Para melhor compatibilidade com Windows (barra de tarefas em 16/32/48/256px), converter para `.ico` multi-resolução incluindo 16x16, 32x32, 48x48 e 256x256
- Ferramentas: [RealFaviconGenerator](https://realfavicongenerator.net/), [IcoFX](https://icofx.ro/), ou `sharp`/`png2icons` via CLI

**INPUT:** `electron/build/icon.png` (256x256)
**OUTPUT:** `electron/build/icon.ico` multi-resolução (~20-50KB)
**VERIFY:** Abrir o `.ico` no Windows e verificar que mostra múltiplos tamanhos nas propriedades

---

## Verificação Final (Fase X)

- [ ] Tarefa 1: `signAndEditExecutable` não está `false` nos configs
- [ ] Tarefa 2: `electron-builder.yml` base inclui ícones em `files`
- [ ] Tarefa 3: `shortcutIcon` adicionado nos configs NSIS
- [ ] Tarefa 4: `npm run package:client` e `package:server` executados com sucesso
- [ ] Tarefa 4: O `.exe` gerado tem o ícone correto (verificar nas propriedades do arquivo)
- [ ] Tarefa 4: O atalho da área de trabalho criado pelo instalador NSIS tem ícone
- [ ] Tarefa 4: A janela do app mostra o ícone na barra de tarefas
- [ ] Tarefa 5 (opcional): `.ico` é multi-resolução

---

## Notas

- **Não há necessidade de alterar `main.js`** — a função `windowIcon()` já referencia `build/icon.png` corretamente
- **Os arquivos de ícone já existem** e estão no formato/tamanho correto para o `rcedit` processar
- O problema é **exclusivamente na configuração de build** (`signAndEditExecutable: false`)
- `signAndEditExecutable: false` pode ter sido adicionado para evitar erros de code signing — nesse caso, considere usar `forceCodeSigning: false` em vez de desabilitar o edit completo
