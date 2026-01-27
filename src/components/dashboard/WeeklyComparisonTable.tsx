import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface WeeklyData {
  week: string;
  sales: number;
  investment: number;
  revenue: number;
  roas: number;
  conversion: number;
}

interface WeeklyComparisonTableProps {
  data: WeeklyData[];
}

type SortField = keyof WeeklyData;
type SortDirection = 'asc' | 'desc';

export function WeeklyComparisonTable({ data }: WeeklyComparisonTableProps) {
  const [sortField, setSortField] = useState<SortField>('week');
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

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4" /> 
      : <ArrowDown className="h-4 w-4" />;
  };

  const columns = [
    { key: 'week' as const, label: 'Semana' },
    { key: 'sales' as const, label: 'Vendas' },
    { key: 'investment' as const, label: 'Investimento' },
    { key: 'revenue' as const, label: 'Faturamento' },
    { key: 'roas' as const, label: 'ROAS' },
    { key: 'conversion' as const, label: 'Taxa Conv.' },
  ];

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, index) => (
                <TableRow 
                  key={row.week} 
                  className="table-row-hover"
                >
                  <TableCell className="font-medium">{row.week}</TableCell>
                  <TableCell>{row.sales.toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{formatCurrency(row.investment)}</TableCell>
                  <TableCell>{formatCurrency(row.revenue)}</TableCell>
                  <TableCell>
                    <span className={row.roas >= 3.5 ? 'text-kpi-positive font-medium' : ''}>
                      {row.roas.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={row.conversion >= 4.0 ? 'text-kpi-positive font-medium' : ''}>
                      {row.conversion.toFixed(1)}%
                    </span>
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
