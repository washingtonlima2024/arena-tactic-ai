
## Plano: Corrigir Módulo de Administração de Usuários

### Diagnóstico dos Problemas Encontrados

Após análise detalhada do código e banco de dados, identifiquei as seguintes questões:

#### 1. Credenciais de Demo Hardcoded (Landing.tsx - linha 88-89)
- **Problema**: O formulário de login vem pré-preenchido com `admin@arenaplay.com` / `arena2025`
- **Solicitação**: Mudar para campos vazios (não exibir credenciais) ou usar `washington@katttus.com`

#### 2. Nome Gerado Automaticamente (Trigger handle_new_user)
- **Problema**: O trigger cria o `display_name` automaticamente usando:
  ```sql
  COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  ```
  Isso faz com que novos usuários venham com nomes como "Washington Lima" ou "admin" baseado no email.
- **Solicitação**: Remover o preenchimento automático para que o admin defina manualmente

#### 3. O UsersManager já foi atualizado
- As permissões granulares (`ROLE_PERMISSIONS`, checklist visual) já estão implementadas no código
- O fallback para Supabase já funciona quando o servidor local não está disponível

---

### Alterações Propostas

#### A. Remover Credenciais de Demo da Landing Page

**Arquivo**: `src/pages/Landing.tsx` (linhas 88-89)

```typescript
// DE:
const [email, setEmail] = useState('admin@arenaplay.com');
const [password, setPassword] = useState('arena2025');

// PARA:
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
```

Também remover a mensagem "Demonstração: credenciais já preenchidas" (linha 442-444).

#### B. Atualizar Trigger para Não Gerar Nome Automaticamente

**Migração SQL** para atualizar a função `handle_new_user`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_count INTEGER;
  new_role text;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  IF user_count = 0 THEN
    new_role := 'superadmin';
  ELSE
    new_role := 'viewer';
  END IF;
  
  -- NÃO preencher display_name automaticamente
  INSERT INTO public.profiles (user_id, email, display_name, credits_balance, credits_monthly_quota)
  VALUES (
    NEW.id, 
    NEW.email, 
    NULL,  -- Admin define manualmente depois
    10,
    10
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  RETURN NEW;
END;
$$;
```

#### C. Melhorar UI do UsersManager para Usuários Sem Nome

**Arquivo**: `src/components/admin/UsersManager.tsx`

Alterar a exibição de "Sem nome" para ficar mais visível e adicionar um indicador de "Cadastro pendente":

```tsx
// Linha 246 - Melhorar exibição
<div className="font-medium">
  {user.display_name || (
    <span className="text-amber-500 flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      Cadastro pendente
    </span>
  )}
</div>
```

---

### Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Landing.tsx` | Remover credenciais pré-preenchidas e mensagem de demo |
| Migração SQL | Atualizar `handle_new_user` para não gerar display_name |
| `src/components/admin/UsersManager.tsx` | Indicador visual para usuários sem nome cadastrado |

---

### Resultado Esperado

1. Formulário de login vazio (sem credenciais expostas)
2. Novos usuários entram sem nome pré-definido
3. Admin vê claramente quais usuários precisam ter o cadastro completado
4. Sistema de permissões granulares já funcionando (implementado anteriormente)
