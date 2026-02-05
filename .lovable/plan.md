

# Plano: Configurar Usuários SuperAdmin

## Situação Atual

O sistema de autenticação é **100% local** (SQLite + JWT). Os usuários ficam armazenados no arquivo `arena_play.db`.

### Sobre admin@arenaplay.com
- **Não existe** nenhum usuário pré-configurado no código
- O **primeiro usuário a se cadastrar** vira automaticamente `superadmin` e é aprovado
- Se esse email já foi cadastrado, a senha está no banco SQLite (hash bcrypt)

### Sobre washington@kakttus.com
- Precisa ser criado ou ter a senha atualizada para `arena2025`

## Solução Proposta

Criar um **script de utilidade** para gerenciar senhas de usuários via terminal, sem depender da interface web.

## Alteração Necessária

| Arquivo | Ação |
|---------|------|
| `video-processor/manage_users.py` | Criar script CLI para gerenciar usuários |

## Script a Ser Criado

```python
# video-processor/manage_users.py
"""
Script de linha de comando para gerenciar usuários do Arena Play.

Uso:
  python manage_users.py list                     # Listar todos os usuários
  python manage_users.py create email senha nome  # Criar novo usuário
  python manage_users.py reset-password email nova_senha  # Redefinir senha
  python manage_users.py approve email            # Aprovar usuário
  python manage_users.py set-role email role      # Alterar role
"""
```

## Funcionalidades do Script

1. **Listar usuários**: `python manage_users.py list`
   - Mostra email, role, status de aprovação

2. **Criar usuário superadmin**: `python manage_users.py create washington@kakttus.com arena2025 "Washington Lima" --role superadmin --approved`

3. **Redefinir senha**: `python manage_users.py reset-password admin@arenaplay.com nova_senha`

4. **Aprovar usuário**: `python manage_users.py approve email@exemplo.com`

5. **Alterar role**: `python manage_users.py set-role email@exemplo.com superadmin`

## Execução Imediata

Após criar o script, você poderá executar no servidor:

```bash
cd video-processor

# Listar usuários existentes (ver se admin@arenaplay.com existe)
python manage_users.py list

# Criar washington@kakttus.com como superadmin
python manage_users.py create washington@kakttus.com arena2025 "Washington Lima" --role superadmin --approved

# Ou se já existir, apenas redefinir a senha
python manage_users.py reset-password washington@kakttus.com arena2025
```

## Resultado Esperado

Após executar o script:
- ✅ washington@kakttus.com pode fazer login com senha `arena2025`
- ✅ Terá role `superadmin` e acesso total
- ✅ Você pode verificar/redefinir a senha de qualquer usuário

