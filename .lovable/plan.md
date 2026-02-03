
## Plano: Adicionar Botão para Criar Novo Usuário no Painel Admin

### Problema Identificado

O componente `UsersManager.tsx` permite apenas editar usuários existentes, mas não oferece uma funcionalidade para criar novos usuários diretamente no painel de administração.

### Abordagem

Existem duas opções para criar usuários:

1. **Convite por Email (Recomendado)**: Enviar um convite para o email do usuário, onde ele clica no link e define sua senha
2. **Criação Direta com Senha Temporária**: O admin define uma senha inicial que o usuário deve trocar

Vou implementar a **opção 1** (convite por email) por ser mais segura e seguir boas práticas de autenticação.

---

### Alterações Propostas

#### A. Adicionar Botão "Novo Usuário" no Header

**Arquivo**: `src/components/admin/UsersManager.tsx`

Adicionar um botão ao lado do título:

```tsx
<CardHeader>
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <CardTitle className="flex items-center gap-2">
        <Users className="h-5 w-5" />
        Usuários
      </CardTitle>
      <CardDescription>Gerencie os usuários e suas permissões</CardDescription>
    </div>
    <Button onClick={() => setShowInviteDialog(true)}>
      <UserPlus className="h-4 w-4 mr-2" />
      Novo Usuário
    </Button>
  </div>
</CardHeader>
```

#### B. Criar Dialog de Convite de Usuário

Novo dialog com campos para:
- **Email** (obrigatório)
- **Nome** (obrigatório)
- **Papel/Role** (seleção)
- **Empresa** (opcional)

#### C. Criar Edge Function para Convite Admin

**Arquivo**: `supabase/functions/admin-invite-user/index.ts`

Uma edge function segura que:
1. Verifica se o solicitante é admin ou superadmin
2. Usa a API Admin do Supabase para criar o convite
3. Cria o profile e role do usuário automaticamente

#### D. Adicionar Hook para Convite

**Arquivo**: `src/hooks/useAdminUsers.ts`

Adicionar mutação `inviteUser` que chama a edge function.

---

### Fluxo de Criação de Usuário

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. Admin clica em "Novo Usuário"                                │
│                      ↓                                          │
│ 2. Preenche: Email, Nome, Papel, Empresa                        │
│                      ↓                                          │
│ 3. Edge function cria usuário via Supabase Admin API            │
│                      ↓                                          │
│ 4. Usuário recebe email com link para definir senha             │
│                      ↓                                          │
│ 5. Profile e role já criados pelo trigger handle_new_user       │
│                      ↓                                          │
│ 6. Usuário clica no link, define senha e está ativo             │
└─────────────────────────────────────────────────────────────────┘
```

---

### Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| `src/components/admin/UsersManager.tsx` | Adicionar botão e dialog de convite |
| `supabase/functions/admin-invite-user/index.ts` | Nova edge function para convite seguro |
| `src/hooks/useAdminUsers.ts` | Adicionar função `inviteUser` |

---

### Notas Técnicas

1. A edge function precisará do `SUPABASE_SERVICE_ROLE_KEY` para usar a Admin API
2. O trigger `handle_new_user` já cria automaticamente o profile e role
3. Será necessário atualizar o profile com nome e empresa após criação (via edge function)
4. O convite envia email automático com link de confirmação

### Resultado Esperado

- Botão "Novo Usuário" visível no header da lista de usuários
- Dialog com formulário simples para convidar usuários
- Usuário recebe email e pode definir sua senha
- Profile já vem com nome e empresa pré-configurados pelo admin
