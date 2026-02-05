
## Plano: Trocar "Visualizador" por "Espectador"

### Problema
A palavra "Visualizador" é usada para descrever o role de menor permissão (apenas leitura). O usuário quer trocar por "Espectador".

### Localização das Alterações

Encontrei 4 ocorrências de "Visualizador" em 3 arquivos:

| Arquivo | Linha | Contexto |
|---------|-------|----------|
| `src/components/admin/UsersManager.tsx` | 26 | `ROLE_LABELS` - dicionário de labels dos roles |
| `src/components/admin/UsersManager.tsx` | 31 | `ROLE_OPTIONS` - opção de role com label e descrição |
| `src/components/auth/RoleBadge.tsx` | 45 | `ROLE_CONFIG` - configuração de badge do role |
| `src/components/auth/RequireAuth.tsx` | 26 | `ROLE_LABELS` - dicionário de labels dos roles |

### Alterações Necessárias

```typescript
// src/components/admin/UsersManager.tsx
const ROLE_LABELS: Record<string, string> = {
  // ... outros roles ...
  viewer: 'Espectador',  // Era 'Visualizador'
};

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Espectador', description: 'Apenas visualização' },
  // ... outros roles ...
];

// src/components/auth/RoleBadge.tsx
const ROLE_CONFIG: Record<AppRole, { ... }> = {
  // ... outros roles ...
  viewer: {
    label: 'Espectador',  // Era 'Visualizador'
    variant: 'outline',
    icon: Eye,
    color: '',
  },
};

// src/components/auth/RequireAuth.tsx
const ROLE_LABELS: Record<string, string> = {
  // ... outros roles ...
  viewer: 'Espectador',  // Era 'Visualizador'
};
```

### Impacto
- **Afeta a interface**: Labels e badges dos usuários com role `viewer` mostrarão "Espectador"
- **Sem mudanças de backend**: O valor da role (`viewer`) permanece o mesmo
- **Compatibilidade**: Usuários existentes com role `viewer` funcionarão normalmente

### Ordem de Execução
1. Atualizar `src/components/admin/UsersManager.tsx` (2 linhas)
2. Atualizar `src/components/auth/RoleBadge.tsx` (1 linha)
3. Atualizar `src/components/auth/RequireAuth.tsx` (1 linha)
