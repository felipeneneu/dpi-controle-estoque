# 🔐 Role-Based Access Control (RBAC) Specification

---

### 1. Definição de Papéis (Roles)

| Permissão / Ação | `DEV_MASTER` (Felipe) | `ADMIN` (Gerente) | `OPERATOR` (Produção/Balcão) |
| :--- | :---: | :---: | :---: |
| **Visualizar Grid de Estoque** | ✅ | ✅ | ✅ |
| **Registrar Baixa de Material (OS)** | ✅ | ✅ | ✅ |
| **Cadastrar / Editar Produtos** | ✅ | ✅ | ❌ |
| **Excluir Insumos ou Máquinas** | ✅ | ❌ | ❌ |
| **Ajustar Manualmente Estoque** | ✅ | ✅ | ❌ |
| **Gerenciar Usuários e Permissões**| ✅ | ❌ | ❌ |
| **Visualizar Audit Logs do Sistema**| ✅ | ✅ | ❌ |
| **Receber Jobs Mimaki (M2M)** | ✅ (secret) | ❌ | ❌ |
| **Vincular Material Mimaki** | ✅ | ✅ | ✅ |
| **Listar Jobs Mimaki** | ✅ | ✅ | ✅ |

---

### 2. Middleware de Validação RBAC (Fastify / Node.js)

```typescript
// src/middlewares/rbac.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export type Role = 'DEV_MASTER' | 'ADMIN' | 'OPERATOR';

export function authorize(allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { id: string; role: Role };

    if (!user || !allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Acesso Negado',
        message: 'Você não possui permissão para executar esta ação.',
      });
    }
  };
}
```

### 3. Aplicação das Permissões nas Rotas da API

```typescript
// Exemplo de uso nas rotas Fastify
app.post('/api/items', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, createItemHandler);
app.delete('/api/items/:id', { preHandler: [authenticate, authorize(['DEV_MASTER'])] }, deleteItemHandler);
app.post('/api/items/baixa', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])] }, baixaEstoqueHandler);
```
