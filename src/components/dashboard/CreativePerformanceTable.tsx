import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMetaMetricValue } from '@/lib/meta-metric-labels';

interface CreativeData {
  id: string;
  name: string;
  thumbnail?: string;
  link?: string;
  [key: string]: unknown;
  actions_map?: Record<string, number>;
  action_values_map?: Record<string, number>;
  actions_agg_map?: Record<string, number>;
  action_values_agg_map?: Record<string, number>;
}

interface MetricOption {
  key: string;
  label: string;
  format: 'number' | 'currency' | 'percentage' | 'decimal';
}

interface CreativePerformanceTableProps {
  data: CreativeData[];
  selectedCreative: string | null;
  onCreativeSelect: (id: string | null) => void;
  isMeta?: boolean;
  metricOptions?: MetricOption[];
  defaultMetricColumns?: string[];
  metricColumns?: string[];
  onMetricColumnsChange?: (columns: string[]) => void;
}

type SortDirection = 'asc' | 'desc';
type SortTarget = { type: 'name' } | { type: 'metric'; index: number };

const fallbackMetricOptions: MetricOption[] = [
  { key: 'impressions', label: 'Impressoes', format: 'number' },
  { key: 'clicks', label: 'Cliques', format: 'number' },
  { key: 'ctr', label: 'CTR', format: 'percentage' },
  { key: 'landing_views', label: 'LP Views', format: 'number' },
  { key: 'checkout_views', label: 'Checkout', format: 'number' },
  { key: 'sales', label: 'Vendas', format: 'number' },
];

const fallbackDefaultMetricColumns = ['impressions', 'clicks', 'ctr', 'landing_views', 'sales'];

export function CreativePerformanceTable({
  data,
  selectedCreative,
  onCreativeSelect,
  isMeta = false,
  metricOptions = fallbackMetricOptions,
  defaultMetricColumns = fallbackDefaultMetricColumns,
  metricColumns,
  onMetricColumnsChange,
}: CreativePerformanceTableProps) {
  const [sortTarget, setSortTarget] = useState<SortTarget>({ type: 'metric', index: 4 });
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [internalSelectedMetricColumns, setInternalSelectedMetricColumns] = useState<string[]>(defaultMetricColumns);
  const selectedMetricColumns = metricColumns ?? internalSelectedMetricColumns;

  const setSelectedMetricColumns = (updater: string[] | ((prev: string[]) => string[])) => {
    const next =
      typeof updater === 'function'
        ? (updater as (prev: string[]) => string[])(selectedMetricColumns)
        : updater;
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
  }, [defaultMetricColumns, metricColumns, metricOptions]);

  const resolveMetric = (metricKey: string) => {
    return metricOptions.find((m) => m.key === metricKey) || metricOptions[0] || fallbackMetricOptions[0];
  };

  const visibleMetricColumns = (isMeta ? selectedMetricColumns : defaultMetricColumns).slice(0, 5);

  const handleSortByName = () => {
    if (sortTarget.type === 'name') {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortTarget({ type: 'name' });
    setSortDirection('asc');
  };

  const handleSortByMetric = (index: number) => {
    if (sortTarget.type === 'metric' && sortTarget.index === index) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortTarget({ type: 'metric', index });
    setSortDirection('desc');
  };

  const sortedData = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      if (sortTarget.type === 'name') {
        return String(a?.name || '').localeCompare(String(b?.name || '')) * direction;
      }
      const metricKey = visibleMetricColumns[sortTarget.index] || visibleMetricColumns[0] || 'sales';
      const aVal = getMetaMetricValue(a as Record<string, unknown>, metricKey);
      const bVal = getMetaMetricValue(b as Record<string, unknown>, metricKey);
      return (aVal - bVal) * direction;
    });
  }, [data, sortDirection, sortTarget, visibleMetricColumns]);

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
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap min-w-[300px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8 gap-1 font-medium"
                    onClick={handleSortByName}
                  >
                    Criativo
                    <SortIcon active={sortTarget.type === 'name'} />
                  </Button>
                </TableHead>

                {visibleMetricColumns.map((metricKey, index) => {
                  const metric = resolveMetric(metricKey);
                  return (
                    <TableHead key={`${metricKey}-${index}`} className="whitespace-nowrap min-w-[160px]">
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
                            <SelectTrigger className="h-8 w-[170px] text-xs">
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
                          onClick={() => handleSortByMetric(index)}
                        >
                          <SortIcon active={sortTarget.type === 'metric' && sortTarget.index === index} />
                        </Button>
                      </div>
                    </TableHead>
                  );
                })}

                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selectedCreative === row.id ? 'selected' : undefined}
                  className={`table-row-hover cursor-pointer ${selectedCreative === row.id ? 'bg-primary/5' : ''}`}
                  onClick={() => onCreativeSelect(selectedCreative === row.id ? null : row.id)}
                >
                  <TableCell className="font-medium">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3">
                            {row.thumbnail ? (
                              <a
                                href={row.link || row.thumbnail}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              >
                                <img
                                  src={row.thumbnail}
                                  alt={row.name}
                                  className="h-10 w-10 rounded-md object-cover border hover:opacity-80 transition-opacity"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                                <div className="hidden h-10 w-10 rounded-md bg-muted items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </a>
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <span className="block truncate max-w-[230px]">{row.name}</span>
                              {row.link && (
                                <a
                                  href={row.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Ver criativo
                                </a>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="break-words">{row.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {visibleMetricColumns.map((metricKey, index) => {
                    const metric = resolveMetric(metricKey);
                    const rawValue = getMetaMetricValue(row as Record<string, unknown>, metric.key);
                    const isPositiveHighlight =
                      (metric.key === 'roas' && rawValue >= 3.5) ||
                      (metric.key === 'ctr' && rawValue >= 2.5) ||
                      (metric.key === 'hook_rate' && rawValue >= 0.2) ||
                      (metric.key === 'hold_rate' && rawValue >= 0.1);
                    return (
                      <TableCell key={`${metric.key}-${index}`}>
                        <span className={isPositiveHighlight ? 'text-kpi-positive font-medium' : ''}>
                          {formatMetricValue(rawValue, metric.format)}
                        </span>
                      </TableCell>
                    );
                  })}

                  <TableCell>
                    {selectedCreative === row.id && (
                      <Filter className="h-4 w-4 text-primary" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
