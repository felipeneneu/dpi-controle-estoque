# GraficaOS — Frontend (Next.js)

Interface web do GraficaOS (controle de estoque para gráfica), construída com Next.js 16, React 19, Tailwind CSS v4 e shadcn.

A documentação completa do projeto, incluindo arquitetura e instruções de execução, está no [README.md da raiz](../README.md).

## Arquitetura

```
grafica-app/
├── src/
│   ├── app/              # Next.js App Router (páginas)
│   ├── components/       # Componentes React (shadcn/ui)
│   ├── lib/              # Utilitários, socket, API client
│   └── hooks/            # Custom hooks (React Query, etc.)
├── backend/
│   └── src/
│       ├── routes/       # Endpoints Fastify (stock, chat, mimaki, etc.)
│       ├── middleware/    # Auth JWT + M2M (X-API-Secret)
│       ├── agents/       # Bot agents (chat commands)
│       ├── db/           # Schema Drizzle + migrations
│       └── lib/          # WhatsApp, settings, utilitários
└── public/               # Assets estáticos
```

## Funcionalidades Principais

- **Estoque em tempo real** — gerenciamento de mídias, tintas e insumos com atualização via Socket.IO
- **Máquinas** — cadastro e monitoramento (Konica Minolta, HP, Mimaki)
- **Chat interno** — mensagens em tempo real com comandos de bot (respostas DM privadas)
- **Integração Mimaki** — recepção de jobs via M2M (Mimaki Tracker Electron) com dedução automática de estoque
- **Notificações dinâmicas** — badges em tempo real no sidebar
- **Alertas WhatsApp** — notificação de estoque baixo

## Para subir em desenvolvimento

```bash
npm run dev          # frontend -> http://localhost:3000
npm run dev:backend  # api     -> http://localhost:3001
# ou na raiz do monorepo:
npm run dev:ui       # frontend
```

## Integração Mimaki

O frontend exibe um painel informativo para máquinas Mimaki (sem telemetria de rede). Jobs são recebidos via endpoint M2M e material não identificado gera notificação em tempo real para vinculação manual.