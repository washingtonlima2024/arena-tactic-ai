import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, CreditCard, Mail, Shield, ExternalLink } from 'lucide-react';

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      {/* Stripe */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pagamentos (Stripe)
              </CardTitle>
              <CardDescription>Configure a integração com Stripe para pagamentos</CardDescription>
            </div>
            <Badge variant="secondary">Não configurado</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Conecte sua conta Stripe para processar pagamentos de assinaturas e créditos adicionais.
          </p>
          <Button>
            <ExternalLink className="h-4 w-4 mr-2" />
            Configurar Stripe
          </Button>
        </CardContent>
      </Card>

      {/* Autenticação */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Autenticação
              </CardTitle>
              <CardDescription>Configure opções de login e segurança</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Email/Senha</p>
                <p className="text-sm text-muted-foreground">Autenticação padrão por email</p>
              </div>
            </div>
            <Badge variant="default">Ativo</Badge>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium">Google OAuth</p>
                <p className="text-sm text-muted-foreground">Login com conta Google</p>
              </div>
            </div>
            <Badge variant="secondary">Disponível</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Configurações de Email
          </CardTitle>
          <CardDescription>Configure emails transacionais e notificações</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Os emails são enviados automaticamente pelo sistema de backend para:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>Confirmação de cadastro</li>
            <li>Recuperação de senha</li>
            <li>Convites para organização</li>
            <li>Notificações de pagamento</li>
          </ul>
        </CardContent>
      </Card>

      {/* Sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sistema
          </CardTitle>
          <CardDescription>Informações e configurações gerais do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Versão</p>
              <p className="font-medium">Arena Play v1.0.0</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Ambiente</p>
              <p className="font-medium">Produção</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Backend</p>
              <p className="font-medium">Lovable Cloud</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Storage</p>
              <p className="font-medium">Supabase Storage</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
