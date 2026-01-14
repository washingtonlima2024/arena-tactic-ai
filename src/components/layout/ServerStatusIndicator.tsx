import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable, hasServerUrlConfigured, getApiBase } from '@/lib/apiMode';
import { resetServerAvailability } from '@/lib/apiClient';
import { useNavigate } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'not-configured';

export function ServerStatusIndicator({ collapsed }: ServerStatusIndicatorProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const navigate = useNavigate();

  const checkStatus = useCallback(async () => {
    if (!hasServerUrlConfigured()) {
      setStatus('not-configured');
      return;
    }
    
    try {
      const response = await fetch(`${getApiBase()}/health`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        setStatus('online');
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
          return;
        }
      } catch {
        // Continue to next attempt
      }
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
    
    setStatus('offline');
    setIsReconnecting(false);
    toast.error('Servidor não disponível. Configure em Configurações.');
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleClick = () => {
    if (status === 'not-configured') {
      navigate('/settings');
    } else if (status === 'offline') {
      handleReconnect();
    }
  };

  const getConfig = () => {
    if (isReconnecting) {
      return {
        color: 'bg-yellow-500',
        label: 'Reconectando...',
        tooltip: 'Tentando reconectar ao servidor...',
        clickable: false
      };
    }
    
    switch (status) {
      case 'checking':
        return {
          color: 'bg-yellow-500 animate-pulse',
          label: 'Verificando...',
          tooltip: 'Verificando servidor...',
          clickable: false
        };
      case 'online':
        return {
          color: 'bg-green-500',
          label: 'Conectado',
          tooltip: 'Servidor Python conectado',
          clickable: false
        };
      case 'offline':
        return {
          color: 'bg-red-500 animate-pulse',
          label: 'Reconectar',
          tooltip: 'Clique para reconectar',
          clickable: true
        };
      case 'not-configured':
        return {
          color: 'bg-orange-500 animate-pulse',
          label: 'Configurar',
          tooltip: 'Clique para configurar em Configurações',
          clickable: true
        };
    }
  };

  const config = getConfig();

  const content = (
    <button
      onClick={handleClick}
      disabled={!config.clickable && !isReconnecting}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all",
        collapsed ? "justify-center" : "",
        config.clickable && "cursor-pointer hover:bg-muted/50",
        !config.clickable && "cursor-default"
      )}
    >
      {isReconnecting ? (
        <RefreshCw className="h-3 w-3 animate-spin text-yellow-500" />
      ) : (
        <span className={cn("h-2 w-2 rounded-full shrink-0", config.color)} />
      )}
      {!collapsed && (
        <span className={cn(
          "font-medium",
          status === 'online' && "text-green-500",
          status === 'offline' && "text-red-500",
          status === 'not-configured' && "text-orange-500",
          (status === 'checking' || isReconnecting) && "text-yellow-500"
        )}>
          {config.label}
        </span>
      )}
    </button>
  );

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
