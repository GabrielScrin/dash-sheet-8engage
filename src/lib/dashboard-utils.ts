import { ColumnMapping } from '@/hooks/useColumnMappings';

export interface DashboardData {
    bigNumbers: {
        label: string;
        value: number | string;
        previousValue?: number | string;
        format: 'number' | 'currency' | 'decimal' | 'percentage';
    }[];
    weeklyData: any[];
    creativeData: any[];
    funnelData: { label: string; value: number }[];
}

export function processDashboardData(
    allRows: any[],
    mappings: ColumnMapping[]
): DashboardData {
    const data: DashboardData = {
        bigNumbers: [],
        weeklyData: [],
        creativeData: [],
        funnelData: [],
    };

    if (!allRows || allRows.length === 0) return data;

    // 1. Process Big Numbers
    const bigNumberMappings = mappings.filter(m => m.is_big_number);
    data.bigNumbers = bigNumberMappings.map(m => {
        const lastRow = allRows[allRows.length - 1];
        const prevRow = allRows.length > 1 ? allRows[allRows.length - 2] : null;

        const value = parseValue(lastRow[m.source_column]);
        const prevValue = prevRow ? parseValue(prevRow[m.source_column]) : undefined;

        const formatOptions = (m.format_options as any) || {};
        let format: any = 'number';
        if (formatOptions.format_type === 'currency') format = 'currency';
        if (formatOptions.format_type === 'percent') format = 'percentage';

        return {
            label: m.display_name || m.source_column,
            value: value,
            previousValue: prevValue,
            format: format,
        };
    });

    // 2. Process Funnel
    const funnelMappings = mappings
        .filter(m => m.is_funnel_step)
        .sort((a, b) => (a.funnel_order || 0) - (b.funnel_order || 0));

    data.funnelData = funnelMappings.map(m => {
        // Summing all values for the funnel
        const total = allRows.reduce((sum, row) => sum + (parseValue(row[m.source_column]) || 0), 0);
        return {
            label: m.display_name || m.source_column,
            value: total,
        };
    });

    // 3. Process Weekly Data
    // (Simple implementation: group by a 'date' column if mapped, or just last N rows)
    const weeklyMappings = mappings.filter(m => m.mapped_to === 'weekly');
    if (allRows.length > 0) {
        // For now, let's take the last 4-5 rows as "weeks" if no better grouping is available
        const relevantRows = allRows.slice(-5);
        data.weeklyData = relevantRows.map((row, i) => {
            const weekData: any = { week: `Sem ${i + 1}` };
            weeklyMappings.forEach(m => {
                const key = (m as any).mapped_to_key || m.source_column;
                weekData[key] = parseValue(row[m.source_column]);
            });
            // Fallback: if we don't have explicit weekly mappings but have standard metrics, use them
            if (Object.keys(weekData).length === 1) {
                weekData.sales = parseValue(row['vendas'] || row['Sales'] || 0);
                weekData.investment = parseValue(row['investimento'] || row['Investment'] || 0);
                weekData.revenue = parseValue(row['faturamento'] || row['Revenue'] || 0);
            }
            return weekData;
        });
    }

    // 4. Process Creative Data
    const creativeMappings = mappings.filter(m => m.mapped_to === 'creative');
    if (allRows.length > 0) {
        // Group by creative name if possible
        const creativeGroups: Record<string, any> = {};
        allRows.forEach(row => {
            const name = row['criativo'] || row['Creative'] || row['Nome do Criativo'] || 'Desconhecido';
            if (!creativeGroups[name]) {
                creativeGroups[name] = { name, clicks: 0, impressions: 0, sales: 0, revenue: 0 };
            }
            creativeGroups[name].clicks += (parseValue(row['cliques'] || row['Clicks']) || 0);
            creativeGroups[name].impressions += (parseValue(row['impressoes'] || row['Impressions']) || 0);
            creativeGroups[name].sales += (parseValue(row['vendas'] || row['Sales']) || 0);
        });
        data.creativeData = Object.values(creativeGroups);
    }

    return data;
}

function parseValue(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Remove currency symbols and common separators
    const cleaned = String(val).replace(/[R$\s%]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
