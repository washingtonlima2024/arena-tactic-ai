import * as React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DateTimePickerProps {
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
  minDate?: Date;
}

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function DateTimePicker({ 
  date, 
  onDateChange, 
  className, 
  placeholder = 'Selecionar data e hora',
  minDate 
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date);
  const [selectedHour, setSelectedHour] = React.useState(date ? format(date, 'HH') : '12');
  const [selectedMinute, setSelectedMinute] = React.useState(date ? format(date, 'mm') : '00');

  React.useEffect(() => {
    if (date) {
      setSelectedDate(date);
      setSelectedHour(format(date, 'HH'));
      setSelectedMinute(format(date, 'mm'));
    }
  }, [date]);

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      const updatedDate = new Date(newDate);
      updatedDate.setHours(parseInt(selectedHour), parseInt(selectedMinute));
      setSelectedDate(updatedDate);
      onDateChange(updatedDate);
    }
  };

  const handleTimeChange = (hour: string, minute: string) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    if (selectedDate) {
      const updatedDate = new Date(selectedDate);
      updatedDate.setHours(parseInt(hour), parseInt(minute));
      onDateChange(updatedDate);
    }
  };

  const displayValue = date 
    ? format(date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-11',
            !displayValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{displayValue || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* Calendar */}
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            initialFocus
            className="p-3 pointer-events-auto"
            locale={ptBR}
            disabled={(date) => minDate ? date < minDate : false}
          />

          {/* Time Picker */}
          <div className="border-t sm:border-t-0 sm:border-l">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/50 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Horário
            </div>
            <div className="flex">
              {/* Hours */}
              <ScrollArea className="h-[240px] w-14">
                <div className="p-1">
                  {hours.map((hour) => (
                    <Button
                      key={hour}
                      variant={selectedHour === hour ? 'default' : 'ghost'}
                      size="sm"
                      className={cn(
                        'w-full justify-center text-sm mb-0.5',
                        selectedHour === hour && 'bg-primary text-primary-foreground'
                      )}
                      onClick={() => handleTimeChange(hour, selectedMinute)}
                    >
                      {hour}h
                    </Button>
                  ))}
                </div>
              </ScrollArea>

              {/* Minutes */}
              <ScrollArea className="h-[240px] w-14 border-l">
                <div className="p-1">
                  {minutes.map((minute) => (
                    <Button
                      key={minute}
                      variant={selectedMinute === minute ? 'default' : 'ghost'}
                      size="sm"
                      className={cn(
                        'w-full justify-center text-sm mb-0.5',
                        selectedMinute === minute && 'bg-primary text-primary-foreground'
                      )}
                      onClick={() => handleTimeChange(selectedHour, minute)}
                    >
                      {minute}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Footer with quick actions */}
        <div className="border-t p-3 bg-muted/30 flex items-center justify-between gap-2">
          <div className="flex gap-1 flex-wrap">
            {['09:00', '12:00', '18:00', '20:00'].map((time) => (
              <Button
                key={time}
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => {
                  const [h, m] = time.split(':');
                  handleTimeChange(h, m);
                }}
              >
                {time}
              </Button>
            ))}
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-7"
            onClick={() => setOpen(false)}
          >
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
