import { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkLocalServerAvailable } from '@/lib/apiMode';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ServerStatusIndicatorProps {
  collapsed?: boolean;
}

export function ServerStatusIndicator({ collapsed }: ServerStatusIndicatorProps) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      setChecking(true);
      const available = await checkLocalServerAvailable();
      setIsOnline(available);
      setChecking(false);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const statusColor = checking 
    ? 'bg-yellow-500' 
    : isOnline 
      ? 'bg-green-500' 
      : 'bg-red-500';

  const statusLabel = isOnline ? 'Online' : 'Offline';

  const textColor = isOnline ? 'text-green-500' : 'text-red-500';

  const statusText = checking
    ? 'Verificando servidor local...'
    : isOnline
      ? 'Servidor Python online'
      : 'Servidor Python offline - inicie com: python server.py';

  const content = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
        "bg-muted/50 border border-border/50",
        collapsed ? "justify-center" : ""
      )}
    >
      <div className="relative">
        <Server className={cn("h-4 w-4", isOnline ? "text-primary" : "text-muted-foreground")} />
        <span 
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
            statusColor,
            checking && "animate-pulse"
          )} 
        />
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">Local</span>
          <span className={cn("text-[10px]", textColor)}>{statusLabel}</span>
        </div>
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
          <p>{statusText}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
