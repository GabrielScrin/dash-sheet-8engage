import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { Card, CardContent } from '@/components/ui/card';

type BadgeKind = 'percentage' | 'decimal' | 'currency' | 'number';

interface FunnelBadge {
  label: string;
  kind: BadgeKind;
  // For percentage, value is ratio (0..1). For others, it's the raw number.
  value: number;
}

interface FunnelStep {
  label: string;
  value: number;
  barValue?: number;
  format?: 'number' | 'currency';
  badges?: FunnelBadge[];
}

interface FunnelVisualizationProps {
  data: FunnelStep[];
}

export function FunnelVisualization({ data }: FunnelVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lastAnimatedKey = useRef<string | null>(null);

  const animationKey = useMemo(() => {
    return data.map((s) => `${s.label}:${String(s.value)}:${String(s.barValue ?? '')}`).join('|');
  }, [data]);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;
    if (lastAnimatedKey.current === animationKey) return;

    lastAnimatedKey.current = animationKey;
    const svg = svgRef.current;
    const bars = svg.querySelectorAll('.funnel-bar');
    const labels = svg.querySelectorAll('.funnel-label');
    const values = svg.querySelectorAll('.funnel-value');
    const rates = svg.querySelectorAll('.funnel-rate');
    const connectors = svg.querySelectorAll('.funnel-connector');

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    // Animate bars
    tl.fromTo(bars, 
      { scaleX: 0, transformOrigin: 'left center' },
      { scaleX: 1, duration: 0.5, stagger: 0.1 }
    );

    // Animate labels and values
    tl.fromTo([labels, values],
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.3, stagger: 0.05 },
      '-=0.3'
    );

    // Animate connectors
    tl.fromTo(connectors,
      { strokeDashoffset: 100 },
      { strokeDashoffset: 0, duration: 0.3, stagger: 0.08 },
      '-=0.4'
    );

    // Animate rates
    tl.fromTo(rates,
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.3, stagger: 0.1 },
      '-=0.2'
    );

    return () => {
      tl.kill();
    };
  }, [data]);

  if (data.length === 0) return null;

  const maxValue = Math.max(1, ...data.map((s) => Number(s.barValue ?? s.value) || 0));
  const svgHeight = data.length * 80 + 40;
  const barHeight = 48;
  const barGap = 32;
  const maxBarWidth = 400;
  const labelWidth = 240;
  const badgeAreaWidth = 152;
  const minBarWidth = 28;
  const scalePower = 0.6; // less literal, more aesthetic
  const svgWidth = labelWidth + maxBarWidth + badgeAreaWidth + 40;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatBadgeValue = (b: FunnelBadge) => {
    if (b.kind === 'percentage') return `${(b.value * 100).toFixed(1)}%`;
    if (b.kind === 'currency') return formatCurrency(b.value);
    if (b.kind === 'decimal') return b.value.toFixed(2);
    return b.value.toLocaleString('pt-BR');
  };

  const getDefaultBadge = (stepValue: number, previousValue: number): FunnelBadge => ({
    label: 'Taxa',
    kind: 'percentage',
    value: previousValue > 0 ? stepValue / previousValue : 0,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full"
              style={{ minWidth: `${Math.max(720, svgWidth)}px` }}
              role="img"
              aria-label="Funil de conversão"
            >
              {data.map((step, index) => {
                const barMetric = Number(step.barValue ?? step.value) || 0;
                const ratio = Math.max(0, Math.min(1, barMetric / maxValue));
                const easedRatio = Math.pow(ratio, scalePower);
                const barWidth = minBarWidth + easedRatio * (maxBarWidth - minBarWidth);
                const y = 20 + index * (barHeight + barGap);
                const previousValue = index > 0 ? data[index - 1].value : null;
                const badges =
                  index > 0
                    ? (step.badges && step.badges.length > 0 ? step.badges : previousValue ? [getDefaultBadge(step.value, previousValue)] : [])
                    : [];

                const formattedValue =
                  step.format === 'currency'
                    ? formatCurrency(step.value)
                    : step.value.toLocaleString('pt-BR');

                return (
                  <g key={step.label}>
                    {/* Label */}
                    <text
                      className="funnel-label fill-foreground text-sm font-medium"
                      x={labelWidth - 10}
                      y={y + barHeight / 2 + 5}
                      textAnchor="end"
                    >
                      {step.label}
                    </text>

                    {/* Bar */}
                    <rect
                      className="funnel-bar"
                      x={labelWidth}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={8}
                      fill={`hsl(var(--chart-${(index % 5) + 1}))`}
                      fillOpacity={0.9}
                    />

                    {/* Value inside bar or outside */}
                    <text
                      className="funnel-value fill-foreground text-sm font-semibold"
                      x={barWidth > 80 ? labelWidth + barWidth - 12 : labelWidth + barWidth + 12}
                      y={y + barHeight / 2 + 5}
                      textAnchor={barWidth > 80 ? 'end' : 'start'}
                      fill={barWidth > 80 ? 'white' : undefined}
                    >
                      {formattedValue}
                    </text>

                    {/* Connector line to next step */}
                    {index < data.length - 1 && (
                      (() => {
                        const next = data[index + 1];
                        const nextMetric = Number(next.barValue ?? next.value) || 0;
                        const nextRatio = Math.max(0, Math.min(1, nextMetric / maxValue));
                        const nextEased = Math.pow(nextRatio, scalePower);
                        const nextWidth = minBarWidth + nextEased * (maxBarWidth - minBarWidth);
                        return (
                      <path
                        className="funnel-connector"
                        d={`M ${labelWidth + barWidth / 2} ${y + barHeight} 
                            L ${labelWidth + nextWidth / 2} ${y + barHeight + barGap}`}
                        stroke="hsl(var(--border))"
                        strokeWidth={2}
                        strokeDasharray="100"
                        fill="none"
                      />
                        );
                      })()
                    )}

                    {/* Rate badge */}
                    {badges.length > 0 && (
                      <g className="funnel-rate">
                        {badges.slice(0, 2).map((b, i) => {
                          const badgeW = 112;
                          const badgeH = 30;
                          const gap = 8;
                          const totalH = badges.length > 1 ? badgeH * 2 + gap : badgeH;
                          const baseY = y + barHeight / 2 - totalH / 2;
                          const by = baseY + i * (badgeH + gap);
                          return (
                            <g key={`${b.label}-${i}`}>
                              <rect
                                x={labelWidth + maxBarWidth + 20}
                                y={by}
                                width={badgeW}
                                height={badgeH}
                                rx={12}
                                fill="hsl(var(--muted))"
                              />
                              <text
                                x={labelWidth + maxBarWidth + 20 + badgeW / 2}
                                y={by + 12}
                                textAnchor="middle"
                                className="fill-muted-foreground text-[10px] font-medium"
                              >
                                {b.label}
                              </text>
                              <text
                                x={labelWidth + maxBarWidth + 20 + badgeW / 2}
                                y={by + 24}
                                textAnchor="middle"
                                className="fill-foreground text-xs font-semibold"
                              >
                                {formatBadgeValue(b)}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span>Métricas entre etapas</span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted" />
              <span>Taxa/KPI</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
