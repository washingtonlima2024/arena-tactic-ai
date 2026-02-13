import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Trophy, Calendar, MapPin } from 'lucide-react';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

interface MatchCenterHeaderProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShort?: string;
  awayTeamShort?: string;
  homeTeamColor: string;
  awayTeamColor: string;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  homeScore: number;
  awayScore: number;
  competition?: string | null;
  matchDate?: string | null;
  venue?: string | null;
  totalEvents: number;
}

function HeaderTeamBadge({ name, short, color, logo }: {
  name: string; short?: string; color: string; logo?: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const normalizedLogo = logo ? normalizeStorageUrl(logo) : null;
  const hasLogo = normalizedLogo && !imgError;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center overflow-hidden border-[3px]",
          "shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all duration-500"
        )}
        style={{
          borderColor: color,
          backgroundColor: hasLogo ? '#000000' : color,
          boxShadow: `0 0 25px ${color}40, inset 0 0 15px ${color}10`,
        }}
      >
        {hasLogo ? (
          <img
            src={normalizedLogo || ''}
            alt={name}
            className="w-16 h-16 md:w-20 md:h-20 object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-3xl font-black text-white">
            {(short || name).slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>
      <span className="font-bold text-sm md:text-base tracking-wide text-foreground">
        {short || name}
      </span>
    </div>
  );
}

export function MatchCenterHeader({
  homeTeamName, awayTeamName, homeTeamShort, awayTeamShort,
  homeTeamColor, awayTeamColor, homeTeamLogo, awayTeamLogo,
  homeScore, awayScore, competition, matchDate, venue, totalEvents
}: MatchCenterHeaderProps) {

  return (
    <header
      className="relative p-6 md:p-8 rounded-2xl border border-primary/20 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${homeTeamColor}12 0%, hsl(var(--card)) 50%, ${awayTeamColor}12 100%)`,
      }}
    >
      {/* Neon line top */}
      <div className="absolute top-0 left-0 right-0 h-1"
        style={{ background: `linear-gradient(90deg, ${homeTeamColor}, transparent 30%, transparent 70%, ${awayTeamColor})` }}
      />

      <div className="flex items-center justify-center gap-6 md:gap-12">
        <HeaderTeamBadge name={homeTeamName} short={homeTeamShort} color={homeTeamColor} logo={homeTeamLogo} />

        {/* Score */}
        <div className="flex items-center gap-3 md:gap-5">
          <span
            className="text-5xl md:text-7xl font-black tracking-tighter"
            style={{ color: homeTeamColor, textShadow: `0 0 30px ${homeTeamColor}50` }}
          >
            {homeScore}
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl md:text-3xl font-light text-muted-foreground">×</span>
            <Badge variant="outline" className="text-[10px] border-primary/30">
              {totalEvents} eventos
            </Badge>
          </div>
          <span
            className="text-5xl md:text-7xl font-black tracking-tighter"
            style={{ color: awayTeamColor, textShadow: `0 0 30px ${awayTeamColor}50` }}
          >
            {awayScore}
          </span>
        </div>

        <HeaderTeamBadge name={awayTeamName} short={awayTeamShort} color={awayTeamColor} logo={awayTeamLogo} />
      </div>

      {/* Match info */}
      <div className="flex flex-wrap justify-center gap-3 mt-5">
        {competition && (
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <Trophy className="h-3 w-3" />
            {competition}
          </Badge>
        )}
        {matchDate && (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Calendar className="h-3 w-3" />
            {new Date(matchDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </Badge>
        )}
        {venue && (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <MapPin className="h-3 w-3" />
            {venue}
          </Badge>
        )}
      </div>
    </header>
  );
}
