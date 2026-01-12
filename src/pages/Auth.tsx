import { useState, useEffect, useCallback } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Shield, ArrowLeft, Mail, User, MapPin } from 'lucide-react';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import { 
  validateCpfCnpj, 
  formatCpfCnpj, 
  formatPhone, 
  formatCep, 
  fetchAddressByCep,
  BRAZILIAN_STATES 
} from '@/lib/validators';

// Schema para login simples
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

// Schema completo para cadastro
const signupSchema = z.object({
  displayName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirme a senha'),
  phone: z.string().min(14, 'Telefone inválido'),
  cpfCnpj: z.string().refine(validateCpfCnpj, 'CPF/CNPJ inválido'),
  addressCep: z.string().min(9, 'CEP inválido'),
  addressStreet: z.string().min(3, 'Endereço obrigatório'),
  addressNumber: z.string().min(1, 'Número obrigatório'),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().min(2, 'Bairro obrigatório'),
  addressCity: z.string().min(2, 'Cidade obrigatória'),
  addressState: z.string().length(2, 'Estado obrigatório'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
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

type LoginForm = z.infer<typeof loginSchema>;
type SignupForm = z.infer<typeof signupSchema>;
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
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      cpfCnpj: '',
      addressCep: '',
      addressStreet: '',
      addressNumber: '',
      addressComplement: '',
      addressNeighborhood: '',
      addressCity: '',
      addressState: '',
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

  // Busca endereço quando CEP é preenchido
  const handleCepBlur = useCallback(async () => {
    const cep = signupForm.getValues('addressCep');
    if (cep.replace(/\D/g, '').length === 8) {
      setIsLoadingCep(true);
      const address = await fetchAddressByCep(cep);
      setIsLoadingCep(false);
      
      if (address) {
        signupForm.setValue('addressStreet', address.logradouro);
        signupForm.setValue('addressNeighborhood', address.bairro);
        signupForm.setValue('addressCity', address.localidade);
        signupForm.setValue('addressState', address.uf);
        if (address.complemento) {
          signupForm.setValue('addressComplement', address.complemento);
        }
      }
    }
  }, [signupForm]);

  const handleLogin = async (values: LoginForm) => {
    setIsSubmitting(true);
    try {
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
    } catch {
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (values: SignupForm) => {
    setIsSubmitting(true);
    try {
      const { error } = await signUp(values.email, values.password, values.displayName, {
        phone: values.phone.replace(/\D/g, ''),
        cpf_cnpj: values.cpfCnpj.replace(/\D/g, ''),
        address_cep: values.addressCep.replace(/\D/g, ''),
        address_street: values.addressStreet,
        address_number: values.addressNumber,
        address_complement: values.addressComplement || '',
        address_neighborhood: values.addressNeighborhood,
        address_city: values.addressCity,
        address_state: values.addressState,
      });
      
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
    } catch {
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
    } catch {
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
    } catch {
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
      <Card className="w-full max-w-lg border-primary/20 bg-card/80 backdrop-blur-sm">
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

            {/* Login Form */}
            <TabsContent value="login" className="mt-0">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
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
                    control={loginForm.control}
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
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>

                  <Button 
                    type="button"
                    variant="link" 
                    className="w-full text-muted-foreground"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Esqueci minha senha
                  </Button>
                </form>
              </Form>
            </TabsContent>

            {/* Signup Form */}
            <TabsContent value="signup" className="mt-0">
              <Form {...signupForm}>
                <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                  {/* Info box */}
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                    <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-muted-foreground">
                      O primeiro usuário será <strong className="text-primary">Admin</strong>
                    </span>
                  </div>

                  {/* Dados Pessoais */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <User className="h-4 w-4" />
                      Dados Pessoais
                    </div>
                    
                    <FormField
                      control={signupForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo *</FormLabel>
                          <FormControl>
                            <Input placeholder="Seu nome" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signupForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="seu@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={signupForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="(00) 00000-0000" 
                                {...field}
                                onChange={(e) => field.onChange(formatPhone(e.target.value))}
                                maxLength={15}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signupForm.control}
                        name="cpfCnpj"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CPF/CNPJ *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="000.000.000-00" 
                                {...field}
                                onChange={(e) => field.onChange(formatCpfCnpj(e.target.value))}
                                maxLength={18}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      Endereço
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={signupForm.control}
                        name="addressCep"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CEP *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="00000-000" 
                                {...field}
                                onChange={(e) => field.onChange(formatCep(e.target.value))}
                                onBlur={handleCepBlur}
                                maxLength={9}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signupForm.control}
                        name="addressStreet"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Rua *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={isLoadingCep ? "Buscando..." : "Nome da rua"} 
                                disabled={isLoadingCep}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <FormField
                        control={signupForm.control}
                        name="addressNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número *</FormLabel>
                            <FormControl>
                              <Input placeholder="123" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signupForm.control}
                        name="addressComplement"
                        render={({ field }) => (
                          <FormItem className="col-span-3">
                            <FormLabel>Complemento</FormLabel>
                            <FormControl>
                              <Input placeholder="Apto, Sala, Bloco..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={signupForm.control}
                        name="addressNeighborhood"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bairro *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Bairro" 
                                disabled={isLoadingCep}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signupForm.control}
                        name="addressCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cidade *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Cidade" 
                                disabled={isLoadingCep}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signupForm.control}
                        name="addressState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado *</FormLabel>
                            <Select 
                              value={field.value} 
                              onValueChange={field.onChange}
                              disabled={isLoadingCep}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="UF" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {BRAZILIAN_STATES.map((state) => (
                                  <SelectItem key={state.value} value={state.value}>
                                    {state.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <FormField
                      control={signupForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Senha *</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signupForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirmar *</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar conta
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
