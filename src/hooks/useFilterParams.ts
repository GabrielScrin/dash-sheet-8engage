import { useSearchParams } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import { parseISO, format, isValid } from 'date-fns';
import { DateRange } from 'react-day-picker';

interface FilterParams {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  creative: string | null;
  tab: string;
}

interface UseFilterParamsReturn {
  filters: FilterParams;
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  setCreative: (creative: string | null) => void;
  setTab: (tab: string) => void;
  clearFilters: () => void;
}

export function useFilterParams(defaultTab: string = 'perpetua'): UseFilterParamsReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo((): FilterParams => {
    const dateFromStr = searchParams.get('dateFrom');
    const dateToStr = searchParams.get('dateTo');
    const creative = searchParams.get('creative');
    const tab = searchParams.get('tab') || defaultTab;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (dateFromStr) {
      const parsed = parseISO(dateFromStr);
      if (isValid(parsed)) dateFrom = parsed;
    }

    if (dateToStr) {
      const parsed = parseISO(dateToStr);
      if (isValid(parsed)) dateTo = parsed;
    }

    return {
      dateFrom,
      dateTo,
      creative,
      tab,
    };
  }, [searchParams, defaultTab]);

  const dateRange = useMemo((): DateRange | undefined => {
    if (!filters.dateFrom && !filters.dateTo) return undefined;
    return {
      from: filters.dateFrom,
      to: filters.dateTo,
    };
  }, [filters.dateFrom, filters.dateTo]);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      });
      
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setDateRange = useCallback((range: DateRange | undefined) => {
    updateParams({
      dateFrom: range?.from ? format(range.from, 'yyyy-MM-dd') : null,
      dateTo: range?.to ? format(range.to, 'yyyy-MM-dd') : null,
    });
  }, [updateParams]);

  const setCreative = useCallback((creative: string | null) => {
    updateParams({ creative });
  }, [updateParams]);

  const setTab = useCallback((tab: string) => {
    updateParams({ tab });
  }, [updateParams]);

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return {
    filters,
    dateRange,
    setDateRange,
    setCreative,
    setTab,
    clearFilters,
  };
}
