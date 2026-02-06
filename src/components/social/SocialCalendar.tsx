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
import { apiClient } from '@/lib/apiClient';
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
    try {
      // Fetch all posts and filter client-side by month
      const data = await apiClient.get<ScheduledPost[]>('/api/social/scheduled-posts');
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      
      const filtered = (data || []).filter(p => {
        const d = new Date(p.scheduled_at);
        return d >= start && d <= end;
      });
      
      setPosts(filtered);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const allDays = eachDayOfInterval({ start, end });

    // Pad start to Monday
    const startDay = start.getDay();
    const padStart = startDay === 0 ? 6 : startDay - 1;
    const paddedDays: (Date | null)[] = Array(padStart).fill(null);
    
    return [...paddedDays, ...allDays];
  }, [currentMonth]);

  const getPostsForDay = (date: Date) => {
    return posts.filter(p => isSameDay(new Date(p.scheduled_at), date));
  };

  const selectedDayPosts = selectedDate ? getPostsForDay(selectedDate) : [];

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          Calendário de Publicações
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[150px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (!day) {
                return <div key={`empty-${i}`} className="h-20" />;
              }

              const dayPosts = getPostsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "h-20 p-1 rounded-lg border text-left transition-all hover:bg-muted/50",
                    !isCurrentMonth && "opacity-30",
                    isToday(day) && "border-primary/50 bg-primary/5",
                    isSelected && "border-primary bg-primary/10 ring-1 ring-primary",
                    !isSelected && "border-transparent"
                  )}
                >
                  <div className={cn(
                    "text-xs font-medium mb-1",
                    isToday(day) && "text-primary"
                  )}>
                    {format(day, 'd')}
                  </div>
                  
                  {dayPosts.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {dayPosts.slice(0, 3).map(post => {
                        const statusColor = STATUS_COLORS[post.status] || 'bg-gray-400';
                        return (
                          <div
                            key={post.id}
                            className={cn("h-1.5 w-1.5 rounded-full", statusColor)}
                            title={`${post.platform} - ${post.status}`}
                          />
                        );
                      })}
                      {dayPosts.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{dayPosts.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Details */}
      {selectedDate && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              <span className="text-muted-foreground ml-2 text-sm">
                ({selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? 's' : ''})
              </span>
            </h3>

            {selectedDayPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum post agendado para este dia.</p>
            ) : (
              <div className="space-y-2">
                {selectedDayPosts.map(post => {
                  const platform = PLATFORMS[post.platform];
                  const PlatformIcon = platform?.icon || CalendarIcon;
                  const statusColor = STATUS_COLORS[post.status] || 'bg-gray-400';

                  return (
                    <div key={post.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <PlatformIcon className={cn("h-4 w-4", platform?.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{post.content}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(post.scheduled_at), 'HH:mm')}
                        </span>
                        <div className={cn("h-2 w-2 rounded-full", statusColor)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
