import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type LucideIcon } from 'lucide-react';

interface TacticalReportSectionProps {
  title: string;
  icon: LucideIcon;
  content: string;
  /** Optional second block (e.g. adversario analysis) */
  secondaryTitle?: string;
  secondaryContent?: string;
  delay?: number;
}

export function TacticalReportSection({
  title,
  icon: Icon,
  content,
  secondaryTitle,
  secondaryContent,
  delay = 0,
}: TacticalReportSectionProps) {
  if (!content && !secondaryContent) return null;

  // Split content into paragraphs for clean rendering
  const paragraphs = content
    ? content.split('\n').filter((p) => p.trim().length > 0)
    : [];

  const secondaryParagraphs = secondaryContent
    ? secondaryContent.split('\n').filter((p) => p.trim().length > 0)
    : [];

  return (
    <Card
      variant="glass"
      className="animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {paragraphs.map((paragraph, i) => (
          <p
            key={i}
            className="text-sm leading-relaxed text-foreground/90"
          >
            {paragraph}
          </p>
        ))}

        {secondaryTitle && secondaryParagraphs.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/50">
            <h4 className="text-base font-semibold mb-3 text-foreground">
              {secondaryTitle}
            </h4>
            {secondaryParagraphs.map((paragraph, i) => (
              <p
                key={`sec-${i}`}
                className="text-sm leading-relaxed text-foreground/90 mb-3"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
