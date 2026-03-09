import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SheetDataOptions {
  spreadsheetId: string;
  sheetName: string;
  enabled?: boolean;
  shareToken?: string;
}

export function useSheetData({ spreadsheetId, sheetName, enabled = true, shareToken }: SheetDataOptions) {
  return useQuery({
    queryKey: ['sheet-data', spreadsheetId, sheetName, shareToken],
    queryFn: async () => {
      const range = `${sheetName}!A:ZZ`;

      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData.session?.provider_token;

      const invokeHeaders: Record<string, string> = {};
      if (providerToken) invokeHeaders['x-google-token'] = providerToken;
      if (shareToken) invokeHeaders['x-share-token'] = shareToken;

      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'read-data',
          spreadsheetId,
          range
        },
        headers: invokeHeaders,
      });

      if (error) throw error;

      // Transform sheet data to rows with headers
      const rows = data.values || [];
      if (rows.length < 2) {
        return { headers: [], rows: [], rawData: rows };
      }

      const headers = rows[0] as string[];
      const dataRows = rows.slice(1).map((row: string[], index: number) => {
        const obj: Record<string, string | number> = { _rowIndex: index };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });

      return { headers, rows: dataRows, rawData: rows };
    },
    enabled: enabled && !!spreadsheetId && !!sheetName,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (previously cacheTime)
  });
}

export function useSpreadsheets() {
  return useQuery({
    queryKey: ['spreadsheets'],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData.session?.provider_token;

      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'list-spreadsheets' },
        headers: providerToken ? { 'x-google-token': providerToken } : undefined,
      });

      if (error) throw error;
      return data.files || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useSheetTabs(spreadsheetId: string, enabled = true) {
  return useQuery({
    queryKey: ['sheet-tabs', spreadsheetId],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData.session?.provider_token;

      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'get-sheets', spreadsheetId },
        headers: providerToken ? { 'x-google-token': providerToken } : undefined,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!spreadsheetId,
    staleTime: 5 * 60 * 1000,
  });
}
