import { useEffect, useMemo, useState } from 'react';
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
import { getMetaMetricValue } from '@/lib/meta-metric-labels';

interface WeeklyData {
  week: string;
  periodKey?: string;
  periodSort?: number;
  [key: string]: unknown;
  actions_agg_map?: Record<string, number>;
  action_values_agg_map?: Record<string, number>;
}

interface MetricOption {
  key: string;
  label: string;
  format: 'number' | 'currency' | 'percentage' | 'decimal';
}

interface WeeklyComparisonTableProps {
  data: WeeklyData[];
  isMeta?: boolean;
  viewMode?: 'day' | 'week' | 'month';
  onViewModeChange?: (value: 'day' | 'week' | 'month') => void;
  metricOptions?: MetricOption[];
  defaultMetricColumns?: string[];
  metricColumns?: string[];
  onMetricColumnsChange?: (columns: string[]) => void;
}

type SortDirection = 'asc' | 'desc';
type SortTarget =
  | { type: 'period' }
  | { type: 'metric'; index: number };

const fallbackMetricOptions: MetricOption[] = [
  { key: 'sales', label: 'Vendas', format: 'number' },
  { key: 'investment', label: 'Investimento', format: 'currency' },
  { key: 'revenue', label: 'Faturamento', format: 'currency' },
  { key: 'roas', label: 'ROAS', format: 'decimal' },
  { key: 'conversion', label: 'Taxa de Conversao', format: 'percentage' },
];

const fallbackDefaultMetricColumns = ['sales', 'investment', 'revenue', 'roas', 'conversion'];

export function WeeklyComparisonTable({
  data,
  isMeta = false,
  viewMode = 'week',
  onViewModeChange,
  metricOptions = fallbackMetricOptions,
  defaultMetricColumns = fallbackDefaultMetricColumns,
  metricColumns,
  onMetricColumnsChange,
}: WeeklyComparisonTableProps) {
  const [sortTarget, setSortTarget] = useState<SortTarget>({ type: 'period' });
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [internalSelectedMetricColumns, setInternalSelectedMetricColumns] = useState<string[]>(defaultMetricColumns);
  const selectedMetricColumns = metricColumns ?? internalSelectedMetricColumns;
  const setSelectedMetricColumns = (updater: string[] | ((prev: string[]) => string[])) => {
    const next = typeof updater === 'function' ? (updater as (prev: string[]) => string[])(selectedMetricColumns) : updater;
    onMetricColumnsChange?.(next);
    if (metricColumns === undefined) {
      setInternalSelectedMetricColumns(next);
    }
  };

  useEffect(() => {
    const availableKeys = new Set(metricOptions.map((opt) => opt.key));
    const normalizedDefaults = defaultMetricColumns.filter((key) => availableKeys.has(key));
    const safeDefaults = (normalizedDefaults.length > 0 ? normalizedDefaults : metricOptions.slice(0, 5).map((opt) => opt.key)).slice(0, 5);
    setSelectedMetricColumns((prev) => {
      const normalizedPrev = (!prev.length ? safeDefaults : prev.map((key, index) => (availableKeys.has(key) ? key : safeDefaults[index] || safeDefaults[0]))).slice(0, 5);
      if (normalizedPrev.length === prev.length && normalizedPrev.every((value, index) => value === prev[index])) {
        return prev;
      }
      return normalizedPrev;
    });
  }, [defaultMetricColumns, metricOptions, metricColumns]);

  const resolveMetric = (metricKey: string) => {
    return metricOptions.find((m) => m.key === metricKey) || metricOptions[0] || fallbackMetricOptions[0];
  };

  const getMetricValue = (row: WeeklyData, metricKey: string) => {
    return getMetaMetricValue(row as Record<string, unknown>, metricKey);
  };

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

      const metricKey = selectedMetricColumns[sortTarget.index] || defaultMetricColumns[0] || 'sales';
      const aVal = getMetricValue(a, metricKey);
      const bVal = getMetricValue(b, metricKey);
      return (aVal - bVal) * direction;
    });
  }, [data, defaultMetricColumns, selectedMetricColumns, sortDirection, sortTarget]);

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

  const visibleMetricColumns = (isMeta ? selectedMetricColumns : defaultMetricColumns).slice(0, 5);

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
                      {viewMode === 'day' ? 'Dia' : viewMode === 'month' ? 'Mes' : 'Semana'}
                      <SortIcon active={sortTarget.type === 'period'} />
                    </Button>
                    {isMeta && onViewModeChange && (
                      <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as 'day' | 'week' | 'month')}>
                        <SelectTrigger className="h-8 w-[95px] text-xs">
                          <SelectValue placeholder="Visao" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Diaria</SelectItem>
                          <SelectItem value="week">Semanal</SelectItem>
                          <SelectItem value="month">Mensal</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </TableHead>

                {visibleMetricColumns.map((metricKey, index) => {
                  const metric = resolveMetric(metricKey);
                  return (
                    <TableHead key={`${metricKey}-${index}`} className="whitespace-nowrap min-w-[155px]">
                      <div className="flex items-center gap-2">
                        {isMeta ? (
                          <Select
                            value={metricKey}
                            onValueChange={(value) => {
                              setSelectedMetricColumns((prev) => {
                                const next = [...prev];
                                next[index] = value;
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue placeholder="Metrica" />
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
                  {visibleMetricColumns.map((metricKey, colIndex) => {
                    const metric = resolveMetric(metricKey);
                    const rawValue = getMetricValue(row, metric.key);
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
