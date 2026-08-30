# Jarvis Kit Skills

> **Guia para criar e usar Skills no Jarvis Kit**

---

## Introdução

Embora os modelos de IA do Jarvis Kit sejam poderosos, eles não conhecem o contexto específico do seu projeto ou as convenções da sua equipe. Carregar cada regra ou ferramenta no contexto do agent resulta em "inflação de contexto", custos mais altos, latência e confusão.

**Jarvis Skills** resolve isso através de **Progressive Disclosure**. Skills são pacotes de conhecimento especializado, inativos até serem necessários. As informações só são carregadas no contexto do agent quando a solicitação específica do usuário corresponde ao conteúdo descrito na skill.

---

## Estrutura e Escopo

Skills são pacotes baseados em diretório. Você pode definir escopos conforme sua necessidade:

| Escopo | Caminho | Descrição |
|--------|---------|-----------|
| **Workspace** | `<raiz-do-workspace>/.opencode/skills/` | Específico de um projeto |

### Estrutura de diretório da skill

```
minha-skill/
├── SKILL.md      # (Obrigatório) Metadados e instruções
├── scripts/      # (Opcional) Scripts Python ou Bash
├── references/   # (Opcional) Textos, documentação, templates
└── assets/       # (Opcional) Imagens ou logos
```

---

## Exemplo 1: Skill de Code Review

Esta é uma skill apenas com instruções — basta criar o arquivo `SKILL.md`.

### Passo 1: Criar diretório

```bash
mkdir -p .opencode/skills/code-review
```

### Passo 2: Criar SKILL.md

```markdown
---
name: code-review
description: Revisa mudanças de código em busca de bugs, problemas de estilo e boas práticas. Usar ao revisar PRs ou verificar qualidade.
---

# Skill de Code Review

Ao revisar código, siga estes passos:

## Checklist de revisão

1. **Corretude**: O código faz o que deveria fazer?
2. **Casos extremos**: Erros e condições de erro são tratados?
3. **Estilo**: Segue as convenções do projeto?
4. **Performance**: Há ineficiências óbvias?

## Como dar feedback

- Seja específico sobre o que precisa mudar
- Explique o porquê, não apenas o quê
- Sugira alternativas quando possível
```

> **Nota**: O arquivo `SKILL.md` contém metadados (name, description) no topo, seguido das instruções. O agent só lê os metadados e carrega as instruções quando necessário.

### Teste

Crie o arquivo `demo_bad_code.py`:

```python
import time

def get_user_data(users, id):
    for u in users:
        if u['id'] == id:
            return u
    return None

def process_payments(items):
    total = 0
    for i in items:
        tax = i['price'] * 0.1
        total = total + i['price'] + tax
        time.sleep(0.1)
    return total

def run_batch():
    users = [{'id': 1, 'name': 'Alice'}, {'id': 2, 'name': 'Bob'}]
    items = [{'price': 10}, {'price': 20}, {'price': 100}]
    
    u = get_user_data(users, 3)
    print("User found: " + u['name'])
    
    print("Total: " + str(process_payments(items)))

if __name__ == "__main__":
    run_batch()
```

**Prompt**: `revisar o arquivo @demo_bad_code.py`

O agent identificará automaticamente a skill `code-review`, carregará as informações e seguirá as instruções.

---

## Exemplo 2: Skill de License Header

Esta skill usa um arquivo de referência no diretório `resources/`.

### Passo 1: Criar diretório

```bash
mkdir -p .opencode/skills/license-header-adder/resources
```

### Passo 2: Criar arquivo template

**`.opencode/skills/license-header-adder/resources/HEADER.txt`**:

```
/*
 * Copyright (c) 2026 SUA_EMPRESA.
 * Todos os direitos reservados.
 * Este código é proprietário e confidencial.
 */
```

### Passo 3: Criar SKILL.md

**`.opencode/skills/license-header-adder/SKILL.md`**:

```markdown
---
name: license-header-adder
description: Adiciona o header de licença padrão em novos arquivos de código.
---

# License Header Adder

Esta skill garante que todos os novos arquivos de código tenham o header de copyright correto.

## Instruções

1. **Ler o Template**: Leia o conteúdo de `resources/HEADER.txt`.
2. **Aplicar ao Arquivo**: Ao criar um novo arquivo, prependa este conteúdo exato.
3. **Adaptar Sintaxe**:
   - Para linguagens estilo C (Java, TS), mantenha o bloco `/* */`.
   - Para Python/Shell, converta para comentários com `#`.
```

### Teste

**Prompt**: `Crie um novo script Python chamado data_processor.py que imprima 'Olá Mundo'.`

O agent lerá o template, converterá os comentários para o estilo Python e adicionará automaticamente no início do arquivo.

---

## Conclusão

Ao criar Skills, você transformou o modelo de IA genérico em um especialista para o seu projeto:

- ✅ Sistematiza boas práticas
- ✅ Segue regras de revisão de código
- ✅ Adiciona license headers automaticamente
- ✅ O agent sabe automaticamente como trabalhar com sua equipe

Em vez de constantly lembrar a IA "adicionar license" ou "corrigir formato de commit", agora o agent executa automaticamente!
