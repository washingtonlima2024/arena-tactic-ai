
# Implementação de Campo para Trocar Senha na Área de Usuários

## Resumo
Adicionar funcionalidade de reset de senha na interface de administração de usuários, permitindo que o SuperAdmin altere a senha de qualquer usuário sem a necessidade de conhecer a senha anterior.

## Análise Atual
- ✅ **Backend Python** (`server.py`): Endpoint `/api/admin/users/<user_id>/profile` já existe e suporta atualizar qualquer campo de perfil
- ✅ **CLI Python** (`manage_users.py`): Já possui comando `reset-password email nova_senha` para resetar senhas via terminal
- ❌ **Frontend**: Atualmente **NÃO** há campo de senha no dialog de edição de usuários
- ❌ **API Client**: Não há método específico para trocar senha (precisa criar um)

## O Que Será Implementado

### 1. **Novo Endpoint no Backend** (Recomendado)
Criar endpoint dedicado para trocar senha com melhor validação:
- **Endpoint**: `PUT /api/admin/users/<user_id>/password`
- **Body**: `{ "new_password": "string" }`
- **Resposta**: Confirmação ou erro
- **Segurança**: Validar que a senha tem comprimento mínimo (8 caracteres), sem espaços extras

**Benefício**: Separação de responsabilidades, melhor auditoria, validação específica de senha.

### 2. **Atualizar `src/lib/apiClient.ts`**
Adicionar método na seção `admin`:
```typescript
resetUserPassword: (userId: string, newPassword: string) => apiRequest<any>(
  `/api/admin/users/${userId}/password`,
  { method: 'PUT', body: JSON.stringify({ new_password: newPassword }) }
)
```

### 3. **Atualizar `src/hooks/useAdminUsers.ts`**
Adicionar mutation para trocar senha:
```typescript
const resetPasswordMutation = useMutation({
  mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
    return await apiClient.admin.resetUserPassword(userId, newPassword);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  }
});

// Exportar função no return
resetUserPassword: (userId: string, newPassword: string) => 
  resetPasswordMutation.mutateAsync({ userId, newPassword }),
isResettingPassword: resetPasswordMutation.isPending,
```

### 4. **Refatorar `src/components/admin/UsersManager.tsx`**
Modificar o dialog de edição:

**Adicionar campos**:
- Campo de input para nova senha (tipo `password`)
- Botão "Gerar Senha Aleatória" (opcional, para facilitar)
- Checkbox "Enviar senha por email" (placeholder, pode ser implementado depois)
- Validação: exigir mínimo 8 caracteres, mostrar aviso se está vazio

**Lógica**:
- Ao salvar, se o campo de senha foi preenchido, chamar `resetUserPassword()`
- Mostrar toast de sucesso/erro específico para a operação de senha
- Limpar o campo de senha após salvar com sucesso

**UI Structure**:
```
Dialog "Editar Usuário"
├── Nome
├── Email
├── CPF/CNPJ
├── Papel
├── Organização
├── [NEW] ------- Seção de Segurança -------
├── [NEW] Nova Senha (password input, opcional)
├── [NEW] Gerar Senha Aleatória (button)
└── [Footers] Cancelar | Salvar
```

## Fluxo de Uso
1. Super Admin abre o dialog de edição de um usuário
2. Navega até a seção "Segurança" (ou campo de senha)
3. Preenche a nova senha (ou clica em "Gerar Aleatória")
4. Clica "Salvar"
5. Sistema valida (mínimo 8 caracteres)
6. API chama `PUT /api/admin/users/<id>/password` com a nova senha
7. Backend faz hash com bcrypt e atualiza o banco
8. Frontend mostra confirmação: "Senha alterada com sucesso!"

## Detalhes Técnicos

### Backend - Novo Endpoint (server.py, linha ~12060)
```python
@app.route('/api/admin/users/<user_id>/password', methods=['PUT'])
def reset_user_password(user_id):
    """Reset a user's password (SuperAdmin only)."""
    session = get_session()
    try:
        data = request.get_json()
        new_password = data.get('new_password', '').strip()
        
        if not new_password or len(new_password) < 8:
            return jsonify({'error': 'Senha deve ter no mínimo 8 caracteres'}), 400
        
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({'error': 'Usuário não encontrado'}), 404
        
        user.password_hash = hash_password(new_password)
        user.updated_at = datetime.utcnow()
        session.commit()
        
        return jsonify({'message': 'Senha alterada com sucesso'})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()
```

### Frontend - Validação
```typescript
const validatePassword = (password: string): string | null => {
  if (!password) return null; // Campo opcional
  if (password.length < 8) return 'Mínimo 8 caracteres';
  if (password !== password.trim()) return 'Sem espaços extras';
  return null;
};
```

### Gerador de Senha Aleatória (Opcional)
```typescript
const generateRandomPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};
```

## Arquivos a Modificar
1. **`video-processor/server.py`** - Adicionar endpoint `/api/admin/users/<user_id>/password` (backend)
2. **`src/lib/apiClient.ts`** - Adicionar `admin.resetUserPassword()`
3. **`src/hooks/useAdminUsers.ts`** - Adicionar mutation `resetPasswordMutation`
4. **`src/components/admin/UsersManager.tsx`** - Adicionar campo senha no dialog

## Segurança
- ✅ Apenas SuperAdmin pode chamar o endpoint (requer autenticação)
- ✅ Senha é hasheada com bcrypt antes de salvar
- ✅ Validação de mínimo 8 caracteres
- ✅ Campo é do tipo `password` (não exibe texto)
- ✅ Após reset, o usuário pode fazer login com a nova senha

## Próximas Melhorias (Futuro)
- Envio de email com senha temporária ao usuário
- Log de auditoria: "Senha de X alterada por Y em Z"
- Exigir troca de senha no primeiro login após reset
- Histórico de mudanças de senha
