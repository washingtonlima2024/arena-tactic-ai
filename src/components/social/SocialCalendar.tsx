import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// X (Twitter) icon component
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// TikTok icon component  
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
);

interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  scheduled_at: string;
  status: string;
}

const PLATFORMS: Record<string, { icon: any; color: string }> = {
  instagram: { icon: Instagram, color: 'text-pink-500' },
  facebook: { icon: Facebook, color: 'text-blue-600' },
  x: { icon: XIcon, color: 'text-foreground' },
  linkedin: { icon: Linkedin, color: 'text-blue-700' },
  youtube: { icon: Youtube, color: 'text-red-600' },
  tiktok: { icon: TikTokIcon, color: 'text-foreground' },
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500',
  publishing: 'bg-yellow-500',
  published: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
};

export function SocialCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchPosts();
  }, [currentMonth]);

  const fetchPosts = async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    try {
      const { data, error } = await supabase
        .from('social_scheduled_posts')
        .select('id, platform, content, scheduled_at, status')
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
        .order('scheduled_at');

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const postsByDate = useMemo(() => {
    return posts.reduce((acc, post) => {
      const dateKey = format(new Date(post.scheduled_at), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(post);
      return acc;
    }, {} as Record<string, ScheduledPost[]>);
  }, [posts]);

  const selectedDatePosts = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return postsByDate[dateKey] || [];
  }, [selectedDate, postsByDate]);

  // Get day of week for first day to add padding
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          Calendário de Publicações
        </h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[150px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-4">
            {/* Week days header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the first of the month */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {days.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayPosts = postsByDate[dateKey] || [];
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "aspect-square p-1 rounded-lg border transition-all relative",
                      "hover:border-primary hover:bg-primary/5",
                      isToday(day) && "border-primary bg-primary/10",
                      isSelected && "border-primary ring-2 ring-primary/20",
                      !isSameMonth(day, currentMonth) && "opacity-50"
                    )}
                  >
                    <div className="text-xs font-medium mb-1">
                      {format(day, 'd')}
                    </div>
                    
                    {/* Platform indicators */}
                    {dayPosts.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {dayPosts.slice(0, 3).map((post, idx) => {
                          const platform = PLATFORMS[post.platform];
                          const Icon = platform?.icon || CalendarIcon;
                          return (
                            <div 
                              key={idx}
                              className={cn(
                                "w-3 h-3 rounded-full flex items-center justify-center",
                                STATUS_COLORS[post.status] || 'bg-gray-500'
                              )}
                            >
                              <Icon className="h-2 w-2 text-white" />
                            </div>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{dayPosts.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1">
                  <div className={cn("w-2 h-2 rounded-full", color)} />
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Selected date details */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-4">
              {selectedDate 
                ? format(selectedDate, "d 'de' MMMM", { locale: ptBR })
                : 'Selecione uma data'
              }
            </h3>

            {selectedDate && selectedDatePosts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum post agendado para esta data
              </p>
            )}

            <div className="space-y-3">
              {selectedDatePosts.map(post => {
                const platform = PLATFORMS[post.platform];
                const Icon = platform?.icon || CalendarIcon;

                return (
                  <div 
                    key={post.id}
                    className="p-3 rounded-lg border bg-muted/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", platform?.color)} />
                        <span className="text-xs font-medium capitalize">
                          {post.platform}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(post.scheduled_at), 'HH:mm')}
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{post.content}</p>
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs", STATUS_COLORS[post.status]?.replace('bg-', 'text-'))}
                    >
                      {post.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
