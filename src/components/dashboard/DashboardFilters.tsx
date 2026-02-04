import { useEffect, useState } from 'react';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, X, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface DashboardFiltersProps {
  selectedCreative: string | null;
  onCreativeChange: (id: string | null) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  campaigns?: { id: string; name: string; effective_status?: string }[];
  campaignsLoading?: boolean;
  selectedCampaignId?: string | null;
  onCampaignChange?: (id: string | null) => void;
}

const presets = [
  { label: 'Últimos 7 dias', value: 'last_7_days', days: 7 },
  { label: 'Últimos 14 dias', value: 'last_14_days', days: 14 },
  { label: 'Últimos 28 dias', value: 'last_28_days', days: 28 },
  { label: 'Esta semana', value: 'this_week', days: 0 },
  { label: 'Personalizado', value: 'custom', days: 0 },
];

export function DashboardFilters({
  selectedCreative,
  onCreativeChange,
  dateRange,
  onDateRangeChange,
  campaigns = [],
  campaignsLoading = false,
  selectedCampaignId = null,
  onCampaignChange,
}: DashboardFiltersProps) {
  const [preset, setPreset] = useState('last_7_days');
  const [viewMode, setViewMode] = useState('week');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [internalDateRange, setInternalDateRange] = useState<DateRange | undefined>(dateRange);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);

  useEffect(() => {
    setInternalDateRange(dateRange);
  }, [dateRange]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const selectedPreset = presets.find(p => p.value === value);

    let newRange: DateRange | undefined;

    if (value === 'this_week') {
      newRange = {
        from: startOfWeek(new Date(), { weekStartsOn: 0 }),
        to: endOfWeek(new Date(), { weekStartsOn: 0 }),
      };
    } else if (selectedPreset && selectedPreset.days > 0) {
      newRange = {
        from: subDays(new Date(), selectedPreset.days),
        to: new Date(),
      };
    } else if (value === 'custom') {
      setIsCalendarOpen(true);
      return;
    }

    if (newRange) {
      onDateRangeChange(newRange);
      setInternalDateRange(newRange);
    }
  };

  const formatDateRange = () => {
    if (!dateRange?.from) return 'Selecione um período';
    if (!dateRange.to) return format(dateRange.from, "d 'de' MMM", { locale: ptBR });
    return `${format(dateRange.from, "d 'de' MMM", { locale: ptBR })} - ${format(dateRange.to, "d 'de' MMM", { locale: ptBR })}`;
  };

  const selectedCampaignLabel =
    selectedCampaignId
      ? campaigns.find((c) => c.id === selectedCampaignId)?.name || 'Campanha selecionada'
      : campaignsLoading
        ? 'Carregando campanhas...'
        : 'Todas as campanhas';

  return (
    <div className="sticky top-[7.5rem] z-30 -mx-4 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex flex-wrap items-center gap-3">
        {/* Date Range */}
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start gap-2 text-left font-normal",
                !dateRange && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {formatDateRange()}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              <div className="border-r p-2">
                <div className="space-y-1">
                  {presets.map((p) => (
                    <Button
                      key={p.value}
                      variant={preset === p.value ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        handlePresetChange(p.value);
                        if (p.value !== 'custom') setIsCalendarOpen(false);
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  onDateRangeChange(range);
                  setInternalDateRange(range);
                  setPreset('custom');
                }}
                numberOfMonths={2}
                locale={ptBR}
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* View Mode */}
        <Select value={viewMode} onValueChange={setViewMode}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Visão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Diária</SelectItem>
            <SelectItem value="week">Semanal</SelectItem>
            <SelectItem value="month">Mensal</SelectItem>
          </SelectContent>
        </Select>

        {/* Active Filters */}
        {onCampaignChange && (
          <Popover open={isCampaignOpen} onOpenChange={setIsCampaignOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-between w-[320px]"
                disabled={campaignsLoading}
              >
                <span className="truncate">{selectedCampaignLabel}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar campanha..." />
                <CommandList>
                  <CommandEmpty>Nenhuma campanha encontrada.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      onSelect={() => {
                        onCampaignChange(null);
                        setIsCampaignOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !selectedCampaignId ? "opacity-100" : "opacity-0")} />
                      Todas as campanhas
                    </CommandItem>
                    {campaigns.slice(0, 1000).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        onSelect={() => {
                          onCampaignChange(c.id);
                          setIsCampaignOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedCampaignId === c.id ? "opacity-100" : "opacity-0")} />
                        <span className="truncate flex-1">{c.name}</span>
                        {String(c.effective_status || '').toUpperCase() !== 'ACTIVE' && (
                          <span className="ml-2 text-xs text-muted-foreground">Inativa</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {selectedCreative && (
          <Badge variant="secondary" className="gap-1 pl-2">
            Criativo selecionado
            <button
              onClick={() => onCreativeChange(null)}
              className="ml-1 rounded-full p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handlePresetChange('last_7_days');
              onCreativeChange(null);
              onCampaignChange?.(null);
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}
