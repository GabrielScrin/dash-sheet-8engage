import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WeeklyData {
  week: string;
  periodKey?: string;
  periodSort?: number;
  sales: number;
  investment: number;
  revenue: number;
  roas: number;
  conversion: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  leads?: number;
  messages?: number;
  purchases?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  frequency?: number;
  landing_views?: number;
  checkout_views?: number;
  video_views?: number;
}

interface WeeklyComparisonTableProps {
  data: WeeklyData[];
  isMeta?: boolean;
  viewMode?: 'day' | 'week' | 'month';
  onViewModeChange?: (value: 'day' | 'week' | 'month') => void;
}

type SortDirection = 'asc' | 'desc';
type SortTarget =
  | { type: 'period' }
  | { type: 'metric'; index: number };

type MetricKey =
  | 'sales'
  | 'investment'
  | 'revenue'
  | 'roas'
  | 'conversion'
  | 'impressions'
  | 'reach'
  | 'clicks'
  | 'leads'
  | 'messages'
  | 'purchases'
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'frequency'
  | 'landing_views'
  | 'checkout_views'
  | 'video_views';

const metricOptions: Array<{ key: MetricKey; label: string; format: 'number' | 'currency' | 'percentage' | 'decimal' }> = [
  { key: 'sales', label: 'Vendas', format: 'number' },
  { key: 'investment', label: 'Investimento', format: 'currency' },
  { key: 'revenue', label: 'Faturamento', format: 'currency' },
  { key: 'roas', label: 'ROAS', format: 'decimal' },
  { key: 'conversion', label: 'Taxa Conv.', format: 'percentage' },
  { key: 'impressions', label: 'Impressões', format: 'number' },
  { key: 'reach', label: 'Alcance', format: 'number' },
  { key: 'clicks', label: 'Cliques', format: 'number' },
  { key: 'leads', label: 'Leads', format: 'number' },
  { key: 'messages', label: 'Mensagens', format: 'number' },
  { key: 'purchases', label: 'Compras', format: 'number' },
  { key: 'ctr', label: 'CTR', format: 'percentage' },
  { key: 'cpc', label: 'CPC', format: 'currency' },
  { key: 'cpm', label: 'CPM', format: 'currency' },
  { key: 'frequency', label: 'Frequência', format: 'decimal' },
  { key: 'landing_views', label: 'LP Views', format: 'number' },
  { key: 'checkout_views', label: 'Checkout', format: 'number' },
  { key: 'video_views', label: 'Views Vídeo', format: 'number' },
];

const defaultMetricColumns: MetricKey[] = ['sales', 'investment', 'revenue', 'roas', 'conversion'];

export function WeeklyComparisonTable({
  data,
  isMeta = false,
  viewMode = 'week',
  onViewModeChange,
}: WeeklyComparisonTableProps) {
  const [sortTarget, setSortTarget] = useState<SortTarget>({ type: 'period' });
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedMetricColumns, setSelectedMetricColumns] = useState<MetricKey[]>(defaultMetricColumns);

  const resolveMetric = (metric: MetricKey) => metricOptions.find((m) => m.key === metric) || metricOptions[0];

  const handleSortPeriod = () => {
    if (sortTarget.type === 'period') {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortTarget({ type: 'period' });
      setSortDirection('desc');
    }
  };

  const handleSortMetric = (index: number) => {
    if (sortTarget.type === 'metric' && sortTarget.index === index) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortTarget({ type: 'metric', index });
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      if (sortTarget.type === 'period') {
        const aVal = Number.isFinite(a.periodSort) ? Number(a.periodSort) : 0;
        const bVal = Number.isFinite(b.periodSort) ? Number(b.periodSort) : 0;

        if (aVal !== 0 || bVal !== 0) {
          return (aVal - bVal) * direction;
        }

        return a.week.localeCompare(b.week) * direction;
      }

      const metricKey = selectedMetricColumns[sortTarget.index] || defaultMetricColumns[0];
      const aVal = Number((a as Record<string, unknown>)[metricKey] || 0);
      const bVal = Number((b as Record<string, unknown>)[metricKey] || 0);
      return (aVal - bVal) * direction;
    });
  }, [data, selectedMetricColumns, sortDirection, sortTarget]);

  const formatMetricValue = (value: number, formatType: 'number' | 'currency' | 'percentage' | 'decimal') => {
    switch (formatType) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'decimal':
        return value.toFixed(2);
      default:
        return Math.round(value).toLocaleString('pt-BR');
    }
  };

  const SortIcon = ({ active }: { active: boolean }) => {
    if (!active) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap min-w-[170px]">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 gap-1 font-medium"
                      onClick={handleSortPeriod}
                    >
                      {viewMode === 'day' ? 'Dia' : viewMode === 'month' ? 'Mês' : 'Semana'}
                      <SortIcon active={sortTarget.type === 'period'} />
                    </Button>
                    {isMeta && onViewModeChange && (
                      <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as 'day' | 'week' | 'month')}>
                        <SelectTrigger className="h-8 w-[95px] text-xs">
                          <SelectValue placeholder="Visão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Diária</SelectItem>
                          <SelectItem value="week">Semanal</SelectItem>
                          <SelectItem value="month">Mensal</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </TableHead>

                {(isMeta ? selectedMetricColumns : defaultMetricColumns).map((metricKey, index) => {
                  const metric = resolveMetric(metricKey);
                  return (
                    <TableHead key={`${metricKey}-${index}`} className="whitespace-nowrap min-w-[155px]">
                      <div className="flex items-center gap-2">
                        {isMeta ? (
                          <Select
                            value={metricKey}
                            onValueChange={(value) => {
                              const next = [...selectedMetricColumns];
                              next[index] = value as MetricKey;
                              setSelectedMetricColumns(next);
                            }}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue placeholder="Métrica" />
                            </SelectTrigger>
                            <SelectContent>
                              {metricOptions.map((opt) => (
                                <SelectItem key={opt.key} value={opt.key}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm font-medium">{metric.label}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          onClick={() => handleSortMetric(index)}
                        >
                          <SortIcon active={sortTarget.type === 'metric' && sortTarget.index === index} />
                        </Button>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, index) => (
                <TableRow key={`${row.periodKey || row.week}-${index}`} className="table-row-hover">
                  <TableCell className="font-medium">{row.week}</TableCell>
                  {(isMeta ? selectedMetricColumns : defaultMetricColumns).map((metricKey, colIndex) => {
                    const metric = resolveMetric(metricKey);
                    const rawValue = Number((row as Record<string, unknown>)[metric.key] || 0);
                    const isPositiveHighlight =
                      (metric.key === 'roas' && rawValue >= 3.5) ||
                      (metric.key === 'conversion' && rawValue >= 4.0);

                    return (
                      <TableCell key={`${metricKey}-${colIndex}`}>
                        <span className={isPositiveHighlight ? 'text-kpi-positive font-medium' : ''}>
                          {formatMetricValue(rawValue, metric.format)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
