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
import { Users, Search, MoreHorizontal, Edit, Shield, Building2, CreditCard, User, Eye, Upload, Pencil, Settings, Globe, AlertCircle, UserPlus, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
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
  viewer: 'Espectador',
  user: 'Usuário',
};

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Espectador', description: 'Apenas visualização' },
  { value: 'uploader', label: 'Operador', description: 'Upload e importação' },
  { value: 'manager', label: 'Gerente', description: 'Edição e gerenciamento' },
  { value: 'org_admin', label: 'Admin Empresa', description: 'Administração da empresa' },
  { value: 'superadmin', label: 'Super Admin', description: 'Acesso total' },
];

export default function UsersManager() {
  const { 
    users, pendingUsers, isLoading, 
    updateUserRole, updateUserOrganization, updateUserProfile, 
    approveUser, rejectUser, isApproving, isRejecting
  } = useAdminUsers();
  const { organizations } = useOrganizations();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      role: user.role || 'viewer',
      organization_id: user.organization_id || '',
      display_name: user.display_name || '',
      phone: user.phone ? formatPhone(user.phone) : '',
      cpf_cnpj: user.cpf_cnpj ? formatCpfCnpj(user.cpf_cnpj) : '',
      credits_balance: user.credits_balance || 0,
    });
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      if (formData.role !== editingUser.role) {
        await updateUserRole(editingUser.user_id, formData.role);
      }
      await updateUserProfile(editingUser.user_id, {
        display_name: formData.display_name,
        phone: formData.phone.replace(/\D/g, ''),
        cpf_cnpj: formData.cpf_cnpj.replace(/\D/g, ''),
        credits_balance: formData.credits_balance,
      });
      toast({ title: 'Usuário atualizado com sucesso' });
      setEditingUser(null);
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar usuário', description: error.message, variant: 'destructive' });
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await approveUser(userId);
      toast({ title: 'Usuário aprovado com sucesso!' });
    } catch (error: any) {
      toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await rejectUser(userId);
      toast({ title: 'Usuário rejeitado' });
    } catch (error: any) {
      toast({ title: 'Erro ao rejeitar', description: error.message, variant: 'destructive' });
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
    return 'secondary';
  };

  return (
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
          {pendingUsers.length > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {pendingUsers.length} aguardando aprovação
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'approved' | 'pending')}>
          <TabsList className="mb-4">
            <TabsTrigger value="approved" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Aprovados ({users.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendentes ({pendingUsers.length})
            </TabsTrigger>
          </TabsList>

          {/* Approved Users */}
          <TabsContent value="approved">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum usuário</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.display_name || <span className="text-muted-foreground">Sem nome</span>}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{user.cpf_cnpj ? formatCpfCnpj(user.cpf_cnpj) : '-'}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role === 'superadmin' && <Shield className="h-3 w-3 mr-1" />}
                            {ROLE_LABELS[user.role] || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Pending Users */}
          <TabsContent value="pending">
            {pendingUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-primary/50" />
                Nenhum usuário aguardando aprovação
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <Card key={user.id} className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="pt-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="font-medium">{user.display_name || 'Sem nome'}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                          {user.cpf_cnpj && <div className="text-sm font-mono">{formatCpfCnpj(user.cpf_cnpj)}</div>}
                          {user.address_city && <div className="text-sm text-muted-foreground">{user.address_city}/{user.address_state}</div>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleReject(user.user_id)} disabled={isRejecting}>
                            <XCircle className="h-4 w-4 mr-1" />
                            Rejeitar
                          </Button>
                          <Button size="sm" onClick={() => handleApprove(user.user_id)} disabled={isApproving}>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formData.display_name || ''} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={formData.cpf_cnpj || ''} onChange={(e) => setFormData({ ...formData, cpf_cnpj: formatCpfCnpj(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
