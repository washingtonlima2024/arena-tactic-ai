import { useState, useEffect, useCallback } from 'react';
import { Server, Settings, AlertTriangle, Link2, Copy, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable, hasServerUrlConfigured, getApiBase } from '@/lib/apiMode';
import { resetServerAvailability } from '@/lib/apiClient';
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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const checkStatus = useCallback(async () => {
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
  }, []);

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true);
    setStatus('checking');
    
    // Reset cache do servidor
    resetServerAvailability();
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      toast.info(`Tentativa ${attempt}/${MAX_RETRIES}...`);
      
      // Reset cache antes de cada tentativa
      resetServerAvailability();
      
      try {
        const available = await checkLocalServerAvailable();
        
        if (available) {
          setStatus('online');
          setIsReconnecting(false);
          toast.success('Servidor reconectado!');
          await checkStatus(); // Atualizar detalhes completos
          return;
        }
      } catch {
        // Continuar para próxima tentativa
      }
      
      // Aguardar antes da próxima tentativa (exceto na última)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
    
    // Todas as tentativas falharam
    setStatus('offline');
    setIsReconnecting(false);
    toast.error('Servidor não disponível. Verifique se o Python está rodando.');
  }, [checkStatus]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, [checkStatus]);

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
          tooltip: 'Servidor Python offline - clique para reconectar',
          icon: WifiOff,
          iconColor: 'text-red-500',
          animate: true,
          clickable: true
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
    if (status === 'offline') {
      // Reconectar ao servidor
      handleReconnect();
    } else if (status === 'not-configured') {
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
        config.clickable && "cursor-pointer hover:bg-muted",
        status === 'offline' && "border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
      )}
    >
      <div className="relative">
        {isReconnecting ? (
          <RefreshCw className={cn("h-4 w-4 animate-spin", config.iconColor)} />
        ) : (
          <Icon className={cn("h-4 w-4", config.iconColor)} />
        )}
        <span 
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
            config.color,
            config.animate && "animate-pulse"
          )} 
        />
      </div>
      {!collapsed && (
        <div className="flex flex-col flex-1">
          <span className="font-medium text-foreground">Local</span>
          <span className={cn("text-[10px]", config.textColor)}>
            {isReconnecting ? 'Reconectando...' : config.label}
          </span>
        </div>
      )}
      {!collapsed && status === 'offline' && !isReconnecting && (
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-6 px-2 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/20"
          onClick={(e) => {
            e.stopPropagation();
            handleReconnect();
          }}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reconectar
        </Button>
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
