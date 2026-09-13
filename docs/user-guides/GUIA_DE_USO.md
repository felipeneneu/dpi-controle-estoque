> **Versão:** 1.0.0 \
> **Status:** ATIVO \
> **Owner:** Felipe \
> **Última atualização:** 2026-09-12 \
> **Origem:** migrado de `docs/12_GUIA_DE_USO.md` (MIGRAÇÃO F5 — ver docs/00_DOCS_INDEX.md).\

# Guia de Uso — Dpi Controle de Estoque

Sistema desktop (Electron) para controle de estoque e maquinário de gráfica /
comunicação visual. Desenvolvido por **Felipe Neneu Desenvolvedor** (Licença MIT).

---

## 1. O que é o app

- **Server** (PC1 — gráfica): roda o backend (API + banco) e abre a interface.
- **Client** (PC2, PC3, PC4 — demais computadores): só a interface, que acessa
  o backend do PC1 pela rede local (LAN).

---

## 2. Instalação

Instale **um único installer (depende da máquina)**:

| Computador | Installer                            |
|------------|--------------------------------------|
| PC1        | `Dpi Controle de Estoque Server ...exe` |
| PC2–PC4    | `Dpi Controle de Estoque ...exe`     |

> O PC1 (Server) precisa de **Node.js** instalado no Windows — ele usa `node`
> para executar o backend.

---

## 3. Primeira vez no PC1 (Server)

1. Instale o Server installer no PC1.
2. Abra o app (ícone **Dpi Controle de Estoque Server**).
3. Na tela **Config → Conexão com o Backend**, a faixa verde mostra os
   endereços prontos para os clientes copiarem (ex: `http://192.168.0.10:3001`).
4. O backend sobe sozinho. No primeiro uso ele cria o banco **local**
   (`local-replica.db`) e uma chave `JWT_SECRET` aleatória — sem precisar de
   credenciais de nuvem. (Se quiser usar o Turso cloud, configure o `.env` no
   PC1, conforme `docs/ops/INFRASTRUCTURE.md`.) Pronto.

---

## 4. Nos clientes (PC2–PC4)

1. Instale o installer **Client**.
2. Abra o app. Na tela **Config → Conexão com o Backend**, cole a URL que estava
   na faixa verde do PC1 (ex: `http://192.168.0.10:3001`).
3. Clique **Salvar URL e recarregar**.
4. Login com um usuário cadastrado.

---

## 5. Login

- **Felipe (admin)**: `felipe@grafica.local` / `admin123`
- **Operador**: `operador@grafica.local` / `operador123`

---

## 6. Cadastro de fotos (avatar) para usuários

As fotos usadas ao cadastrar/edit**ar uma pessoa** ficam no servidor (PC1),
na pasta **pública** do backend:

```
grafica-app/backend/public/users/
```

**Como adicionar uma foto:**

1. No PC1, abra a pasta de instalação do Server e localize a pasta
   `resources\graficaos\backend\public\users\`.
   - Dica: clique com o botão direito no atalho do app → **Abrir local do
     arquivo**, depois procure por `resources` na pasta de instalação.
2. Copie a foto da pessoa para dentro dela, com o nome do arquivo sendo o
   **e-mail** da pessoa, terminando em `.jfif`, `.jpg` ou `.png`.
   - Exemplo de e-mail `joao@grafica.local` → `joao@grafica.local.jpg`
   - (O avatar carregado no seed do admin é `felipeneneu.jfif`.)
3. Ao cadastrar/editar a pessoa, informe esse mesmo nome de arquivo no campo
   **Avatar**.
4. Recarregue o app. A foto passa a ser **servida/visível** na interface.

> Dica: para garantir o formato correto, salve a foto como `.jfif` ou use a
> extensão que você informou no cadastro. O backend serve qualquer arquivo
> da pasta `users\`.

---

## 7. Full screen

- O app abre em **tela cheia**.
- **F11** sai / volta da tela cheia.

---

## 8. Integração Mimaki

O GraficaOS se integra com o **Mimaki Tracker Electron** para recepção automática de
jobs de impressão.

### 8.1 Como funciona

1. O Mimaki Tracker Electron envia logs de impressão via API M2M.
2. O sistema calcula automaticamente os metros lineares consumidos.
3. Se o material for identificado, o estoque é deduzido automaticamente.
4. Se o material não for identificado, uma notificação é enviada para vinculação manual.

### 8.2 Vincular material a um job

1. Acesse **Estoque → Jobs Mimaki** (ou aguarde a notificação `mimaki:unmatched_material`).
2. Localize o job com status **PENDING_BIND**.
3. Clique em **Vincular Material** e selecione o item de estoque correspondente.
4. O sistema deduzirá a quantidade do estoque automaticamente.

### 8.3 Comandos do Bot no Chat

O chat interno possui comandos de bot que retornam informações privadas (DM):

| Comando | Descrição |
|---------|-----------|
| `/help` | Lista todos os comandos disponíveis |
| `/status` | Status de todas as máquinas |
| `/estoque` | Resumo do estoque (itens baixos) |
| `/jobs` | Últimos 5 jobs processados |
| `/alertas` | Notificações ativas |

> **Nota:** As respostas do bot são enviadas como mensagem privada (DM) para o remetente.

### 8.4 Notificações em Tempo Real

- O badge no sidebar de Estoque exibe a contagem real de notificações não lidas.
- Notificações são atualizadas em tempo real via Socket.IO.

---

## 9. Suporte

Para dúvidas, contate o desenvolvedor do sistema.

