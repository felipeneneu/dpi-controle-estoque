# Conectando os Instaladores via LAN — Dpi Controle de Estoque

Guia rápido para ligar os 4 computadores da gráfica:

- **PC1** — instala o instalador **Server**. Roda o backend (API + banco de dados) e serve a interface.
- **PC2, PC3, PC4** — instalam o instalador **Client**. Só a interface; acessam o backend do PC1 via rede local.

---

## 1. O que você precisa

| Item | Detalhe |
|------|---------|
| Rede | Todos os PCs na **mesma rede local** (mesmo roteador/Wi-Fi ou switch). |
| Windows | Todos com Windows 10/11. |
| Node.js | **Somente o PC1** (Server) usa Node.js para rodar o backend. |
| Instaladores | `*-server-setup.exe` (PC1) e `*-setup.exe` (PC2–PC4). |

> O Server gera a configuração local automaticamente na primeira execução
> (banco em `resources\graficaos\backend\local-replica.db` e uma chave `JWT_SECRET`
> aleatória), sem precisar de credenciais de nuvem.

---

## 2. Passo a passo

### PC1 (Server)

1. Instale o instalador **Server** e abra o app.
2. O backend sobe sozinho na porta **3001** e abre a interface em tela cheia.
   (Pressione **F11** para sair/voltar de tela cheia.)
3. Vá em **Configurações → Conexão com o Backend**.
4. Na **faixa verde**, anote o endereço para os clientes, ex.:
   `http://192.168.0.10:3001`
   (varia conforme o IP do PC1 na sua rede; há botão **Copiar**).

### PC2–PC4 (Client)

1. Instale o instalador **Client** e abra o app.
2. Em **Configurações → Conexão com o Backend**, cole a URL da faixa verde do PC1.
3. Clique em **Testar conexão** (deve aparecer "Backend respondeu: ok").
4. Clique em **Salvar URL e recarregar**.
5. Faça login com um usuário cadastrado.

---

## 3. Liberando o acesso no Firewall do Windows (PC1)

O PC1 precisa aceitar conexões de entrada na porta **3001**. No Windows:

1. Abra **Firewall do Windows com Segurança Avançada** (win+R → `wf.msc`).
2. **Regras de Entrada → Nova Regra…**
3. Tipo: **Porta** → protocolo **TCP** → porta específica: **3001**.
4. Ação: **Permitir a conexão**.
5. Perfil: marque **Particular** (e **Domínio** se a rede for domínio).
6. Nome: `Dpi Estoque Server (3001)`.

Se a primeira tentativa falhar, confirme também no prompt do seu antivírus que o
**Node.js** do Server pode aceitar conexões de entrada.

---

## 4. Teste rápido da rede

De um PC qualquer (Client), abra o navegador e acesse:

```
http://IP_DO_PC1:3001/health
```

Deve retornar `{"status":"ok"}`. Se não:

1. Ping no PC1: `ping IP_DO_PC1`.
2. Confirme se os dois PCs estão na **mesma rede/sub-rede**.
3. Confirme a regra de firewall do passo 3.
4. Confirme se o app Server está aberto (backend de pé).

---

## 5. Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| "Não foi possível conectar nessa URL" | Firewall bloqueando | Liberar porta 3001 (passo 3). |
| Timeout no ping | PCs em redes diferentes | Conectar na mesma rede (Wi-Fi/roteador). |
| Login não funciona | Backend não está de pé no PC1 | Abrir o app Server no PC1 antes. |
| Client aponta errado | URL digitada com excesso/classe | Usar exatamente a URL da faixa verde do PC1. |

---

## 6. Segurança (importante)

- O Server **não envia mais** credenciais de nuvem no instalador. O banco de
  primeiro uso é **local** (`local-replica.db`). Para usar Turso (nuvem)
  voluntariamente, edite `resources\graficaos\backend\.env` **somente no PC1**.
- Use a conexão **apenas na rede interna da empresa**; não exponha `:3001` na
  internet.
- A porta 3001 exige autenticação (JWT) para quase toda rota; ainda assim, evite
  abrir essa porta em rede pública.

---

Veja também: `docs/12_GUIA_DE_USO.md` (instalação e uso completo).