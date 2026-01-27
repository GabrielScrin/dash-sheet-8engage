import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CreativeData {
  id: string;
  name: string;
  thumbnail?: string;
  link?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  landingViews: number;
  checkoutViews: number;
  sales: number;
}

interface CreativePerformanceTableProps {
  data: CreativeData[];
  selectedCreative: string | null;
  onCreativeSelect: (id: string | null) => void;
}

type SortField = keyof CreativeData;
type SortDirection = 'asc' | 'desc';

export function CreativePerformanceTable({ 
  data, 
  selectedCreative, 
  onCreativeSelect 
}: CreativePerformanceTableProps) {
  const [sortField, setSortField] = useState<SortField>('sales');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const direction = sortDirection === 'asc' ? 1 : -1;
    
    if (typeof aVal === 'string') {
      return aVal.localeCompare(bVal as string) * direction;
    }
    return ((aVal as number) - (bVal as number)) * direction;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4" /> 
      : <ArrowDown className="h-4 w-4" />;
  };

  const columns = [
    { key: 'name' as const, label: 'Criativo' },
    { key: 'impressions' as const, label: 'Impressões' },
    { key: 'clicks' as const, label: 'Cliques' },
    { key: 'ctr' as const, label: 'CTR' },
    { key: 'landingViews' as const, label: 'LP Views' },
    { key: 'checkoutViews' as const, label: 'Checkout' },
    { key: 'sales' as const, label: 'Vendas' },
  ];

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
                {columns.map((col) => (
                  <TableHead key={col.key} className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 gap-1 font-medium"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon field={col.key} />
                    </Button>
                  </TableHead>
                ))}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow 
                  key={row.id}
                  data-state={selectedCreative === row.id ? 'selected' : undefined}
                  className={`table-row-hover cursor-pointer ${
                    selectedCreative === row.id ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => onCreativeSelect(selectedCreative === row.id ? null : row.id)}
                >
                  <TableCell className="font-medium">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3">
                            {/* Thumbnail */}
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
                                <div className="hidden h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </a>
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            
                            {/* Name and link */}
                            <div className="min-w-0 flex-1">
                              <span className="block truncate max-w-[180px]">{row.name}</span>
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
                  <TableCell>{row.impressions.toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{row.clicks.toLocaleString('pt-BR')}</TableCell>
                  <TableCell>
                    <span className={row.ctr >= 3.0 ? 'text-kpi-positive font-medium' : ''}>
                      {row.ctr.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>{row.landingViews.toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{row.checkoutViews.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="font-semibold">{row.sales}</TableCell>
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
