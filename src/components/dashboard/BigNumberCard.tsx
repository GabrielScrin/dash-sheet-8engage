import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BigNumberCardProps {
  label: string;
  value: number;
  previousValue?: number;
  format: 'number' | 'currency' | 'percentage' | 'decimal';
  delay?: number;
}

export function BigNumberCard({ label, value, previousValue, format, delay = 0 }: BigNumberCardProps) {
  const change = previousValue ? ((value - previousValue) / previousValue) * 100 : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;

  const formatValue = (val: number): string => {
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
      case 'percentage':
        return `${val.toFixed(2)}%`;
      case 'decimal':
        return val.toFixed(2);
      default:
        return new Intl.NumberFormat('pt-BR').format(val);
    }
  };

  const getPrefix = (): string => {
    if (format === 'currency') return 'R$\u00A0';
    return '';
  };

  const getSuffix = (): string => {
    if (format === 'percentage') return '%';
    return '';
  };

  const getDecimals = (): number => {
    if (format === 'percentage') return 2;
    if (format === 'decimal') return 1;
    if (format === 'currency') return 2;
    return 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="dashboard-card-hover cursor-default">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
                <div className="mt-2 flex items-baseline gap-2 overflow-hidden">
                  <span className="max-w-full whitespace-nowrap text-[clamp(1.45rem,1.9vw,2rem)] font-bold leading-none tracking-tight" aria-live="polite">
                    <CountUp
                      start={0}
                      end={value}
                      duration={1.2}
                      delay={delay}
                      separator="."
                      decimal=","
                      prefix={getPrefix()}
                      suffix={getSuffix()}
                      decimals={getDecimals()}
                      useEasing
                    />
                  </span>
                </div>
                {previousValue !== undefined && (
                  <div className="mt-2 flex items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                        isPositive ? 'text-kpi-positive' : isNegative ? 'text-kpi-negative' : 'text-kpi-neutral'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : isNegative ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" />
                      )}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">vs período anterior</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Valor atual: {formatValue(value)}</p>
            {previousValue !== undefined && (
              <p className="text-xs text-muted-foreground">Período anterior: {formatValue(previousValue)}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </motion.div>
  );
}
