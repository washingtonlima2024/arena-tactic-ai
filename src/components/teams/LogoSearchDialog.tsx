import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadLogoToLocal } from '@/lib/autoTeamLogo';

interface LogoResult {
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string;
  country: string;
  countryName: string;
}

interface CountryOption {
  id: string;
  name: string;
  emoji: string;
  count: number;
}

interface LogoSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (logo: { name: string; shortName: string | null; logoUrl: string }) => void;
}

export function LogoSearchDialog({ open, onOpenChange, onSelect }: LogoSearchDialogProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('brazil');
  const [query, setQuery] = useState('');
  const [logos, setLogos] = useState<LogoResult[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingLogos, setIsLoadingLogos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch countries on first open
  useEffect(() => {
    if (open && countries.length === 0) {
      fetchCountries();
    }
  }, [open]);

  // Fetch logos when country changes
  useEffect(() => {
    if (open && selectedCountry) {
      fetchLogos();
    }
  }, [selectedCountry, open]);

  const fetchCountries = async () => {
    setIsLoadingCountries(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-football-logos', {
        body: { mode: 'countries' },
      });

      if (fnError) throw fnError;
      if (data?.success && data.countries) {
        setCountries(data.countries);
      } else {
        throw new Error(data?.error || 'Falha ao carregar países');
      }
    } catch (err) {
      console.error('Error fetching countries:', err);
      setError('Erro ao carregar lista de países');
    } finally {
      setIsLoadingCountries(false);
    }
  };

  const fetchLogos = useCallback(async (searchQuery?: string) => {
    setIsLoadingLogos(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-football-logos', {
        body: { mode: 'search', country: selectedCountry, query: searchQuery || undefined },
      });

      if (fnError) throw fnError;
      if (data?.success && data.logos) {
        setLogos(data.logos);
      } else {
        throw new Error(data?.error || 'Falha ao carregar logos');
      }
    } catch (err) {
      console.error('Error fetching logos:', err);
      setError('Erro ao carregar logos');
    } finally {
      setIsLoadingLogos(false);
    }
  }, [selectedCountry]);

  const handleSearch = () => {
    fetchLogos(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSelectLogo = async (logo: LogoResult) => {
    let finalLogoUrl = logo.logoUrl;
    try {
      // Baixar para storage local com verificação de cache
      finalLogoUrl = await downloadLogoToLocal(logo.logoUrl, logo.name);
    } catch (err) {
      console.warn(`[LogoSearch] Fallback URL externa para ${logo.name}:`, err);
    }
    
    onSelect({
      name: logo.name,
      shortName: logo.shortName,
      logoUrl: finalLogoUrl,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Buscar Logo de Time
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Country selector */}
          <div className="space-y-2">
            <Label>País</Label>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um país" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {isLoadingCountries ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.name} ({c.count})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Filtrar por nome do time..."
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSearch} disabled={isLoadingLogos}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Results grid */}
          <ScrollArea className="h-[400px]">
            {isLoadingLogos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : logos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {query ? 'Nenhum time encontrado para essa busca' : 'Nenhum logo disponível'}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pr-4">
                {logos.map((logo) => (
                  <button
                    key={logo.slug}
                    onClick={() => handleSelectLogo(logo)}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
                  >
                    <img
                      src={logo.logoUrl}
                      alt={logo.name}
                      className="h-16 w-16 object-contain group-hover:scale-110 transition-transform"
                      loading="lazy"
                    />
                    <span className="text-xs text-center font-medium leading-tight line-clamp-2">
                      {logo.name}
                    </span>
                    {logo.shortName && (
                      <span className="text-[10px] text-muted-foreground">
                        {logo.shortName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <p className="text-xs text-muted-foreground text-center">
            Logos fornecidos por football-logos.cc • {logos.length} resultados
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
