import { useState, useEffect } from 'react';
import { FileSpreadsheet, Search, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Spreadsheet {
  id: string;
  name: string;
  modifiedTime: string;
  iconLink?: string;
}

interface SheetSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (spreadsheet: Spreadsheet) => void;
}

export function SheetSelector({ open, onOpenChange, onSelect }: SheetSelectorProps) {
  const { toast } = useToast();
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchSpreadsheets = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const providerToken = sessionData.session.provider_token;
      
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'list-spreadsheets' },
        headers: providerToken ? { 'x-google-token': providerToken } : undefined,
      });

      if (error) throw error;

      setSpreadsheets(data.files || []);
    } catch (error: any) {
      console.error('Error fetching spreadsheets:', error);
      toast({
        title: 'Erro ao carregar planilhas',
        description: error.message || 'Verifique sua conexão com o Google',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSpreadsheets();
    }
  }, [open]);

  const filteredSpreadsheets = spreadsheets.filter(sheet =>
    sheet.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Selecionar Planilha
          </DialogTitle>
          <DialogDescription>
            Escolha uma planilha do seu Google Drive
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar planilhas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchSpreadsheets} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Carregando planilhas...</p>
            </div>
          ) : filteredSpreadsheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">
                {search ? 'Nenhuma planilha encontrada' : 'Nenhuma planilha disponível'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSpreadsheets.map((spreadsheet) => (
                <button
                  key={spreadsheet.id}
                  onClick={() => onSelect(spreadsheet)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{spreadsheet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Modificado em {formatDate(spreadsheet.modifiedTime)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
