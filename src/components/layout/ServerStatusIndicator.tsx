import { useState, useEffect, useCallback } from 'react';
import { Server, RefreshCw, WifiOff, AlertTriangle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable, getApiBase, isProductionEnvironment, needsProductionApiUrl } from '@/lib/apiMode';
import { resetServerAvailability } from '@/lib/apiClient';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'outdated' | 'needs-config';

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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const navigate = useNavigate();

  const checkStatus = useCallback(async () => {
    // Primeiro verifica se está em produção sem URL configurada
    if (needsProductionApiUrl()) {
      setStatus('needs-config');
      return;
    }

    const apiBase = getApiBase();
    if (!apiBase) {
      setStatus('needs-config');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/health`);
      
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
    const RETRY_DELAY = 2000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      toast.info(`Tentativa ${attempt}/${MAX_RETRIES}...`);
      
      resetServerAvailability();
      
      try {
        const available = await checkLocalServerAvailable();
        
        if (available) {
          setStatus('online');
          setIsReconnecting(false);
          toast.success('Servidor reconectado!');
          await checkStatus();
          return;
        }
      } catch {
        // Continuar para próxima tentativa
      }
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
    
    setStatus('offline');
    toast.error('Servidor não disponível. Verifique se o Python está rodando em 10.0.0.20:5000');
    setIsReconnecting(false);
  }, [checkStatus]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    // Listen for auto-recovery event from apiClient
    const handleServerReconnected = () => {
      console.log('[ServerStatus] Servidor reconectado automaticamente');
      setStatus('checking');
      checkStatus();
      toast.success('Servidor reconectado automaticamente!');
    };
    
    window.addEventListener('server-reconnected', handleServerReconnected);

    return () => {
      clearInterval(interval);
      window.removeEventListener('server-reconnected', handleServerReconnected);
    };
  }, [checkStatus]);

  const getStatusConfig = () => {
    const isProd = isProductionEnvironment();
    const apiBase = getApiBase();
    const serverLabel = isProd ? 'Produção' : 'Local';
    const serverLocation = apiBase || (isProd ? 'não configurado' : '10.0.0.20:5000');

    switch (status) {
      case 'needs-config':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-500',
          label: 'Configurar',
          tooltip: 'Em produção: configure a URL pública do servidor nas Configurações',
          icon: AlertTriangle,
          iconColor: 'text-orange-500',
          animate: true,
          clickable: true
        };
      case 'checking':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-500',
          label: 'Verificando...',
          tooltip: `Verificando servidor em ${serverLocation}...`,
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
            ? `Servidor Python v${serverHealth.version} (${serverHealth.build_date}) - ${serverLocation}` 
            : `Servidor Python online em ${serverLocation}`,
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
          tooltip: `Servidor Python offline em ${serverLocation} - clique para reconectar`,
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
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleClick = () => {
    if (status === 'needs-config') {
      navigate('/settings');
      toast.info('Configure a URL pública do servidor Python para usar em produção');
    } else if (status === 'offline') {
      handleReconnect();
    } else if (status === 'outdated') {
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
          <span className="font-medium text-foreground">
            {isProductionEnvironment() ? 'Produção' : 'Local'}
          </span>
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
