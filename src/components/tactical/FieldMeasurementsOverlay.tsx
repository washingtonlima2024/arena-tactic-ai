import { FIFA_FIELD, FIELD_CALCULATIONS } from '@/constants/fieldDimensions';
import { cn } from '@/lib/utils';

interface MeasurementItem {
  label: string;
  value: string;
  description?: string;
}

interface FieldMeasurementsOverlayProps {
  className?: string;
  variant?: 'compact' | 'detailed';
}

const MEASUREMENTS: MeasurementItem[] = [
  { label: 'Campo', value: '105m × 68m', description: 'Dimensões padrão internacional' },
  { label: 'Área Grande', value: '40.32m × 16.5m', description: 'Área penal' },
  { label: 'Área Pequena', value: '18.32m × 5.5m', description: 'Área de meta' },
  { label: 'Círculo Central', value: 'r = 9.15m', description: 'Raio de 10 jardas' },
  { label: 'Pênalti', value: '11m', description: 'Distância da linha de gol' },
  { label: 'Gol', value: '7.32m × 2.44m', description: '8 jardas × 8 pés' },
  { label: 'Escanteio', value: 'r = 1m', description: 'Arco de escanteio' },
  { label: 'Linhas', value: '12cm', description: 'Largura máxima' },
];

export function FieldMeasurementsOverlay({ 
  className, 
  variant = 'detailed' 
}: FieldMeasurementsOverlayProps) {
  if (variant === 'compact') {
    return (
      <div className={cn("grid grid-cols-2 gap-2 text-xs", className)}>
        {MEASUREMENTS.slice(0, 4).map((item) => (
          <div key={item.label} className="bg-muted/50 rounded px-2 py-1">
            <span className="text-muted-foreground">{item.label}:</span>{' '}
            <span className="font-mono font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm font-semibold text-foreground">
        Medidas Oficiais FIFA
      </div>

      <div className="grid gap-3">
        {MEASUREMENTS.map((item) => (
          <div 
            key={item.label}
            className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium text-foreground">{item.label}</div>
              {item.description && (
                <div className="text-xs text-muted-foreground">{item.description}</div>
              )}
            </div>
            <div className="font-mono text-sm font-bold text-primary">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-xs text-muted-foreground mb-2">Zonas Táticas</div>
        <div className="grid grid-cols-3 gap-1 text-center text-xs">
          <div className="bg-blue-500/20 rounded py-1">
            <div className="font-medium">Defesa</div>
            <div className="text-muted-foreground">0-35m</div>
          </div>
          <div className="bg-yellow-500/20 rounded py-1">
            <div className="font-medium">Meio</div>
            <div className="text-muted-foreground">35-70m</div>
          </div>
          <div className="bg-red-500/20 rounded py-1">
            <div className="font-medium">Ataque</div>
            <div className="text-muted-foreground">70-105m</div>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-xs text-muted-foreground mb-2">Referência</div>
        <div className="text-xs text-muted-foreground">
          Baseado nas Leis do Jogo FIFA 2023/24
        </div>
      </div>
    </div>
  );
}

// Visual diagram component showing field zones
export function FieldZonesDiagram({ className }: { className?: string }) {
  const halfLength = FIELD_CALCULATIONS.halfLength;
  const halfWidth = FIELD_CALCULATIONS.halfWidth;

  return (
    <svg
      viewBox={`0 0 ${FIFA_FIELD.length} ${FIFA_FIELD.width}`}
      className={cn("w-full h-auto", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Defensive third */}
      <rect
        x="0"
        y="0"
        width="35"
        height={FIFA_FIELD.width}
        fill="hsl(210 100% 50% / 0.2)"
      />
      
      {/* Middle third */}
      <rect
        x="35"
        y="0"
        width="35"
        height={FIFA_FIELD.width}
        fill="hsl(45 100% 50% / 0.2)"
      />
      
      {/* Attacking third */}
      <rect
        x="70"
        y="0"
        width="35"
        height={FIFA_FIELD.width}
        fill="hsl(0 100% 50% / 0.2)"
      />

      {/* Labels */}
      <text x="17.5" y={halfWidth} textAnchor="middle" fontSize="4" fill="hsl(var(--foreground))">
        Defesa
      </text>
      <text x="52.5" y={halfWidth} textAnchor="middle" fontSize="4" fill="hsl(var(--foreground))">
        Meio
      </text>
      <text x="87.5" y={halfWidth} textAnchor="middle" fontSize="4" fill="hsl(var(--foreground))">
        Ataque
      </text>

      {/* Zone lines */}
      <line x1="35" y1="0" x2="35" y2={FIFA_FIELD.width} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,2" />
      <line x1="70" y1="0" x2="70" y2={FIFA_FIELD.width} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,2" />
    </svg>
  );
}
