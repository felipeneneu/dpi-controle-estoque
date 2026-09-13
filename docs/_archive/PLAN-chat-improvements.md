# Plano: Melhorias no Chat - Scrollbar, Infinite Scroll e Input Moderno

## Resumo dos Problemas e Solicitações

### Problema 1: Barra de Rolagem Visível
**Solicitação:** "no bate papo o chat, quero que nao mostre a barra"
**Solução:** Implementar `ScrollableContainer` com estilo Discord (barra oculta, thumb sutil no hover)

### Problema 2: Conversa com Bot Persistente
**Solicitação:** "a conversa com o bot deve ser apenas em estado, nao quero puxar conversa com bot"
**Problema:** Respostas do bot ficam salvas no banco e aparecem sempre que o chat é aberto
**Solução:** Bot commands devem ser efêmeros (aparecer e desaparecer) OU filtrar automaticamente

### Problema 3: Falta de Infinite Scroll
**Solicitação:** "sobre as mensagens seria legal ter estado para ir carregando aos poucos conforme vai rolando para cima"
**Solução:** Implementar carregamento progressivo com IntersectionObserver

### Problema 4: Input Simples
**Solicitação:** "o input de texto do chat quero algo assim" (referência ao GeminiInput)
**Solução:** Substituir `<Input>` por textarea expansível com botões de mídia e envio estilizado

---

## Fase 0: Verificação de Contexto

### Arquivos Críticos Identificados

| Arquivo | Problema/Atual |
|---------|----------------|
| `src/app/(dashboard)/chat/page.tsx` | Input simples, sem infinite scroll, sem ScrollableContainer |
| `src/components/ui/message-scroller.tsx` | Componente avançado existe mas NÃO está sendo usado |
| `src/lib/queries/messages.ts` | Limitado a 200 mensagens, sem paginação |
| `backend/src/routes/chat.ts` | API sem suporte a paginação por cursor |
| `backend/src/lib/chat-commands.ts` | Respostas do bot são persistentes no banco |
| `src/styles/globals.css` | Sem estilos customizados de scrollbar |

### Estado Atual

- **Mensagens:** Carregadas uma vez (últimas 200), polling a cada 10s
- **Scroll:** Básico, sem infinite scroll
- **Input:** `<Input>` simples, single-line
- **Bot:** Respostas persistentes no SQLite
- **Scrollbar:** Estilo padrão do navegador

---

## Fase 1: Perguntas de Clarificação (Respondidas)

### Respostas Obtidas

1. **Sobre o Bot:**
   - ✅ **RESPOSTA:** Bot messages devem ser **efêmeras (5 minutos)**
   - Respostas do bot aparecem no chat e somem automaticamente após 5 minutos
   - Não persistir no banco de dados

2. **Sobre o Infinite Scroll:**
   - ✅ **RESPOSTA:** Carregar **50 mensagens por vez**
   - Bom equilíbrio entre performance e experiência

3. **Sobre o Input:**
   - ✅ **RESPOSTA:** **Todas as funcionalidades** devem funcionar
   - Upload de arquivo (botão de mídia)
   - Gravação de áudio (botão de microfone)
   - Não são apenas visuais

---

## Fase 2: Estrutura do Plano

### Tarefa 1: Criar ScrollableContainer
**Arquivo Novo:** `src/components/scrollable-container.tsx`

**Funcionalidades:**
- Barra de rolagem oculta (apenas thumb no hover)
- Suporte a infinite scroll via IntersectionObserver
- Posição preservada ao carregar itens no topo
- Estilo Discord/WhatsApp

**Componente:** Fornecido pelo usuário (components/ScrollableContainer.tsx)

**CSS:** Adicionar classes em `src/styles/globals.css`

---

### Tarefa 2: Atualizar API para Paginação
**Arquivo:** `backend/src/routes/chat.ts`

**Mudanças:**
- Adicionar parâmetros `cursor` e `limit` ao GET `/api/messages`
- Cursor baseado em `createdAt` ou `id`
- **Default limit:** 50 mensagens (configurável)
- Retornar `hasMore` para indicar se há mais mensagens
- Manter compatibilidade com requisições sem cursor

**Exemplo de Request:**
```
GET /api/messages?room=geral&cursor=2024-01-15T10:30:00Z&limit=50
```

**Exemplo de Response:**
```json
{
  "messages": [...],
  "hasMore": true,
  "nextCursor": "2024-01-15T10:25:00Z"
}
```

---

### Tarefa 3: Atualizar Frontend para Paginação
**Arquivo:** `src/lib/queries/messages.ts`

**Mudanças:**
- Adicionar parâmetros `cursor` e `limit` ao `useMessages`
- Implementar `useInfiniteQuery` ou lógica manual de paginação
- Cache separado por página para performance

**Arquivo:** `src/app/(dashboard)/chat/page.tsx`

**Mudanças:**
- Integrar `ScrollableContainer` no lugar do `<div ref={scrollRef}>`
- Implementar callback `onReachTop` para carregar mais mensagens
- Estado `hasMore` e `isLoading` para controle
- Lógica de preservação de posição ao carregar no topo

---

### Tarefa 4: Implementar Bot Efêmero (5 minutos)
**Arquivo:** `backend/src/routes/chat.ts`

**Opção A (Recomendada):** Não salvar respostas do bot no banco
- Respostas do bot enviadas apenas via Socket.IO
- Não persistir na tabela `chatMessages`
- Mensagens aparecem e somem ao fechar/chat

**Opção B:** Salvar mas filtrar no frontend
- Manter persistência para auditoria
- Filtrar no frontend: `messages.filter(m => m.senderId !== 'system')`
- Opção de mostrar/esconder mensagens do bot

**Arquivo:** `src/app/(dashboard)/chat/page.tsx`

**Mudanças (Opção A):**
- Remover bot messages do merge de mensagens
- Receber bot responses via socket separadamente
- Estado local para respostas efêmeras
- **Auto-dismiss após 5 minutos** (300 segundos)
- Usar `setTimeout` para remover mensagem do estado local

---

### Tarefa 5: Criar GeminiInput
**Arquivo Novo:** `src/components/gemini-input.tsx`

**Funcionalidades:**
- Textarea expansível (auto-height)
- Borda com brilho roxo ao focar
- **Botão de mídia (clip):** Upload de arquivo
  - Abrir seletor de arquivo
  - Preview de imagem/documento
  - Enviar como anexo
- **Botão de microfone:** Gravação de áudio
  - Iniciar/parar gravação
  - Visualizar duração
  - Enviar como mensagem de áudio
- Botão de envio com gradiente roxo/rosa
- Enter envia, Shift+Enter quebra linha
- Placeholder dinâmico

**Componente Base:** Fornecido pelo usuário (components/GeminiInput.tsx)

**Funcionalidades Adicionais:**
- `useRef` para input de arquivo oculto
- `MediaRecorder` API para gravação de áudio
- Estado para controlar gravação (`isRecording`)
- Preview de mídia antes de enviar

---

### Tarefa 6: Integrar GeminiInput no Chat
**Arquivo:** `src/app/(dashboard)/chat/page.tsx`

**Mudanças:**
- Substituir `<Input>` + `<Button>` pelo `<GeminiInput>`
- Passar callback `onSend` para o componente
- Remover lógica de command autocomplete (mover para dentro do GeminiInput se necessário)
- Ajustar layout para acomodar novo input

---

### Tarefa 7: Estilos e Polimento
**Arquivo:** `src/styles/globals.css`

**Adicionar:**
```css
@layer utilities {
  .scrollbar-hidden-hover {
    scrollbar-width: none;
    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb {
      background-color: transparent;
      border-radius: 9999px;
      transition: background-color 0.2s ease;
    }
    &:hover::-webkit-scrollbar-thumb {
      background-color: rgba(255, 255, 255, 0.1);
    }
    &::-webkit-scrollbar-thumb:hover {
      background-color: rgba(255, 255, 255, 0.25) !important;
    }
  }
}
```

**Tokens de Design (OKLCH):**
```css
:root {
  --brand-purple: oklch(0.55 0.23 301);
  --brand-pink: oklch(0.62 0.24 340);
}
```

---

### Tarefa 8: Testes e Validação
**Verificação:**
1. Scrollbar oculta, aparece no hover
2. Infinite scroll funciona (carrega ao chegar no topo)
3. Posição preservada ao carregar mensagens antigas
4. Bot commands aparecem e somem (ou são filtrados)
5. Input expansível funciona
6. Enter envia, Shift+Enter quebra linha
7. Gradiente no botão de envio funciona
8. Performance adequada (sem lag ao scrollar)

---

## Fase 3: Cronograma de Implementação

| # | Tarefa | Dependências | Estimativa |
|---|--------|--------------|------------|
| 1 | Criar ScrollableContainer | Nenhuma | 15 min |
| 2 | Atualizar API para paginação | Nenhuma | 20 min |
| 3 | Atualizar frontend para paginação | Tarefa 1, 2 | 30 min |
| 4 | Implementar bot efêmero (5 min) | Nenhuma | 20 min |
| 5 | Criar GeminiInput (com mídia/áudio) | Nenhuma | 45 min |
| 6 | Integrar GeminiInput no chat | Tarefa 5 | 15 min |
| 7 | Estilos e polimento | Tarefa 1 | 10 min |
| 8 | Testes e validação | Todas | 25 min |

**Total Estimado:** ~180 minutos (~3 horas)

---

## Fase 4: Verificação

### Checklist de Validação

- [ ] **Scrollbar:** Oculta por padrão, thumb aparece no hover
- [ ] **Infinite Scroll:** Mensagens carregam ao chegar no topo
- [ ] **Posição:** Scroll preservado ao carregar mensagens antigas
- [ ] **Loading:** Indicador "Carregando mensagens antigas..." aparece
- [ ] **Bot:** Respostas do bot são efêmeros ou filtrados
- [ ] **Input:** Textarea expansível com auto-height
- [ ] **Input:** Borda brilho roxo ao focar
- [ ] **Input:** Botão de envio com gradiente roxo/rosa
- [ ] **Input:** Enter envia, Shift+Enter quebra linha
- [ ] **Performance:** Sem lag ao scrollar
- [ ] **Build:** `npm run build` sem erros
- [ ] **TypeCheck:** `npm run typecheck` sem erros

### Cenários de Teste

1. **Carregamento Inicial:**
   - Abrir chat com 200+ mensagens
   - Verificar que últimas 50 aparecem
   - Scroll para cima deve carregar mais 50

2. **Infinite Scroll:**
   - Rolar até o topo
   - Verificar "Carregando..."
   - Novas mensagens aparecem preservando posição

3. **Bot Commands:**
   - Enviar `/status`
   - Resposta aparece no chat
   - Resposta desaparece automaticamente após **5 minutos**

4. **Input:**
   - Digitar mensagem longa
   - Textarea deve expandir automaticamente
   - Enter deve enviar
   - Shift+Enter deve quebra linha

5. **Upload de Mídia:**
   - Clicar botão de clip
   - Selecionar arquivo
   - Preview aparece antes de enviar
   - Arquivo é enviado como anexo

6. **Gravação de Áudio:**
   - Clicar botão de microfone
   - Iniciar gravação
   - Visualizar duração
   - Parar e enviar áudio

---

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Descrição |
|---------|-----------|
| `src/components/scrollable-container.tsx` | Container com scrollbar oculta e infinite scroll |
| `src/components/gemini-input.tsx` | Input moderno estilo Gemini com mídia/áudio |

### Modificar
| Arquivo | Mudanças |
|---------|----------|
| `backend/src/routes/chat.ts` | Adicionar paginação por cursor + endpoint de upload |
| `src/lib/queries/messages.ts` | Suporte a paginação |
| `src/app/(dashboard)/chat/page.tsx` | Integrar ScrollableContainer, GeminiInput, bot efêmero |
| `src/styles/globals.css` | Estilos de scrollbar e tokens de design |

---

## Referências

- **ScrollableContainer:** Fornecido pelo usuário (components/ScrollableContainer.tsx)
- **GeminiInput:** Fornecido pelo usuário (components/GeminiInput.tsx)
- **Chat Page Atual:** `src/app/(dashboard)/chat/page.tsx` (318 linhas)
- **API Chat:** `backend/src/routes/chat.ts` (311 linhas)
- **Bot Commands:** `backend/src/lib/chat-commands.ts` (196 linhas)
- **Message Scroller (não usado):** `src/components/ui/message-scroller.tsx`

---

## Notas Importantes

1. **ScrollableContainer vs MessageScroller:** O projeto já tem um `message-scroller.tsx` avançado mas não utilizado. O usuário forneceu um componente mais simples. Recomendo usar o fornecido pelo usuário por ser mais leve e direto.

2. **Bot Efêmero (5 minutos):** Respostas do bot são temporárias e somem após 5 minutos. Implementar com `setTimeout` no frontend para remover do estado local.

3. **Paginação:** A API atual retorna 200 mensagens fixo. A paginação precisa ser backward-compatible para não quebrar outros clientes.

4. **Performance:** O infinite scroll com IntersectionObserver é eficiente mas precisa de testes com grande volume de mensagens.

5. **Upload de Mídia:** Usar `<input type="file">` oculto + `URL.createObjectURL` para preview. Enviar como `FormData` para o backend.

6. **Gravação de Áudio:** Usar `MediaRecorder` API do navegador. Salvar como blob e enviar como `FormData`. Considerar limites de tamanho.

7. **Backend para Mídia:** Pode ser necessário criar endpoint separado para upload de arquivos (`POST /api/chat/upload`), já que o endpoint atual espera JSON.
