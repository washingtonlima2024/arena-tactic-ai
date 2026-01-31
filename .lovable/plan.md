
## Plano: Completar Módulo de Administração de Acessos e Configurar Usuário Padrão

### Resumo do Pedido

1. **Usuário padrão de acesso**: `washington@katttus.com` com senha (armazenada de forma segura, não exposta no código)
2. **Completar módulo de administração de acessos** com sistema de papéis granulares
3. **Sistema de permissões detalhado**:
   - Visualizador: apenas ver dados
   - Operador: ver + importar jogos + editar informações limitadas
   - Gerente, Admin Empresa, SuperAdmin (já existentes)
4. **Controle de créditos** integrado ao sistema de papéis

---

### 1. Configuração do Usuário Padrão

**Abordagem Segura**: A senha NÃO será armazenada no código. O usuário já existe no banco (`washington@kakttus.com` com role `superadmin`). Para atualizar ou criar credenciais, usaremos uma migração SQL que configura o usuário via Supabase Auth.

**Nota**: O email no banco está como `washington@kakttus.com` (com dois 't'). Confirme se deseja usar `washington@katttus.com` (com um 't') ou manter o existente.

---

### 2. Aprimorar Sistema de Papéis (Roles)

**Roles Atuais**:
| Role | Nível | Descrição |
|------|-------|-----------|
| superadmin | 100 | Acesso total, todas empresas |
| org_admin | 80 | Admin da própria empresa |
| manager | 60 | Gerencia partidas e times |
| uploader | 40 | Upload e análises |
| viewer | 20 | Apenas visualização |

**Ajustes Propostos**:
Manter a estrutura atual mas detalhar melhor as permissões no código e UI para clareza.

---

### 3. Alterações no Código

#### A. Hook `useAuth.ts` - Adicionar permissões granulares

```typescript
// Novas permissões a adicionar:
canImport: boolean;     // Importar jogos (uploader+)
canEdit: boolean;       // Editar informações (manager+)
canViewCredits: boolean; // Ver saldos de créditos
```

#### B. Componente `UsersManager.tsx` - Melhorar UI de Permissões

1. Adicionar descrições detalhadas para cada papel
2. Exibir checklist visual de permissões por papel
3. Adicionar indicadores visuais de créditos disponíveis
4. Botão de "Resetar senha" (se aplicável)

#### C. Página `Admin.tsx` - Proteção por Papel

Garantir que apenas `superadmin` e `org_admin` acessem a área administrativa.

---

### 4. Detalhes Técnicos de Implementação

#### Arquivo: `src/hooks/useAuth.ts`

```typescript
// Adicionar novas permissões derivadas
interface AuthState {
  // ... existentes ...
  canImport: boolean;   // uploader, manager, org_admin, superadmin
  canEdit: boolean;     // manager, org_admin, superadmin
  canViewCredits: boolean; // org_admin, superadmin
}

function getPermissionsFromRole(role: AppRole | null) {
  const roleLevel = role ? ROLE_HIERARCHY[role] || 0 : 0;
  
  return {
    // ... existentes ...
    canImport: roleLevel >= ROLE_HIERARCHY.uploader,
    canEdit: roleLevel >= ROLE_HIERARCHY.manager,
    canViewCredits: roleLevel >= ROLE_HIERARCHY.org_admin,
  };
}
```

#### Arquivo: `src/components/admin/UsersManager.tsx`

1. **Mapa de permissões por papel**:
```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  viewer: ['Ver partidas', 'Ver estatísticas', 'Ver times'],
  uploader: ['Tudo de Viewer', 'Importar jogos', 'Fazer upload de vídeos', 'Iniciar análises'],
  manager: ['Tudo de Operador', 'Editar partidas', 'Gerenciar times', 'Ver relatórios'],
  org_admin: ['Tudo de Gerente', 'Gerenciar usuários da empresa', 'Ver créditos', 'Configurações da empresa'],
  superadmin: ['Acesso total', 'Todas as empresas', 'Configurações globais'],
};
```

2. **Componente de visualização de permissões**:
```tsx
<div className="space-y-2">
  <Label>Permissões do Papel</Label>
  <div className="rounded-lg border p-3 bg-muted/30">
    <ul className="text-sm space-y-1">
      {ROLE_PERMISSIONS[formData.role]?.map(perm => (
        <li key={perm} className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          {perm}
        </li>
      ))}
    </ul>
  </div>
</div>
```

3. **Melhorar descrições de cada papel no seletor**

---

### 5. Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAuth.ts` | Adicionar 3 novas permissões derivadas |
| `src/components/admin/UsersManager.tsx` | Mapa de permissões, UI de checklist, melhorias visuais |
| `src/pages/Admin.tsx` | Verificação de permissão org_admin |

---

### 6. Segurança

- **Senha não fica no código**: Credenciais são gerenciadas via Supabase Auth
- **RLS policies**: Já configuradas na tabela `user_roles` com functions `is_superadmin()`, `is_admin()`, etc.
- **Validação server-side**: O servidor Python já valida permissões via API

---

### 7. Resultado Esperado

Após implementação:

1. **Usuário `washington@kakttus.com`** continua como superadmin (já existe)
2. **UI de permissões** mostra claramente o que cada papel pode fazer
3. **Sistema de papéis** funciona de forma granular:
   - Viewer: só visualiza
   - Operador (uploader): visualiza + importa jogos
   - Gerente: visualiza + importa + edita
   - Admin Empresa: gerencia equipe + créditos
   - SuperAdmin: acesso total

4. **Créditos** visíveis apenas para admins na lista de usuários
