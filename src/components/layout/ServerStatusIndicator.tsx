import { useState, useEffect } from 'react';
import { Server, Settings, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable, hasServerUrlConfigured } from '@/lib/apiMode';
import { useNavigate } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'not-configured';

export function ServerStatusIndicator({ collapsed }: ServerStatusIndicatorProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      // Primeiro verifica se há URL configurada
      if (!hasServerUrlConfigured()) {
        setStatus('not-configured');
        return;
      }
      
      const available = await checkLocalServerAvailable();
      setStatus(available ? 'online' : 'offline');
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, []);

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
          label: 'Online',
          tooltip: 'Servidor Python online',
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
      case 'not-configured':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-500',
          label: 'Configurar',
          tooltip: 'Clique para configurar a URL do servidor',
          icon: AlertTriangle,
          iconColor: 'text-orange-500',
          animate: true,
          clickable: true
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleClick = () => {
    if (config.clickable) {
      navigate('/settings');
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
