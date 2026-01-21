import { useState, useEffect, useCallback } from 'react';
import { Server, RefreshCw, WifiOff, Wifi, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  checkLocalServerAvailable, 
  getApiBase, 
  getActiveConnectionMethod,
  autoDiscoverServer,
  resetDiscoveryCache,
  getCloudflareUrl,
  isKakttusProduction
} from '@/lib/apiMode';
import { resetServerAvailability } from '@/lib/apiClient';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'outdated';

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

  const checkStatus = useCallback(async () => {
    const apiBase = getApiBase();

    try {
      const response = await fetch(`${apiBase}/health`, {
        signal: AbortSignal.timeout(5000),
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
    
    // Reset caches
    resetServerAvailability();
    resetDiscoveryCache();
    
    toast.info('Buscando servidor...');
    
    // Tentar auto-descoberta
    const discovered = await autoDiscoverServer();
    
    if (discovered) {
      setStatus('online');
      toast.success(`Servidor conectado: ${discovered.replace('http://', '')}`);
      await checkStatus();
    } else {
      // Tentar Cloudflare se disponível
      const cloudflare = getCloudflareUrl();
      if (cloudflare) {
        try {
          const response = await fetch(`${cloudflare}/health?light=true`, {
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            setStatus('online');
            toast.success('Conectado via Cloudflare Tunnel');
            await checkStatus();
            setIsReconnecting(false);
            return;
          }
        } catch {
          // Continuar para erro
        }
      }
      
      setStatus('offline');
      toast.error('Servidor não encontrado. Verifique se está rodando.');
    }
    
    setIsReconnecting(false);
  }, [checkStatus]);

  useEffect(() => {
    // Iniciar verificação
    checkStatus();
    
    // Verificar periodicamente
    const interval = setInterval(checkStatus, 15000);

    // Ouvir evento de reconexão automática
    const handleServerReconnected = () => {
      console.log('[ServerStatus] Servidor reconectado');
      setStatus('checking');
      checkStatus();
    };
    
    window.addEventListener('server-reconnected', handleServerReconnected);

    return () => {
      clearInterval(interval);
      window.removeEventListener('server-reconnected', handleServerReconnected);
    };
  }, [checkStatus]);

  const getStatusConfig = () => {
    const connection = getActiveConnectionMethod();

    switch (status) {
      case 'checking':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-500',
          label: 'Verificando...',
          tooltip: 'Buscando servidor...',
          icon: RefreshCw,
          iconColor: 'text-muted-foreground',
          animate: true,
          clickable: false
        };
      case 'online':
        const isNginx = connection.method === 'nginx';
        const isCloudflare = connection.method === 'cloudflare';
        const isProduction = connection.method === 'production';
        return {
          color: 'bg-green-500',
          textColor: 'text-green-500',
          label: serverHealth?.version ? `v${serverHealth.version}` : 'Online',
          tooltip: serverHealth?.version 
            ? `Servidor v${serverHealth.version} - ${connection.label}` 
            : `Servidor online - ${connection.label}`,
          icon: isNginx ? Globe : (isCloudflare ? Globe : (isProduction ? Server : Wifi)),
          iconColor: 'text-primary',
          animate: false,
          clickable: false
        };
      case 'offline':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-500',
          label: 'Offline',
          tooltip: 'Servidor não encontrado - clique para buscar',
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
          tooltip: serverHealth?.warning || 'Reinicie o servidor Python',
          icon: RefreshCw,
          iconColor: 'text-orange-500',
          animate: true,
          clickable: true
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const connection = getActiveConnectionMethod();

  const handleClick = () => {
    if (status === 'offline') {
      handleReconnect();
    } else if (status === 'outdated') {
      const missingFns = serverHealth?.critical_functions 
        ? Object.entries(serverHealth.critical_functions)
            .filter(([_, loaded]) => !loaded)
            .map(([name]) => name)
        : [];
      
      toast.error('Servidor Desatualizado', {
        description: `Funções: ${missingFns.join(', ')}. Reinicie o servidor.`,
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
            {connection.method === 'nginx' ? 'Nginx' :
             connection.method === 'cloudflare' ? 'Túnel' : 
             connection.method === 'production' ? 'PM2' : 'Local'}
          </span>
          <span className={cn("text-[10px]", config.textColor)}>
            {isReconnecting ? 'Buscando...' : config.label}
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
          Buscar
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
