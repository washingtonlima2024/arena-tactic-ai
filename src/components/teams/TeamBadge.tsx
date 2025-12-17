import { cn } from '@/lib/utils';

interface TeamBadgeProps {
  team: {
    name: string;
    short_name?: string;
    shortName?: string;
    logo_url?: string;
    logo?: string;
    primary_color?: string;
    primaryColor?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showGlow?: boolean;
}

const sizeClasses = {
  xs: 'h-5 w-5 text-[8px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-14 w-14 text-xl',
};

export function TeamBadge({ team, size = 'md', className, showGlow = false }: TeamBadgeProps) {
  const logoUrl = team.logo_url || team.logo;
  const shortName = team.short_name || team.shortName || team.name.slice(0, 3);
  const primaryColor = team.primary_color || team.primaryColor || '#10b981';
  
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={team.name} 
        className={cn(
          sizeClasses[size], 
          'rounded-full object-contain',
          className
        )}
        style={showGlow ? { boxShadow: `0 0 20px ${primaryColor}40` } : undefined}
      />
    );
  }
  
  return (
    <div 
      className={cn(
        sizeClasses[size],
        'flex items-center justify-center rounded-full font-bold',
        className
      )}
      style={{ 
        backgroundColor: primaryColor + '30', 
        color: primaryColor,
        boxShadow: showGlow ? `0 0 20px ${primaryColor}40` : undefined
      }}
    >
      {shortName.slice(0, 2).toUpperCase()}
    </div>
  );
}
