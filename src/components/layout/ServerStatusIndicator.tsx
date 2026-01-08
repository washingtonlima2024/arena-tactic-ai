import { useState, useEffect } from 'react';
import { Server, Cloud, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiMode } from '@/lib/apiMode';
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
  const apiMode = getApiMode();

  useEffect(() => {
    const checkStatus = async () => {
      if (apiMode === 'supabase') {
        setIsOnline(true);
        setChecking(false);
        return;
      }

      setChecking(true);
      const available = await checkLocalServerAvailable();
      setIsOnline(available);
      setChecking(false);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [apiMode]);

  const isLocal = apiMode === 'local';
  const Icon = isLocal ? Server : Cloud;
  const StatusIcon = isOnline ? Wifi : WifiOff;

  const statusColor = checking 
    ? 'bg-yellow-500' 
    : isOnline 
      ? 'bg-green-500' 
      : 'bg-red-500';

  const statusText = isLocal
    ? checking
      ? 'Verificando servidor local...'
      : isOnline
        ? 'Servidor Python online'
        : 'Servidor Python offline'
    : 'Supabase Cloud conectado';

  const content = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
        "bg-muted/50 border border-border/50",
        collapsed ? "justify-center" : ""
      )}
    >
      <div className="relative">
        <Icon className={cn("h-4 w-4", isOnline ? "text-primary" : "text-muted-foreground")} />
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
          <span className="font-medium text-foreground">
            {isLocal ? 'Local' : 'Cloud'}
          </span>
          <span className={cn(
            "text-[10px]",
            isOnline ? "text-green-500" : "text-red-500"
          )}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
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
