import { TacticalInsight } from '@/types/arena';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Swords, 
  Shield, 
  Zap, 
  Target,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  insight: TacticalInsight;
  onClick?: () => void;
}

const categoryIcons = {
  offensive: Swords,
  defensive: Shield,
  transition: Zap,
  set_piece: Target,
};

const categoryColors = {
  offensive: 'text-green-400 bg-green-400/10',
  defensive: 'text-blue-400 bg-blue-400/10',
  transition: 'text-yellow-400 bg-yellow-400/10',
  set_piece: 'text-purple-400 bg-purple-400/10',
};

const categoryLabels = {
  offensive: 'Ofensivo',
  defensive: 'Defensivo',
  transition: 'Transição',
  set_piece: 'Bola Parada',
};

export function InsightCard({ insight, onClick }: InsightCardProps) {
  const Icon = categoryIcons[insight.category];
  const colorClass = categoryColors[insight.category];

  return (
    <Card 
      variant="glass" 
      className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-arena"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="arena">
            Importância: {insight.importance}/10
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{insight.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {insight.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {insight.dataPoints.map((point, i) => (
            <span 
              key={i}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {point}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 text-sm">
          <Badge variant="outline">
            {categoryLabels[insight.category]}
          </Badge>
          <span className="flex items-center gap-1 text-primary">
            Ver detalhes <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
