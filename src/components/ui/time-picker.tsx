import * as React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TimePickerProps {
  value?: string;
  onChange: (time: string) => void;
  className?: string;
  placeholder?: string;
}

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = ['00', '15', '30', '45'];

export function TimePicker({ value, onChange, className, placeholder = 'Selecionar hora' }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedHour, setSelectedHour] = React.useState(value?.split(':')[0] || '12');
  const [selectedMinute, setSelectedMinute] = React.useState(value?.split(':')[1] || '00');

  React.useEffect(() => {
    if (value) {
      const [h, m] = value.split(':');
      setSelectedHour(h || '12');
      setSelectedMinute(m || '00');
    }
  }, [value]);

  const handleSelect = (hour: string, minute: string) => {
    const time = `${hour}:${minute}`;
    onChange(time);
    setOpen(false);
  };

  const displayValue = value || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !displayValue && 'text-muted-foreground',
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Hours Column */}
          <div className="border-r">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/50">
              Hora
            </div>
            <ScrollArea className="h-[200px]">
              <div className="p-1">
                {hours.map((hour) => (
                  <Button
                    key={hour}
                    variant={selectedHour === hour ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'w-full justify-center text-sm',
                      selectedHour === hour && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => {
                      setSelectedHour(hour);
                      handleSelect(hour, selectedMinute);
                    }}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Minutes Column */}
          <div>
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/50">
              Min
            </div>
            <ScrollArea className="h-[200px]">
              <div className="p-1">
                {minutes.map((minute) => (
                  <Button
                    key={minute}
                    variant={selectedMinute === minute ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'w-full justify-center text-sm',
                      selectedMinute === minute && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => {
                      setSelectedMinute(minute);
                      handleSelect(selectedHour, minute);
                    }}
                  >
                    {minute}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Quick select */}
        <div className="border-t p-2 bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {['09:00', '12:00', '15:00', '18:00', '20:00'].map((time) => (
              <Button
                key={time}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const [h, m] = time.split(':');
                  setSelectedHour(h);
                  setSelectedMinute(m);
                  handleSelect(h, m);
                }}
              >
                {time}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
