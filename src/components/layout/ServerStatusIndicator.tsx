import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { 
  getApiBase, 
  getActiveConnectionMethod,
  autoDiscoverServer,
  resetDiscoveryCache,
  getCloudflareUrl,
  isLovableEnvironment
} from '@/lib/apiMode';
import { resetServerAvailability } from '@/lib/apiClient';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
    
    // Comparação explícita: string vazia = produção Kakttus (usa /api/health)
    // String com valor = IP local descoberto (usa ${apiBase}/health)
    const healthUrl = apiBase === '' 
      ? '/api/health' 
      : `${apiBase}/health`;

    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
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
          // Cloudflare tunnel expõe /health diretamente (sem /api prefix)
          const healthUrl = `${cloudflare}/health?light=true`;
          const response = await fetch(healthUrl, {
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
          tooltip: 'Buscando servidor...',
          animate: true,
          clickable: false
        };
      case 'online':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-500',
          tooltip: serverHealth?.version 
            ? `Servidor v${serverHealth.version} - ${connection.label}` 
            : `Servidor online - ${connection.label}`,
          animate: false,
          clickable: false
        };
      case 'offline':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-500',
          tooltip: isLovableEnvironment() 
            ? 'Configure o Cloudflare Tunnel em Settings → Servidor Local'
            : 'Servidor não encontrado - clique para buscar',
          animate: true,
          clickable: true
        };
      case 'outdated':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-500',
          tooltip: serverHealth?.warning || 'Reinicie o servidor Python',
          animate: true,
          clickable: true
        };
    }
  };

  const config = getStatusConfig();

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

  const getStatusLabel = () => {
    if (isReconnecting || status === 'checking') return 'Buscando...';
    if (status === 'online') return 'Conectado';
    if (status === 'offline') return 'Offline';
    if (status === 'outdated') return 'Desatualizado';
    return 'Desconhecido';
  };

  const content = (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-xs transition-all rounded",
        config.clickable && "cursor-pointer hover:bg-muted/50"
      )}
    >
      <span 
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.animate && "animate-pulse"
        )} 
      />
      {!collapsed && (
        <span className={cn("font-medium", config.textColor)}>
          {getStatusLabel()}
        </span>
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
