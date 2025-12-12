import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Shield, ArrowLeft, Mail } from 'lucide-react';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';

const authSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  displayName: z.string().optional(),
});

const resetEmailSchema = z.object({
  email: z.string().email('Email inválido'),
});

const newPasswordSchema = z.object({
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type AuthForm = z.infer<typeof authSchema>;
type ResetEmailForm = z.infer<typeof resetEmailSchema>;
type NewPasswordForm = z.infer<typeof newPasswordSchema>;

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get('reset') === 'true';
  
  const { user, isLoading, signUp, signIn, resetPassword, updatePassword } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
    },
  });

  const resetEmailForm = useForm<ResetEmailForm>({
    resolver: zodResolver(resetEmailSchema),
    defaultValues: { email: '' },
  });

  const newPasswordForm = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!isLoading && user && !isResetMode) {
      navigate('/');
    }
  }, [user, isLoading, navigate, isResetMode]);

  const handleSubmit = async (values: AuthForm) => {
    setIsSubmitting(true);
    try {
      if (activeTab === 'signup') {
        const { error } = await signUp(values.email, values.password, values.displayName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email já está cadastrado. Faça login.');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Conta criada com sucesso! Você já está logado.');
        navigate('/');
      } else {
        const { error } = await signIn(values.email, values.password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            toast.error('Email ou senha incorretos.');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Login realizado com sucesso!');
        navigate('/');
      }
    } catch (err) {
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetEmail = async (values: ResetEmailForm) => {
    setIsSubmitting(true);
    try {
      const { error } = await resetPassword(values.email);
      if (error) {
        toast.error(error.message);
        return;
      }
      setResetEmailSent(true);
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err) {
      toast.error('Erro ao enviar email. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewPassword = async (values: NewPasswordForm) => {
    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(values.password);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Senha atualizada com sucesso!');
      navigate('/');
    } catch (err) {
      toast.error('Erro ao atualizar senha. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Reset password mode - user clicked on email link
  if (isResetMode && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex flex-col items-center gap-2">
              <img src={arenaIcon} alt="Arena Play" className="h-14 w-14 object-contain" />
              <img src={arenaWordmark} alt="Arena Play" className="h-8 object-contain" />
            </div>
            <CardTitle>Definir Nova Senha</CardTitle>
            <CardDescription>
              Digite sua nova senha abaixo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...newPasswordForm}>
              <form onSubmit={newPasswordForm.handleSubmit(handleNewPassword)} className="space-y-4">
                <FormField
                  control={newPasswordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newPasswordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Atualizar Senha
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forgot password form
  if (showForgotPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex flex-col items-center gap-2">
              <img src={arenaIcon} alt="Arena Play" className="h-14 w-14 object-contain" />
              <img src={arenaWordmark} alt="Arena Play" className="h-8 object-contain" />
            </div>
            <CardTitle>Recuperar Senha</CardTitle>
            <CardDescription>
              {resetEmailSent 
                ? 'Verifique sua caixa de entrada'
                : 'Digite seu email para receber um link de recuperação'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetEmailSent ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Enviamos um link de recuperação para <strong>{resetEmailForm.getValues('email')}</strong>. 
                  Clique no link para definir uma nova senha.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmailSent(false);
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <Form {...resetEmailForm}>
                <form onSubmit={resetEmailForm.handleSubmit(handleResetEmail)} className="space-y-4">
                  <FormField
                    control={resetEmailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar link de recuperação
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex flex-col items-center gap-2">
            <img src={arenaIcon} alt="Arena Play" className="h-14 w-14 object-contain" />
            <img src={arenaWordmark} alt="Arena Play" className="h-8 object-contain" />
          </div>
          <CardDescription>
            Plataforma de análise tática de futebol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'signup')}>
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <TabsContent value="signup" className="mt-0 space-y-4">
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">
                      O primeiro usuário a se cadastrar será <strong className="text-primary">Admin</strong>
                    </span>
                  </div>
                </TabsContent>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="seu@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {activeTab === 'login' ? 'Entrar' : 'Criar conta'}
                </Button>

                {activeTab === 'login' && (
                  <Button 
                    type="button"
                    variant="link" 
                    className="w-full text-muted-foreground"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Esqueci minha senha
                  </Button>
                )}
              </form>
            </Form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
