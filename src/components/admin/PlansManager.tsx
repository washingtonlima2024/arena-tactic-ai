import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Package, Plus, Edit, Check, X, Zap, Users, HardDrive, CreditCard } from 'lucide-react';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { toast } from '@/hooks/use-toast';

export default function PlansManager() {
  const { plans, isLoading, createPlan, updatePlan } = useSubscriptionPlans();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    price_monthly: 0,
    price_yearly: 0,
    credits_per_month: 50,
    max_users: 1,
    max_matches_per_month: 1,
    storage_limit_bytes: 5368709120,
    features: '',
    is_active: true,
  });

  const formatBytes = (bytes: number) => {
    if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(0)} TB`;
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(0)} GB`;
    return `${(bytes / 1048576).toFixed(0)} MB`;
  };

  const formatPrice = (cents: number) => {
    return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const parseFeatures = (features: any): string[] => {
    if (Array.isArray(features)) return features;
    if (typeof features === 'string') {
      try {
        const parsed = JSON.parse(features);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const handleEdit = (plan: any) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly || 0,
      credits_per_month: plan.credits_per_month,
      max_users: plan.max_users || 1,
      max_matches_per_month: plan.max_matches_per_month || 0,
      storage_limit_bytes: plan.storage_limit_bytes,
      features: parseFeatures(plan.features).join('\n'),
      is_active: plan.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.slug) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    const features = formData.features.split('\n').filter(f => f.trim());

    try {
      const planData = {
        ...formData,
        features: JSON.stringify(features),
      };

      if (editingPlan) {
        await updatePlan(editingPlan.id, planData);
        toast({ title: 'Plano atualizado com sucesso' });
      } else {
        await createPlan(planData);
        toast({ title: 'Plano criado com sucesso' });
      }
      setIsDialogOpen(false);
      setEditingPlan(null);
      setFormData({
        name: '',
        slug: '',
        price_monthly: 0,
        price_yearly: 0,
        credits_per_month: 50,
        max_users: 1,
        max_matches_per_month: 1,
        storage_limit_bytes: 5368709120,
        features: '',
        is_active: true,
      });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar plano', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Planos de Assinatura
          </h2>
          <p className="text-sm text-muted-foreground">Gerencie os planos disponíveis para os clientes</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingPlan(null);
            setFormData({
              name: '',
              slug: '',
              price_monthly: 0,
              price_yearly: 0,
              credits_per_month: 50,
              max_users: 1,
              max_matches_per_month: 1,
              storage_limit_bytes: 5368709120,
              features: '',
              is_active: true,
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
              <DialogDescription>Configure os detalhes do plano</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug *</Label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    placeholder="pro"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preço Mensal (centavos)</Label>
                  <Input
                    type="number"
                    value={formData.price_monthly}
                    onChange={(e) => setFormData({ ...formData, price_monthly: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">{formatPrice(formData.price_monthly)}</p>
                </div>
                <div className="space-y-2">
                  <Label>Preço Anual (centavos)</Label>
                  <Input
                    type="number"
                    value={formData.price_yearly}
                    onChange={(e) => setFormData({ ...formData, price_yearly: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">{formatPrice(formData.price_yearly)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Créditos/Mês</Label>
                  <Input
                    type="number"
                    value={formData.credits_per_month}
                    onChange={(e) => setFormData({ ...formData, credits_per_month: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máx. Usuários</Label>
                  <Input
                    type="number"
                    value={formData.max_users}
                    onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Máx. Partidas/Mês</Label>
                  <Input
                    type="number"
                    value={formData.max_matches_per_month}
                    onChange={(e) => setFormData({ ...formData, max_matches_per_month: parseInt(e.target.value) || 0 })}
                    placeholder="0 = ilimitado"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Storage (bytes)</Label>
                  <Input
                    type="number"
                    value={formData.storage_limit_bytes}
                    onChange={(e) => setFormData({ ...formData, storage_limit_bytes: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">{formatBytes(formData.storage_limit_bytes)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recursos (um por linha)</Label>
                <Textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="Análise básica&#10;5GB storage&#10;Suporte por email"
                  rows={4}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit}>{editingPlan ? 'Salvar' : 'Criar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const features = parseFeatures(plan.features);
          return (
            <Card key={plan.id} className={`relative ${!plan.is_active ? 'opacity-60' : ''}`}>
              {plan.slug === 'pro' && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  <Zap className="h-3 w-3 mr-1" />
                  Popular
                </Badge>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  {plan.price_monthly === 0 ? (
                    <span className="text-2xl font-bold">Grátis</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">{formatPrice(plan.price_monthly)}</span>
                      <span className="text-muted-foreground">/mês</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span>{plan.credits_per_month.toLocaleString()} créditos/mês</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{plan.max_users} usuário{plan.max_users > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span>{formatBytes(plan.storage_limit_bytes)}</span>
                </div>
                <div className="border-t pt-4 space-y-2">
                  {features.map((feature: string, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {!plan.is_active && (
                  <Badge variant="secondary" className="w-full justify-center">
                    <X className="h-3 w-3 mr-1" />
                    Inativo
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
