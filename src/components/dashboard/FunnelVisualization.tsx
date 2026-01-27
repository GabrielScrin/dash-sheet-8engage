import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { Card, CardContent } from '@/components/ui/card';

interface FunnelStep {
  label: string;
  value: number;
}

interface FunnelVisualizationProps {
  data: FunnelStep[];
}

export function FunnelVisualization({ data }: FunnelVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!svgRef.current || hasAnimated.current || data.length === 0) return;
    
    hasAnimated.current = true;
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

  const maxValue = data[0].value;
  const svgHeight = data.length * 80 + 40;
  const barHeight = 48;
  const barGap = 32;
  const maxBarWidth = 400;
  const labelWidth = 140;
  const valueWidth = 100;

  const getRate = (currentValue: number, previousValue: number) => {
    return ((currentValue / previousValue) * 100).toFixed(1);
  };

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
              viewBox={`0 0 720 ${svgHeight}`}
              className="w-full min-w-[600px]"
              role="img"
              aria-label="Funil de conversão"
            >
              {data.map((step, index) => {
                const barWidth = (step.value / maxValue) * maxBarWidth;
                const y = 20 + index * (barHeight + barGap);
                const previousValue = index > 0 ? data[index - 1].value : null;
                const rate = previousValue ? getRate(step.value, previousValue) : null;

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
                      {step.value.toLocaleString('pt-BR')}
                    </text>

                    {/* Connector line to next step */}
                    {index < data.length - 1 && (
                      <path
                        className="funnel-connector"
                        d={`M ${labelWidth + barWidth / 2} ${y + barHeight} 
                            L ${labelWidth + (data[index + 1].value / maxValue) * maxBarWidth / 2} ${y + barHeight + barGap}`}
                        stroke="hsl(var(--border))"
                        strokeWidth={2}
                        strokeDasharray="100"
                        fill="none"
                      />
                    )}

                    {/* Rate badge */}
                    {rate && (
                      <g className="funnel-rate">
                        <rect
                          x={labelWidth + maxBarWidth + 20}
                          y={y + barHeight / 2 - 12}
                          width={60}
                          height={24}
                          rx={12}
                          fill="hsl(var(--muted))"
                        />
                        <text
                          x={labelWidth + maxBarWidth + 50}
                          y={y + barHeight / 2 + 5}
                          textAnchor="middle"
                          className="fill-muted-foreground text-xs font-medium"
                        >
                          {rate}%
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span>Taxa de passagem entre etapas</span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted" />
              <span>Percentual</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
