

# Plano: Sistema 100% Local - Remover Dependência do Supabase

## Resumo da Situação Atual

### O Que JÁ Existe Localmente (SQLite + Python)
| Componente | Status |
|------------|--------|
| Modelo `User` | ✅ Pronto (email, senha, is_active) |
| Modelo `Profile` | ✅ Pronto (CPF/CNPJ, endereço, telefone) |
| Modelo `UserRole` | ✅ Pronto (roles separadas) |
| Autenticação JWT (`auth_local.py`) | ✅ Pronto (login, token, bcrypt) |
| Hierarquia de Roles | ✅ Pronto (viewer→superadmin) |

### O Que AINDA USA Supabase (Precisa Migrar)
| Componente | Arquivo | Problema |
|------------|---------|----------|
| Hook `useAuth` | `src/hooks/useAuth.ts` | Usa `supabase.auth.*` |
| Hook `useAdminUsers` | `src/hooks/useAdminUsers.ts` | Consulta Supabase como primário |
| Página Auth | `src/pages/Auth.tsx` | Usa `supabase.auth.signUp/signIn` |

### O Que FALTA no Backend Local
| Item | Descrição |
|------|-----------|
| Endpoints de Auth | Não existe `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` |
| Campo `is_approved` | Usuário cadastra mas precisa aprovação do SuperAdmin |
| Endpoint de listagem | `/api/admin/users` para listar todos os usuários |

---

## Campos do Cadastro Simplificado

O formulário de cadastro terá **apenas**:
- Nome completo
- Email
- Senha
- CPF ou CNPJ
- Endereço (CEP + campos automáticos)

Após cadastro:
- Usuário fica com `is_approved = false`
- SuperAdmin vê na lista de "Pendentes"
- SuperAdmin aprova → `is_approved = true` → Usuário pode acessar

---

## Alterações Necessárias

### 1. Backend Python (SQLite)

**Arquivo: `video-processor/models.py`**
- Adicionar campo `is_approved` na tabela `users` (default: `false`)
- Primeiro usuário automaticamente aprovado

**Arquivo: `video-processor/server.py`**
- Criar endpoints:
  - `POST /api/auth/register` - Cadastro de novo usuário
  - `POST /api/auth/login` - Login com email/senha
  - `POST /api/auth/logout` - Invalidar sessão
  - `GET /api/auth/me` - Retornar usuário logado
  - `GET /api/admin/users` - Listar todos os usuários
  - `POST /api/admin/users/:id/approve` - Aprovar usuário
  - `PUT /api/admin/users/:id` - Atualizar usuário

**Arquivo: `video-processor/auth_local.py`**
- Atualizar `create_user` para salvar todos os campos do perfil
- Verificar `is_approved` no login

### 2. Frontend (React)

**Arquivo: `src/hooks/useAuth.ts`**
- Remover imports do Supabase
- Usar `apiClient` para chamar `/api/auth/*`
- Salvar token JWT no `localStorage`
- Manter mesma interface (signUp, signIn, signOut)

**Arquivo: `src/hooks/useAdminUsers.ts`**
- Remover fallback para Supabase
- Usar apenas endpoints do servidor Python

**Arquivo: `src/pages/Auth.tsx`**
- Manter formulário simplificado
- Chamar `signUp` do hook local

**Arquivo: `src/components/admin/UsersManager.tsx`**
- Adicionar aba "Pendentes" para usuários aguardando aprovação
- Botão "Aprovar" que chama `/api/admin/users/:id/approve`

### 3. Integração Supabase Client

**Arquivo: `src/integrations/supabase/client.ts`**
- Manter como está (para compatibilidade futura se necessário)
- Não será mais usado para autenticação

---

## Fluxo de Cadastro (Novo)

```text
1. Usuário acessa /auth
           ↓
2. Preenche: Nome, Email, Senha, CPF/CNPJ, Endereço
           ↓
3. POST /api/auth/register
           ↓
4. Backend cria: User + Profile + Role (viewer)
   is_approved = false (exceto 1º usuário)
           ↓
5. Tela: "Cadastro realizado! Aguarde aprovação."
           ↓
6. SuperAdmin vê em /admin → Aba "Pendentes"
           ↓
7. SuperAdmin clica "Aprovar"
   POST /api/admin/users/:id/approve
           ↓
8. Usuário tenta login → Acesso liberado
```

## Fluxo de Login (Novo)

```text
1. Usuário acessa /auth → Login
           ↓
2. POST /api/auth/login { email, password }
           ↓
3. Backend verifica:
   - Senha correta? 
   - is_approved = true?
   - is_active = true?
           ↓
4. Retorna: { user, token, role }
           ↓
5. Frontend salva token no localStorage
           ↓
6. Requisições usam: Authorization: Bearer <token>
```

---

## Resumo de Arquivos a Alterar

| Arquivo | Ação |
|---------|------|
| `video-processor/models.py` | Adicionar `is_approved` em User |
| `video-processor/server.py` | Criar 7 endpoints de auth/admin |
| `video-processor/auth_local.py` | Atualizar `create_user` |
| `src/hooks/useAuth.ts` | Migrar de Supabase para API local |
| `src/hooks/useAdminUsers.ts` | Remover Supabase, usar só API |
| `src/pages/Auth.tsx` | Simplificar formulário |
| `src/components/admin/UsersManager.tsx` | Adicionar aba Pendentes |

---

## Resultado Final

Após as alterações:
1. ✅ Sistema 100% local (SQLite + JWT)
2. ✅ Nenhuma dependência do Supabase para autenticação
3. ✅ Cadastro simples: nome, email, CPF/CNPJ, endereço
4. ✅ SuperAdmin aprova novos usuários
5. ✅ Hierarquia de roles mantida (viewer→superadmin)
6. ✅ Token JWT persistido no localStorage

