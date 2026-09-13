# Plan: Tabs para Máquinas

## Context
A página `/maquinas` tem duas visões:
1. **Grid View** (sem `?id=`): Cards de máquinas + Telemetria + Materiais órfãos
2. **Channel View** (com `?id=`): Uma máquina com Telemetria + Consumo Mensal + Materiais

O usuário quer usar **Tabs** para organizar o conteúdo da Channel View, separando por categoria de dados.

## Estrutura Atual (Channel View)
```
MachineChannelView
├── Header (nome, badge, botão voltar)
├── MachineTelemetryPanel
├── Card: Consumo Mensal
└── Card: Materiais do Equipamento
```

## Estrutura Proposta (com Tabs)
```
MachineChannelView
├── Header (nome, badge, botão voltar)
└── Tabs
    ├── TabsList
    │   ├── TabsTrigger "Status" → TelemetriaPanel
    │   ├── TabsTrigger "Consumo" → ConsumoMensal
    │   └── TabsTrigger "Materiais" → MateriaisList
    ├── TabsContent "status" → MachineTelemetryPanel
    ├── TabsContent "consumo" → Card Consumo Mensal
    └── TabsContent "materiais" → Card Materiais
```

## Tasks

### 1. Instalar componente Tabs
- Rodar `npx shadcn@latest add tabs`
- Isso cria `src/components/ui/tabs.tsx` usando `@base-ui/react`

### 2. Refatorar MachineChannelView
- Extrair cada seção em componentes separados:
  - `StatusTab` → MachineTelemetryPanel (já existe)
  - `ConsumoTab` → Card de consumo mensal (extraído do retorno atual)
  - `MateriaisTab` → Card de materiais vinculados (extraído do retorno atual)
- Envolver tudo em `<Tabs defaultValue="status">`

### 3. Ajustar layout
- Manter header fora das tabs
- Usar `defaultValue="status"` para abrir na telemetria por padrão
- Tabs ficam entre header e conteúdo

## Verification
- [ ] `npm run typecheck` passa
- [ ] `npm run lint` passa
- [ ] `npm run build` (static export) funciona
- [ ] Visual: tabs aparecem com 3 abas funcionais
- [ ] Cada tab mostra o conteúdo correto
- [ ] Mobile: tabs responsivas (scroll horizontal se necessário)
