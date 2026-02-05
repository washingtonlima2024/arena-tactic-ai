import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  BarChart3, 
  Zap, 
  Video, 
  Brain, 
  Play, 
  Eye, 
  Lock,
  Mail,
  Loader2,
  ChevronRight,
  Sparkles,
  Server,
  Check,
  AlertCircle,
  Settings2
} from 'lucide-react';
import logoKakttus from '@/assets/logo-kakttus.png';
import soccerBall from '@/assets/soccer-ball.png';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import heroBg from '@/assets/hero-bg.jpg';
import { useAuth } from '@/hooks/useAuth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Animated counter component
function AnimatedCounter({ 
  value, 
  suffix = '', 
  duration = 2000 
}: { 
  value: number; 
  suffix?: string; 
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeOutQuart * value));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <>{count.toLocaleString()}{suffix}</>;
}

// Floating particle component
function FloatingParticle({ delay, size, left, duration }: { 
  delay: number; 
  size: number; 
  left: string;
  duration: number;
}) {
  return (
    <div 
      className="absolute rounded-full bg-primary/40 blur-sm"
      style={{
        width: size,
        height: size,
        left,
        bottom: '-20px',
        animation: `float-particle ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  // Server connection state
  const [serverUrl, setServerUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [serverStatus, setServerStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [showServerConfig, setShowServerConfig] = useState(false);

  // Load saved server URL on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('arena_api_base');
    if (savedUrl) {
      setServerUrl(savedUrl);
      // Auto-check connection
      checkServerConnection(savedUrl);
    }
  }, []);

  const checkServerConnection = async (url: string) => {
    if (!url.trim()) {
      setServerStatus('disconnected');
      return;
    }

    setIsConnecting(true);
    const cleanUrl = url.trim().replace(/\/+$/, '');
    
    try {
      // Try /api/health first, then /health
      const endpoints = [`${cleanUrl}/api/health`, `${cleanUrl}/health`];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          });
          
          if (response.ok) {
            setServerStatus('connected');
            localStorage.setItem('arena_api_base', cleanUrl);
            // Dispatch event for other components
            window.dispatchEvent(new CustomEvent('server-reconnected'));
            toast.success('Servidor conectado!', {
              description: 'Agora você pode fazer login.'
            });
            setIsConnecting(false);
            return;
          }
        } catch {
          // Try next endpoint
        }
      }
      
      setServerStatus('error');
      toast.error('Não foi possível conectar ao servidor');
    } catch (error) {
      setServerStatus('error');
      toast.error('Erro ao conectar', {
        description: 'Verifique a URL e tente novamente.'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectServer = () => {
    checkServerConnection(serverUrl);
  };

  // Redirecionar se já estiver logado
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Trigger stats animation after a short delay
    const timer = setTimeout(() => setShowStats(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Tentar fazer login usando o hook unificado
      const { error } = await signIn(email, password);

      if (error) {
        // Se credenciais inválidas, tentar criar conta
        if (error.message.includes('Invalid login credentials')) {
          const { data: signUpData, error: signUpError } = await signUp(email, password, email.split('@')[0]);

          // Se usuário já existe, enviar reset de senha
          if (signUpError?.message?.includes('User already registered')) {
            toast.info('Usuário existe', {
              description: 'Enviando email para resetar senha...',
            });
            
            const { error: resetError } = await resetPassword(email);
            
            if (resetError) {
              toast.error('Erro ao resetar senha', {
                description: 'Tente usar a página de cadastro para criar uma nova conta.',
              });
            } else {
              toast.success('Email de reset enviado!', {
                description: 'Verifique seu email para redefinir sua senha.',
              });
            }
            return;
          }

          if (signUpError) {
            toast.error('Erro ao criar conta', {
              description: signUpError.message,
            });
            return;
          }

          // Se criou com sucesso, o onAuthStateChange vai detectar e o useEffect vai redirecionar
          if (signUpData?.user) {
            toast.success('Conta criada com sucesso!', {
              description: 'Bem-vindo ao Arena Play!',
            });
            // O redirecionamento é feito pelo useEffect acima quando o user muda
          }
        } else {
          toast.error('Erro ao fazer login', {
            description: error.message,
          });
        }
        return;
      }

      // Login bem sucedido - o useEffect vai redirecionar
      toast.success('Bem-vindo ao Arena Play!', {
        description: 'Redirecionando para o dashboard...',
      });
    } catch (err) {
      toast.error('Erro inesperado', {
        description: 'Tente novamente em alguns instantes.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stats = [
    { value: 500, label: 'Partidas Analisadas', suffix: '+', icon: Video },
    { value: 10000, label: 'Eventos Detectados', suffix: '+', icon: Zap },
    { value: 98, label: 'Precisão da IA', suffix: '%', icon: Brain },
    { value: 24, label: 'Disponibilidade', suffix: '/7', icon: Eye },
  ];

  const features = [
    {
      icon: BarChart3,
      title: 'Análise Tática em Tempo Real',
      description: 'Visualize mapas de calor, formações e movimentações instantaneamente.',
    },
    {
      icon: Zap,
      title: 'Detecção Automática de Eventos',
      description: 'IA identifica gols, assistências, faltas e jogadas importantes.',
    },
    {
      icon: Video,
      title: 'Geração de Clips com IA',
      description: 'Crie highlights e compilações automaticamente com narrativa.',
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${heroBg})`,
          filter: 'brightness(0.3)',
        }}
      />
      
      {/* Tactical Grid Overlay */}
      <div className="absolute inset-0 tactical-grid opacity-20" />
      
      {/* Animated Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
      
      {/* Spotlight Effect - smaller on mobile */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] md:w-[1200px] h-[300px] md:h-[600px] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
          animation: 'pulse-glow 4s ease-in-out infinite',
        }}
      />

      {/* Floating Particles - fewer on mobile */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none hidden md:block">
        <FloatingParticle delay={0} size={8} left="10%" duration={6} />
        <FloatingParticle delay={1} size={6} left="25%" duration={8} />
        <FloatingParticle delay={2} size={10} left="40%" duration={7} />
        <FloatingParticle delay={0.5} size={5} left="55%" duration={9} />
        <FloatingParticle delay={1.5} size={8} left="70%" duration={6} />
        <FloatingParticle delay={2.5} size={6} left="85%" duration={8} />
        <FloatingParticle delay={3} size={7} left="95%" duration={7} />
      </div>
      
      {/* Header - responsive */}
      <header className="relative z-10 flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border/20 backdrop-blur-sm bg-background/10 safe-area-top">
        <div className="flex items-center gap-2 md:gap-3">
          <img 
            src={logoKakttus} 
            alt="Kakttus Solutions" 
            className="h-8 w-8 md:h-10 md:w-10 object-contain animate-fade-in"
          />
          <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h1 className="font-semibold text-foreground text-sm md:text-base">Kakttus Solutions</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Tecnologia com Inteligência</p>
          </div>
        </div>
      </header>

      {/* Main Content - responsive */}
      <main className="relative z-10 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-24 px-4 md:px-6 py-8 md:py-12 min-h-[calc(100vh-80px)]">
        
        {/* Left Side - Branding & Info */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left max-w-xl w-full">
          
          {/* Logo Section - responsive */}
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 animate-fade-up">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full animate-pulse-glow" />
              <img 
                src={arenaIcon} 
                alt="Arena Play" 
                className="h-14 w-14 md:h-20 lg:h-24 md:w-20 lg:w-24 object-contain relative z-10"
              />
            </div>
            <img 
              src={arenaWordmark} 
              alt="Arena Play" 
              className="h-10 md:h-14 lg:h-16 object-contain"
            />
          </div>

          {/* Animated Soccer Ball - smaller on mobile */}
          <div className="relative w-full flex justify-center lg:justify-start mb-6 md:mb-8">
            <div className="relative">
              {/* Glow effect behind ball */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 md:w-40 h-28 md:h-40 bg-primary/20 blur-3xl rounded-full animate-pulse-glow"
              />
              
              {/* Soccer Ball */}
              <div className="relative animate-float">
                <img 
                  src={soccerBall} 
                  alt="Soccer Ball" 
                  className="w-24 h-24 md:w-32 lg:w-40 md:h-32 lg:h-40 object-contain drop-shadow-2xl"
                  style={{
                    filter: 'drop-shadow(0 0 30px hsl(var(--primary) / 0.5))',
                    animation: 'ball-spin 8s linear infinite',
                  }}
                />
              </div>
              
              {/* Shadow */}
              <div 
                className="absolute bottom-0 left-1/2 w-20 md:w-24 h-2 md:h-3 bg-black/30 blur-md rounded-full"
                style={{ animation: 'ball-shadow 3s ease-in-out infinite' }}
              />
            </div>
          </div>

          {/* Headline - responsive typography */}
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-display font-bold mb-3 md:mb-4 animate-fade-up"
            style={{ animationDelay: '0.2s' }}
          >
            <span className="bg-gradient-to-r from-primary via-arena-teal to-primary bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer">
              Análise Tática
            </span>
            <br />
            <span className="text-foreground">Inteligente</span>
          </h2>

          <p 
            className="text-base md:text-lg text-muted-foreground mb-6 md:mb-8 max-w-md animate-fade-up px-2 md:px-0"
            style={{ animationDelay: '0.3s' }}
          >
            Revolucione seu futebol com Inteligência Artificial. 
            Análise em tempo real, detecção de eventos e geração automática de highlights.
          </p>

          {/* Stats Grid - always 2 columns */}
          <div 
            className="grid grid-cols-2 gap-2 md:gap-4 w-full animate-fade-up"
            style={{ animationDelay: '0.4s' }}
          >
            {stats.map((stat, index) => (
              <div 
                key={stat.label}
                className="glass rounded-lg md:rounded-xl p-3 md:p-4 text-center border border-primary/20 hover:border-primary/40 transition-all duration-300 active:scale-95 md:hover:scale-105 group touch-manipulation"
              >
                <stat.icon className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1.5 md:mb-2 text-primary group-hover:scale-110 transition-transform" />
                <div className="text-xl md:text-2xl lg:text-3xl font-bold text-primary">
                  {showStats ? (
                    <AnimatedCounter 
                      value={stat.value} 
                      suffix={stat.suffix}
                      duration={2000 + index * 200}
                    />
                  ) : '0'}
                </div>
                <div className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 leading-tight">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div 
          className="w-full max-w-md animate-fade-up px-2 md:px-0"
          style={{ animationDelay: '0.5s' }}
        >
          {/* Login Card - Glassmorphism - responsive padding */}
          <div className="backdrop-blur-xl bg-card/30 border border-primary/20 rounded-xl md:rounded-2xl p-5 md:p-8 shadow-glow relative overflow-hidden">
            {/* Card glow effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 md:w-64 h-24 md:h-32 bg-primary/20 blur-3xl rounded-full" />
            
            <div className="relative z-10">
              {/* Header - responsive */}
              <div className="text-center mb-6 md:mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/20 mb-3 md:mb-4 animate-pulse-glow">
                  <Play className="w-6 h-6 md:w-8 md:h-8 text-primary" />
                </div>
                <h3 className="text-xl md:text-2xl font-display font-bold text-foreground mb-1 md:mb-2">
                  Acesse o Sistema
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Entre com suas credenciais para começar
                </p>
              </div>

              {/* Form - touch-friendly inputs */}
              <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
                <div className="space-y-1.5 md:space-y-2">
                  <Label htmlFor="email" className="text-foreground flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-primary" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="bg-background/50 border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 h-11 md:h-10 text-base"
                    required
                  />
                </div>

                <div className="space-y-1.5 md:space-y-2">
                  <Label htmlFor="password" className="text-foreground flex items-center gap-2 text-sm">
                    <Lock className="w-4 h-4 text-primary" />
                    Senha
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-background/50 border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 h-11 md:h-10 text-base"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 md:h-12 text-base md:text-lg font-semibold bg-gradient-to-r from-primary to-arena-teal hover:from-primary/90 hover:to-arena-teal/90 text-primary-foreground shadow-glow group touch-manipulation"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Entrar
                      <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-4 md:my-6">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {/* Register Link */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 md:h-11 border-primary/30 hover:bg-primary/10 hover:border-primary/50 touch-manipulation"
                onClick={() => navigate('/auth')}
              >
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                Criar Nova Conta
              </Button>

              {/* Server Connection - Collapsible */}
              <Collapsible open={showServerConfig} onOpenChange={setShowServerConfig} className="mt-4">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground gap-2"
                  >
                    <Settings2 className="w-3 h-3" />
                    Configurar Servidor
                    {serverStatus === 'connected' && (
                      <span className="ml-auto flex items-center gap-1 text-green-500">
                        <Check className="w-3 h-3" />
                        Conectado
                      </span>
                    )}
                    {serverStatus === 'error' && (
                      <span className="ml-auto flex items-center gap-1 text-destructive">
                        <AlertCircle className="w-3 h-3" />
                        Erro
                      </span>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="serverUrl" className="text-xs text-muted-foreground flex items-center gap-2">
                        <Server className="w-3 h-3" />
                        URL do Servidor (Cloudflare Tunnel)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="serverUrl"
                          type="url"
                          value={serverUrl}
                          onChange={(e) => setServerUrl(e.target.value)}
                          placeholder="https://seu-tunel.trycloudflare.com"
                          className="flex-1 h-9 text-sm bg-background/50 border-border/50"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleConnectServer}
                          disabled={isConnecting || !serverUrl.trim()}
                          className="h-9 px-3"
                        >
                          {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Conectar'
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      Cole a URL do túnel Cloudflare do seu servidor local para habilitar o backend.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="relative z-10 px-6 py-16 border-t border-border/20">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-2xl md:text-3xl font-display font-bold text-center mb-12">
            <span className="bg-gradient-to-r from-primary to-arena-teal bg-clip-text text-transparent">
              Recursos Principais
            </span>
          </h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={feature.title}
                className="glass rounded-xl p-6 border border-primary/20 hover:border-primary/40 transition-all duration-300 hover:scale-105 hover:shadow-glow group animate-fade-up"
                style={{ animationDelay: `${0.6 + index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h4>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-border/20 backdrop-blur-sm bg-background/30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoKakttus} alt="Kakttus" className="h-8 w-8 object-contain" />
            <span className="text-sm text-muted-foreground">
              © 2025 Kakttus Solutions. Todos os direitos reservados.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <img src={arenaIcon} alt="Arena Play" className="h-6 w-6 object-contain" />
            <span className="text-sm font-medium text-foreground">Arena Play</span>
            <span className="text-xs text-muted-foreground ml-2">v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
