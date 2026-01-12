import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, Plus, Search, ArrowUp, ArrowDown, Gift, ShoppingCart, Zap, RefreshCcw } from 'lucide-react';
import { useCreditTransactions } from '@/hooks/useCreditTransactions';
import { useOrganizations } from '@/hooks/useOrganizations';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CreditsManager() {
  const { transactions, isLoading, addCredits } = useCreditTransactions();
  const { organizations } = useOrganizations();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    organization_id: '',
    amount: 0,
    transaction_type: 'bonus',
    description: '',
  });

  const filteredTransactions = transactions.filter(tx => {
    const org = organizations.find(o => o.id === tx.organization_id);
    return org?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleSubmit = async () => {
    if (!formData.organization_id || formData.amount <= 0) {
      toast({ title: 'Preencha todos os campos corretamente', variant: 'destructive' });
      return;
    }

    try {
      await addCredits({
        organization_id: formData.organization_id,
        amount: formData.amount,
        transaction_type: formData.transaction_type,
        description: formData.description || `Créditos adicionados manualmente`,
      });
      toast({ title: 'Créditos adicionados com sucesso' });
      setIsDialogOpen(false);
      setFormData({ organization_id: '', amount: 0, transaction_type: 'bonus', description: '' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar créditos', description: error.message, variant: 'destructive' });
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'subscription':
        return <RefreshCcw className="h-4 w-4" />;
      case 'purchase':
        return <ShoppingCart className="h-4 w-4" />;
      case 'usage':
        return <Zap className="h-4 w-4" />;
      case 'bonus':
        return <Gift className="h-4 w-4" />;
      case 'refund':
        return <ArrowDown className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'subscription':
        return 'Assinatura';
      case 'purchase':
        return 'Compra';
      case 'usage':
        return 'Uso';
      case 'bonus':
        return 'Bônus';
      case 'refund':
        return 'Reembolso';
      default:
        return type;
    }
  };

  const getOrgName = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    return org?.name || 'Desconhecida';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Gerenciamento de Créditos
            </CardTitle>
            <CardDescription>Visualize transações e adicione créditos manualmente</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Créditos
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Créditos</DialogTitle>
                <DialogDescription>Adicione créditos a uma empresa manualmente</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Empresa *</Label>
                  <Select value={formData.organization_id} onValueChange={(value) => setFormData({ ...formData, organization_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map(org => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} ({org.credits_balance} créditos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.transaction_type} onValueChange={(value) => setFormData({ ...formData, transaction_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bonus">Bônus</SelectItem>
                      <SelectItem value="purchase">Compra</SelectItem>
                      <SelectItem value="subscription">Assinatura</SelectItem>
                      <SelectItem value="refund">Reembolso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Motivo da adição de créditos..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar transações..."
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
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'Nenhuma transação encontrada' : 'Nenhuma transação registrada'}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Saldo Após</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">{getOrgName(tx.organization_id)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        {getTransactionIcon(tx.transaction_type)}
                        {getTransactionLabel(tx.transaction_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 ${tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {tx.amount >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        {Math.abs(tx.amount).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>{tx.balance_after.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{tx.description || '-'}</TableCell>
                    <TableCell>
                      {tx.created_at ? format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
