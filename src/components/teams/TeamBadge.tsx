import { useState } from 'react';
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
  const [imgError, setImgError] = useState(false);
  const logoUrl = team.logo_url || team.logo;
  const shortName = (team.short_name || team.shortName || team.name.slice(0, 3)).toUpperCase();
  const primaryColor = team.primary_color || team.primaryColor || '#10b981';

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    border: `1.5px solid ${primaryColor}50`,
    boxShadow: showGlow ? `0 0 16px ${primaryColor}50` : undefined,
  };

  return (
    <div
      className={cn(
        sizeClasses[size],
        'flex items-center justify-center rounded-full font-bold overflow-hidden shrink-0',
        className
      )}
      style={containerStyle}
    >
      {logoUrl && !imgError ? (
        <img
          src={logoUrl}
          alt={team.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain p-[8%]"
        />
      ) : (
        <span style={{ color: primaryColor }} className="leading-none select-none">
          {shortName.slice(0, 3)}
        </span>
      )}
    </div>
  );
}
