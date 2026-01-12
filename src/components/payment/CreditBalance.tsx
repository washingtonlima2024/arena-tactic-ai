import { Coins, AlertCircle } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CreditBalanceProps {
  showButton?: boolean;
  variant?: 'default' | 'compact' | 'inline';
  className?: string;
}

export function CreditBalance({ 
  showButton = true, 
  variant = 'default',
  className 
}: CreditBalanceProps) {
  const { balance, monthlyQuota, isLoading, hasCredits } = useUserCredits();
  const navigate = useNavigate();

  if (isLoading) {
    return <Skeleton className="h-8 w-24" />;
  }

  const isLow = balance <= 5 && balance > 0;
  const isEmpty = balance === 0;

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <Coins className="h-4 w-4" />
        <span className={cn(
          'font-medium',
          isEmpty && 'text-destructive',
          isLow && 'text-amber-500'
        )}>
          {balance}
        </span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isEmpty ? 'destructive' : isLow ? 'outline' : 'ghost'}
            size="sm"
            className={cn('gap-1.5', className)}
            onClick={() => navigate('/payment')}
          >
            <Coins className="h-4 w-4" />
            <span className="font-medium">{balance}</span>
            {isEmpty && <AlertCircle className="h-3 w-3" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{balance} créditos disponíveis</p>
          {monthlyQuota > 0 && (
            <p className="text-xs text-muted-foreground">
              Cota mensal: {monthlyQuota}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border p-3',
      isEmpty && 'border-destructive bg-destructive/10',
      isLow && 'border-amber-500 bg-amber-500/10',
      className
    )}>
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        isEmpty ? 'bg-destructive/20' : isLow ? 'bg-amber-500/20' : 'bg-primary/10'
      )}>
        <Coins className={cn(
          'h-5 w-5',
          isEmpty ? 'text-destructive' : isLow ? 'text-amber-500' : 'text-primary'
        )} />
      </div>
      
      <div className="flex-1">
        <div className="flex items-baseline gap-1">
          <span className={cn(
            'text-2xl font-bold',
            isEmpty && 'text-destructive',
            isLow && 'text-amber-500'
          )}>
            {balance}
          </span>
          <span className="text-sm text-muted-foreground">créditos</span>
        </div>
        {monthlyQuota > 0 && (
          <p className="text-xs text-muted-foreground">
            Cota mensal: {monthlyQuota}
          </p>
        )}
      </div>

      {showButton && (
        <Button
          variant={isEmpty ? 'destructive' : 'default'}
          size="sm"
          onClick={() => navigate('/payment')}
        >
          {isEmpty ? 'Comprar' : 'Adicionar'}
        </Button>
      )}
    </div>
  );
}
