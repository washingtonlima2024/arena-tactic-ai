import { useState, useEffect } from 'react';
import { Server, Settings, AlertTriangle, Link2, Copy, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable, hasServerUrlConfigured, getApiBase } from '@/lib/apiMode';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'not-configured' | 'outdated';

interface ServerHealth {
  version?: string;
  build_date?: string;
  functions_loaded?: boolean;
  warning?: string;
  critical_functions?: Record<string, boolean>;
}

export function ServerStatusIndicator({ collapsed }: ServerStatusIndicatorProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
  const [showQuickConfig, setShowQuickConfig] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkStatus = async () => {
      // Primeiro verifica se há URL configurada
      if (!hasServerUrlConfigured()) {
        setStatus('not-configured');
        return;
      }
      
      try {
        const response = await fetch(`${getApiBase()}/health`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        
        if (response.ok) {
          const data = await response.json();
          setServerHealth(data);
          
          // Verificar se funções críticas estão carregadas
          if (data.functions_loaded === false) {
            setStatus('outdated');
          } else {
            setStatus('online');
          }
        } else {
          setStatus('offline');
        }
      } catch {
        setStatus('offline');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleQuickConnect = () => {
    const url = tunnelUrl.trim();
    if (!url) {
      toast.error('Cole a URL do túnel Cloudflare');
      return;
    }
    
    // Salvar no localStorage
    localStorage.setItem('cloudflare_tunnel_url', url);
    toast.success('Túnel configurado! Reconectando...');
    setShowQuickConfig(false);
    setTunnelUrl('');
    
    // Forçar recheck
    window.location.reload();
  };

  const copyUrlExample = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const example = `${baseUrl}?tunnel=https://SEU-TUNEL.trycloudflare.com`;
    navigator.clipboard.writeText(example);
    toast.success('Exemplo copiado! Cole no terminal e substitua a URL.');
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'checking':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-500',
          label: 'Verificando...',
          tooltip: 'Verificando servidor local...',
          icon: Server,
          iconColor: 'text-muted-foreground',
          animate: true,
          clickable: false
        };
      case 'online':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-500',
          label: serverHealth?.version ? `v${serverHealth.version}` : 'Online',
          tooltip: serverHealth?.version 
            ? `Servidor Python v${serverHealth.version} (${serverHealth.build_date})` 
            : 'Servidor Python online',
          icon: Server,
          iconColor: 'text-primary',
          animate: false,
          clickable: false
        };
      case 'offline':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-500',
          label: 'Offline',
          tooltip: 'Servidor Python offline - inicie com: python server.py',
          icon: Server,
          iconColor: 'text-muted-foreground',
          animate: false,
          clickable: false
        };
      case 'outdated':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-500',
          label: 'Desatualizado',
          tooltip: serverHealth?.warning || 'Servidor precisa ser reiniciado para carregar novas funções',
          icon: RefreshCw,
          iconColor: 'text-orange-500',
          animate: true,
          clickable: true
        };
      case 'not-configured':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-500',
          label: 'Configurar',
          tooltip: 'Túnel não configurado. Clique para configurar.',
          icon: AlertTriangle,
          iconColor: 'text-orange-500',
          animate: true,
          clickable: true
        };
    }
  };

  // Quick config panel for not-configured state
  if (showQuickConfig && !collapsed) {
    return (
      <div className="flex flex-col gap-2 rounded-lg px-3 py-3 bg-orange-500/10 border border-orange-500/30">
        <div className="flex items-center gap-2 text-xs font-medium text-orange-500">
          <Link2 className="h-4 w-4" />
          Configurar Túnel
        </div>
        <Input
          value={tunnelUrl}
          onChange={(e) => setTunnelUrl(e.target.value)}
          placeholder="https://xxx.trycloudflare.com"
          className="h-8 text-xs"
        />
        <div className="flex gap-1">
          <Button size="sm" className="h-7 text-xs flex-1" onClick={handleQuickConnect}>
            Conectar
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs px-2"
            onClick={() => setShowQuickConfig(false)}
          >
            ✕
          </Button>
        </div>
        <button 
          onClick={copyUrlExample}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="h-3 w-3" />
          Copiar exemplo de URL com ?tunnel=
        </button>
      </div>
    );
  }

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleClick = () => {
    if (status === 'not-configured') {
      // Se collapsed, ir para settings. Se expandido, mostrar quick config
      if (collapsed) {
        navigate('/settings');
      } else {
        setShowQuickConfig(true);
      }
    } else if (status === 'outdated') {
      // Mostrar toast com instruções para reiniciar
      const missingFns = serverHealth?.critical_functions 
        ? Object.entries(serverHealth.critical_functions)
            .filter(([_, loaded]) => !loaded)
            .map(([name]) => name)
        : [];
      
      toast.error('Servidor Desatualizado', {
        description: `Funções não carregadas: ${missingFns.join(', ')}. Reinicie o servidor Python (Ctrl+C e python server.py).`,
        duration: 10000,
      });
    }
  };

  const content = (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
        "bg-muted/50 border border-border/50",
        collapsed ? "justify-center" : "",
        config.clickable && "cursor-pointer hover:bg-muted hover:border-orange-500/50"
      )}
    >
      <div className="relative">
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <span 
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
            config.color,
            config.animate && "animate-pulse"
          )} 
        />
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">Local</span>
          <span className={cn("text-[10px]", config.textColor)}>{config.label}</span>
        </div>
      )}
      {!collapsed && status === 'not-configured' && (
        <Settings className="h-3 w-3 text-orange-500 ml-auto" />
      )}
    </div>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
