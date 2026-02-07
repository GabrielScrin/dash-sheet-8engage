import { useEffect, useMemo, useState } from 'react';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, X, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

interface DashboardFiltersProps {
  selectedCreative: string | null;
  onCreativeChange: (id: string | null) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  campaigns?: { id: string; name: string; effective_status?: string }[];
  campaignsLoading?: boolean;
  selectedCampaignIds?: string[];
  onCampaignChange?: (ids: string[]) => void;
  viewMode?: 'day' | 'week' | 'month';
  onViewModeChange?: (value: 'day' | 'week' | 'month') => void;
}

const presets = [
  { label: 'Ultimos 7 dias', value: 'last_7_days', days: 7 },
  { label: 'Ultimos 14 dias', value: 'last_14_days', days: 14 },
  { label: 'Ultimos 28 dias', value: 'last_28_days', days: 28 },
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
  selectedCampaignIds = [],
  onCampaignChange,
  viewMode = 'week',
  onViewModeChange,
}: DashboardFiltersProps) {
  const [preset, setPreset] = useState('last_7_days');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [internalDateRange, setInternalDateRange] = useState<DateRange | undefined>(dateRange);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [localSelectedCampaignIds, setLocalSelectedCampaignIds] = useState<string[]>(selectedCampaignIds);
  const [campaignSearch, setCampaignSearch] = useState('');

  const selectedCampaigns = useMemo(() => {
    if (localSelectedCampaignIds.length === 0) return [];
    const selectedSet = new Set(localSelectedCampaignIds);
    return campaigns.filter((campaign) => selectedSet.has(campaign.id));
  }, [campaigns, localSelectedCampaignIds]);

  const filteredCampaigns = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase();
    if (!term) return campaigns;
    return campaigns.filter((campaign) => String(campaign?.name || '').toLowerCase().includes(term));
  }, [campaignSearch, campaigns]);

  const toggleCampaign = (campaignId: string) => {
    setLocalSelectedCampaignIds((prev) => {
      const isSelected = prev.includes(campaignId);
      const next = isSelected ? prev.filter((id) => id !== campaignId) : [...prev, campaignId];
      onCampaignChange?.(next);
      return next;
    });
  };

  useEffect(() => {
    setInternalDateRange(dateRange);
  }, [dateRange]);

  useEffect(() => {
    setLocalSelectedCampaignIds(selectedCampaignIds);
  }, [selectedCampaignIds]);

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
    if (!dateRange?.from) return 'Selecione um periodo';
    if (!dateRange.to) return format(dateRange.from, "d 'de' MMM", { locale: ptBR });
    return `${format(dateRange.from, "d 'de' MMM", { locale: ptBR })} - ${format(dateRange.to, "d 'de' MMM", { locale: ptBR })}`;
  };

  const selectedCampaignLabel = campaignsLoading
    ? 'Carregando campanhas...'
    : localSelectedCampaignIds.length === 0
      ? 'Todas as campanhas'
      : localSelectedCampaignIds.length === 1
        ? campaigns.find((c) => c.id === localSelectedCampaignIds[0])?.name || '1 campanha selecionada'
        : `${localSelectedCampaignIds.length} campanhas selecionadas`;

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
        <Select
          value={viewMode}
          onValueChange={(v) => onViewModeChange?.(v as 'day' | 'week' | 'month')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Visao" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Diaria</SelectItem>
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
            <PopoverContent className="w-[360px] p-2" align="start">
              <div className="space-y-2">
                <Input
                  value={campaignSearch}
                  onChange={(event) => setCampaignSearch(event.target.value)}
                  placeholder="Buscar campanha..."
                  className="h-9"
                />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setLocalSelectedCampaignIds([]);
                    onCampaignChange([]);
                    setIsCampaignOpen(false);
                  }}
                >
                  <Check className={cn('h-4 w-4', localSelectedCampaignIds.length === 0 ? 'opacity-100' : 'opacity-0')} />
                  <span>Todas as campanhas</span>
                </button>
                <div className="max-h-[280px] overflow-y-auto rounded-md border">
                  {filteredCampaigns.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">Nenhuma campanha encontrada.</div>
                  )}
                  {filteredCampaigns.slice(0, 2000).map((campaign) => {
                    const checked = localSelectedCampaignIds.includes(campaign.id);
                    const isActive = String(campaign.effective_status || '').toUpperCase() === 'ACTIVE';

                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => toggleCampaign(campaign.id)}
                      >
                        <Checkbox checked={checked} />
                        <span className="flex-1 truncate">{campaign.name}</span>
                        {!isActive && <span className="text-xs text-muted-foreground">Inativa</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {onCampaignChange && selectedCampaigns.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2">
            {selectedCampaigns.slice(0, 6).map((campaign) => (
              <Badge key={campaign.id} variant="secondary" className="gap-1 pl-2">
                <span className="max-w-[220px] truncate">{campaign.name}</span>
                <button
                  onClick={() => {
                    const next = localSelectedCampaignIds.filter((id) => id !== campaign.id);
                    setLocalSelectedCampaignIds(next);
                    onCampaignChange(next);
                  }}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remover campanha ${campaign.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedCampaigns.length > 6 && (
              <Badge variant="outline">+{selectedCampaigns.length - 6}</Badge>
            )}
          </div>
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
              setLocalSelectedCampaignIds([]);
              onCampaignChange?.([]);
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}

