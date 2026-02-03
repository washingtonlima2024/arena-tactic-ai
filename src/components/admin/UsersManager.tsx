import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Search, MoreHorizontal, Edit, Shield, Building2, Phone, MapPin, CreditCard, User, Check, Eye, Upload, Pencil, Settings, Globe, AlertCircle } from 'lucide-react';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useOrganizations } from '@/hooks/useOrganizations';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCpfCnpj, formatPhone, formatCep, BRAZILIAN_STATES } from '@/lib/validators';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  org_admin: 'Admin Empresa',
  admin: 'Admin',
  manager: 'Gerente',
  uploader: 'Operador',
  viewer: 'Visualizador',
  user: 'Usuário',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  viewer: 'Acesso somente leitura. Pode visualizar partidas, estatísticas e times.',
  uploader: 'Operador do sistema. Pode importar jogos, fazer upload de vídeos e iniciar análises.',
  manager: 'Gerente com permissões de edição. Pode editar partidas, gerenciar times e ver relatórios.',
  org_admin: 'Administrador da empresa. Gerencia usuários, créditos e configurações da organização.',
  superadmin: 'Acesso total ao sistema. Controle de todas as empresas e configurações globais.',
};

const ROLE_PERMISSIONS: Record<string, { icon: React.ElementType; label: string }[]> = {
  viewer: [
    { icon: Eye, label: 'Ver partidas e estatísticas' },
    { icon: Eye, label: 'Ver times e jogadores' },
    { icon: Eye, label: 'Ver eventos e análises' },
  ],
  uploader: [
    { icon: Eye, label: 'Todas as permissões de Visualizador' },
    { icon: Upload, label: 'Importar jogos' },
    { icon: Upload, label: 'Fazer upload de vídeos' },
    { icon: Upload, label: 'Iniciar análises de IA' },
  ],
  manager: [
    { icon: Eye, label: 'Todas as permissões de Operador' },
    { icon: Pencil, label: 'Editar partidas e eventos' },
    { icon: Pencil, label: 'Gerenciar times e jogadores' },
    { icon: Eye, label: 'Ver relatórios avançados' },
  ],
  org_admin: [
    { icon: Eye, label: 'Todas as permissões de Gerente' },
    { icon: Users, label: 'Gerenciar usuários da empresa' },
    { icon: CreditCard, label: 'Ver e gerenciar créditos' },
    { icon: Settings, label: 'Configurações da empresa' },
  ],
  superadmin: [
    { icon: Globe, label: 'Acesso total ao sistema' },
    { icon: Building2, label: 'Gerenciar todas as empresas' },
    { icon: Users, label: 'Gerenciar todos os usuários' },
    { icon: Settings, label: 'Configurações globais' },
  ],
};

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Visualizador', description: 'Apenas visualização' },
  { value: 'uploader', label: 'Operador', description: 'Upload e importação' },
  { value: 'manager', label: 'Gerente', description: 'Edição e gerenciamento' },
  { value: 'org_admin', label: 'Admin Empresa', description: 'Administração da empresa' },
  { value: 'superadmin', label: 'Super Admin', description: 'Acesso total' },
];

interface UserFormData {
  role: string;
  organization_id: string;
  display_name: string;
  phone: string;
  cpf_cnpj: string;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  credits_balance: number;
}

export default function UsersManager() {
  const { users, isLoading, updateUserRole, updateUserOrganization, updateUserProfile } = useAdminUsers();
  const { organizations } = useOrganizations();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState<UserFormData>({
    role: '',
    organization_id: '',
    display_name: '',
    phone: '',
    cpf_cnpj: '',
    address_cep: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    credits_balance: 0,
  });

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.cpf_cnpj?.includes(searchTerm.replace(/\D/g, ''))
  );

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      role: user.role || 'viewer',
      organization_id: user.organization_id || '',
      display_name: user.display_name || '',
      phone: user.phone ? formatPhone(user.phone) : '',
      cpf_cnpj: user.cpf_cnpj ? formatCpfCnpj(user.cpf_cnpj) : '',
      address_cep: user.address_cep ? formatCep(user.address_cep) : '',
      address_street: user.address_street || '',
      address_number: user.address_number || '',
      address_complement: user.address_complement || '',
      address_neighborhood: user.address_neighborhood || '',
      address_city: user.address_city || '',
      address_state: user.address_state || '',
      credits_balance: user.credits_balance || 0,
    });
  };

  const handleSave = async () => {
    if (!editingUser) return;

    try {
      // Update role if changed
      if (formData.role !== editingUser.role) {
        await updateUserRole(editingUser.user_id, formData.role);
      }
      
      // Update organization if changed
      if (formData.organization_id !== editingUser.organization_id) {
        await updateUserOrganization(editingUser.user_id, formData.organization_id || null);
      }

      // Update profile data
      await updateUserProfile(editingUser.user_id, {
        display_name: formData.display_name,
        phone: formData.phone.replace(/\D/g, ''),
        cpf_cnpj: formData.cpf_cnpj.replace(/\D/g, ''),
        address_cep: formData.address_cep.replace(/\D/g, ''),
        address_street: formData.address_street,
        address_number: formData.address_number,
        address_complement: formData.address_complement,
        address_neighborhood: formData.address_neighborhood,
        address_city: formData.address_city,
        address_state: formData.address_state,
        credits_balance: formData.credits_balance,
        organization_id: formData.organization_id || null,
      });

      toast({ title: 'Usuário atualizado com sucesso' });
      setEditingUser(null);
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar usuário', description: error.message, variant: 'destructive' });
    }
  };

  const getOrgName = (orgId: string | null) => {
    if (!orgId) return 'Sem empresa';
    const org = organizations.find(o => o.id === orgId);
    return org?.name || 'Desconhecida';
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === 'superadmin') return 'destructive';
    if (role === 'org_admin' || role === 'admin') return 'default';
    if (role === 'manager') return 'secondary';
    return 'outline';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuários
              </CardTitle>
              <CardDescription>Gerencie os usuários e suas permissões</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou CPF/CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead>Créditos</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {user.display_name || (
                              <span className="text-amber-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Cadastro pendente
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {user.cpf_cnpj ? formatCpfCnpj(user.cpf_cnpj) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {user.phone ? formatPhone(user.phone) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {user.address_city && user.address_state 
                            ? `${user.address_city}/${user.address_state}` 
                            : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          <CreditCard className="h-3 w-3 mr-1" />
                          {user.credits_balance || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{getOrgName(user.organization_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role === 'superadmin' && <Shield className="h-3 w-3 mr-1" />}
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(user)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              {editingUser?.display_name || editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="personal" className="text-xs sm:text-sm">
                <User className="h-4 w-4 mr-1 hidden sm:inline" />
                Pessoal
              </TabsTrigger>
              <TabsTrigger value="address" className="text-xs sm:text-sm">
                <MapPin className="h-4 w-4 mr-1 hidden sm:inline" />
                Endereço
              </TabsTrigger>
              <TabsTrigger value="permissions" className="text-xs sm:text-sm">
                <Shield className="h-4 w-4 mr-1 hidden sm:inline" />
                Permissões
              </TabsTrigger>
              <TabsTrigger value="credits" className="text-xs sm:text-sm">
                <CreditCard className="h-4 w-4 mr-1 hidden sm:inline" />
                Créditos
              </TabsTrigger>
            </TabsList>

            {/* Dados Pessoais */}
            <TabsContent value="personal" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input 
                    value={formData.display_name} 
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    value={editingUser?.email || ''} 
                    disabled 
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input 
                    value={formData.cpf_cnpj} 
                    onChange={(e) => setFormData({ ...formData, cpf_cnpj: formatCpfCnpj(e.target.value) })}
                    placeholder="000.000.000-00"
                    maxLength={18}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Endereço */}
            <TabsContent value="address" className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input 
                    value={formData.address_cep} 
                    onChange={(e) => setFormData({ ...formData, address_cep: formatCep(e.target.value) })}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Rua</Label>
                  <Input 
                    value={formData.address_street} 
                    onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                    placeholder="Nome da rua"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input 
                    value={formData.address_number} 
                    onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                    placeholder="123"
                  />
                </div>
                <div className="space-y-2 col-span-3">
                  <Label>Complemento</Label>
                  <Input 
                    value={formData.address_complement} 
                    onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                    placeholder="Apto, Sala, Bloco..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input 
                    value={formData.address_neighborhood} 
                    onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input 
                    value={formData.address_city} 
                    onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select 
                    value={formData.address_state} 
                    onValueChange={(value) => setFormData({ ...formData, address_state: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label} ({state.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Permissões */}
            <TabsContent value="permissions" className="space-y-4 py-4">
              <div className="space-y-3">
                <Label>Papel no Sistema</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Descrição do papel */}
                {formData.role && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    {ROLE_DESCRIPTIONS[formData.role]}
                  </p>
                )}
              </div>

              {/* Checklist de permissões */}
              {formData.role && ROLE_PERMISSIONS[formData.role] && (
                <div className="space-y-2">
                  <Label>Permissões do Papel</Label>
                  <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                    {ROLE_PERMISSIONS[formData.role].map((perm, idx) => {
                      const IconComponent = perm.icon;
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </div>
                          <IconComponent className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{perm.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Label>Empresa</Label>
                <Select 
                  value={formData.organization_id || 'none'} 
                  onValueChange={(value) => setFormData({ ...formData, organization_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem empresa</SelectItem>
                    {organizations.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Vincule o usuário a uma empresa para controle de acesso por organização.
                </p>
              </div>
            </TabsContent>

            {/* Créditos */}
            <TabsContent value="credits" className="space-y-4 py-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Saldo Atual</p>
                    <p className="text-3xl font-bold text-primary">{formData.credits_balance}</p>
                    <p className="text-xs text-muted-foreground">créditos disponíveis</p>
                  </div>
                  <CreditCard className="h-12 w-12 text-muted-foreground/30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ajustar Saldo</Label>
                <Input 
                  type="number"
                  value={formData.credits_balance} 
                  onChange={(e) => setFormData({ ...formData, credits_balance: parseInt(e.target.value) || 0 })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Defina o novo saldo de créditos do usuário. Cada análise de partida consome 1 crédito.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
