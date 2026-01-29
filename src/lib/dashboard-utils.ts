import { ColumnMapping } from '@/hooks/useColumnMappings';

export interface DashboardData {
    bigNumbers: {
        label: string;
        value: number;
        previousValue?: number;
        format: 'number' | 'currency' | 'decimal' | 'percentage';
    }[];
    weeklyData: any[];
    creativeData: any[];
    funnelData: { label: string; value: number }[];
    distributionData: {
        totalReach: number;
        totalImpressions: number;
        avgEngagement: number;
        videoViews: number;
        followersGained: number;
        platformBreakdown: { platform: string; reach: number; engagement: number }[];
    };
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
        distributionData: {
            totalReach: 0,
            totalImpressions: 0,
            avgEngagement: 0,
            videoViews: 0,
            followersGained: 0,
            platformBreakdown: [],
        },
    };

    if (!allRows || allRows.length === 0) return data;

    // 1. Process Big Numbers
    const bigNumberMappings = mappings.filter(m => m.is_big_number && m.mapped_to !== 'distribution');
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
        const total = allRows.reduce((sum, row) => sum + (parseValue(row[m.source_column]) || 0), 0);
        return {
            label: m.display_name || m.source_column,
            value: total,
        };
    });

    // 3. Process Weekly Data
    const weeklyMappings = mappings.filter(m => m.mapped_to === 'weekly');
    if (allRows.length > 0) {
        const relevantRows = allRows.slice(-5);
        data.weeklyData = relevantRows.map((row, i) => {
            const weekData: any = { week: `Sem ${i + 1}` };
            weeklyMappings.forEach(m => {
                const key = (m as any).mapped_to_key || m.source_column;
                weekData[key] = parseValue(row[m.source_column]);
            });
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

    // 5. Process Distribution Data
    const distMappings = mappings.filter(m => m.mapped_to === 'distribution');
    if (allRows.length > 0) {
        let totalEng = 0;
        let engCount = 0;
        const platformMap: Record<string, { reach: number; eng: number; count: number }> = {};

        allRows.forEach(row => {
            const reach = parseValue(row[distMappings.find(m => m.mapped_to_key === 'reach')?.source_column || 'alcance' || 'Reach']);
            const impressions = parseValue(row[distMappings.find(m => m.mapped_to_key === 'impressions')?.source_column || 'impressoes' || 'Impressions']);
            const engagement = parseValue(row[distMappings.find(m => m.mapped_to_key === 'engagement')?.source_column || 'engajamento' || 'Engagement']);
            const views = parseValue(row[distMappings.find(m => m.mapped_to_key === 'video_views')?.source_column || 'visualizacoes' || 'Views']);
            const followers = parseValue(row[distMappings.find(m => m.mapped_to_key === 'followers')?.source_column || 'seguidores' || 'Followers']);
            const platform = (row['plataforma'] || row['Platform'] || 'Outros').toString();

            data.distributionData.totalReach += reach;
            data.distributionData.totalImpressions += impressions;
            data.distributionData.videoViews += views;
            data.distributionData.followersGained += followers;

            if (engagement > 0) {
                totalEng += engagement;
                engCount++;
            }

            if (!platformMap[platform]) platformMap[platform] = { reach: 0, eng: 0, count: 0 };
            platformMap[platform].reach += reach;
            platformMap[platform].eng += engagement;
            platformMap[platform].count += (engagement > 0 ? 1 : 0);
        });

        data.distributionData.avgEngagement = engCount > 0 ? totalEng / engCount : 0;
        data.distributionData.platformBreakdown = Object.entries(platformMap).map(([platform, stats]) => ({
            platform,
            reach: stats.reach,
            engagement: stats.count > 0 ? stats.eng / stats.count : 0
        }));
    }

    return data;
}

function parseValue(val: any): number {
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    if (!val || val === '-') return 0;

    let cleaned = String(val).replace(/[R$\s%]/g, '');

    // Detect if it uses comma as decimal separator (BR format: 1.234,56)
    // or if it uses dot as decimal separator (US format: 1,234.56)
    if (cleaned.includes(',') && cleaned.includes('.')) {
        // Mixed separators
        if (cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')) {
            // US format: dots is last (decimal), remove comma (thousand)
            cleaned = cleaned.replace(/,/g, '');
        } else {
            // BR format: comma is last (decimal), remove dot (thousand), then comma to dot
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        }
    } else if (cleaned.includes(',')) {
        // Only comma: assume decimal if it's the only one, or thousand if it's high?
        // Usually safer to assume decimal in Portuguese context.
        cleaned = cleaned.replace(',', '.');
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
}
