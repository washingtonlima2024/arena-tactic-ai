import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Download, Globe, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Team, TeamInsert } from '@/hooks/useTeams';
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

interface BulkImportTeamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTeams: Team[];
  onImport: (teams: TeamInsert[]) => Promise<void>;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function teamAlreadyExists(name: string, existingTeams: Team[]): boolean {
  const normalized = normalizeForMatch(name);
  return existingTeams.some((t) => {
    const existingNorm = normalizeForMatch(t.name);
    return existingNorm === normalized || existingNorm.includes(normalized) || normalized.includes(existingNorm);
  });
}

export function BulkImportTeamsDialog({
  open,
  onOpenChange,
  existingTeams,
  onImport,
}: BulkImportTeamsDialogProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('brazil');
  const [logos, setLogos] = useState<LogoResult[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingLogos, setIsLoadingLogos] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (open && countries.length === 0) {
      fetchCountries();
    }
  }, [open]);

  useEffect(() => {
    if (open && selectedCountry) {
      fetchLogos();
      setSelectedSlugs(new Set());
    }
  }, [selectedCountry, open]);

  const fetchCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data } = await supabase.functions.invoke('fetch-football-logos', {
        body: { mode: 'countries' },
      });
      if (data?.success) setCountries(data.countries);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  const fetchLogos = async () => {
    setIsLoadingLogos(true);
    try {
      const { data } = await supabase.functions.invoke('fetch-football-logos', {
        body: { mode: 'search', country: selectedCountry },
      });
      if (data?.success) setLogos(data.logos);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoadingLogos(false);
    }
  };

  const toggleLogo = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const selectAll = () => {
    const available = logos.filter((l) => !teamAlreadyExists(l.name, existingTeams));
    setSelectedSlugs(new Set(available.map((l) => l.slug)));
  };

  const deselectAll = () => {
    setSelectedSlugs(new Set());
  };

  const handleImport = async () => {
    const selected = logos.filter((l) => selectedSlugs.has(l.slug));

    if (selected.length === 0) {
      toast.warning('Selecione pelo menos um time');
      return;
    }

    setIsImporting(true);
    try {
      const teamsToImport: TeamInsert[] = [];
      
      for (const l of selected) {
        let logoUrl = l.logoUrl;
        try {
          // Tenta baixar para storage local com verificação de cache
          logoUrl = await downloadLogoToLocal(l.logoUrl, l.name);
        } catch (err) {
          console.warn(`[BulkImport] Fallback URL externa para ${l.name}:`, err);
          // Mantém URL externa como fallback
        }
        
        teamsToImport.push({
          name: l.name,
          short_name: l.shortName || null,
          logo_url: logoUrl,
        });
      }

      await onImport(teamsToImport);
      toast.success(`${teamsToImport.length} time(s) importado(s) com sucesso!`);
      onOpenChange(false);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erro ao importar times');
    } finally {
      setIsImporting(false);
    }
  };

  const availableLogos = logos.filter((l) => !teamAlreadyExists(l.name, existingTeams));
  const existingLogos = logos.filter((l) => teamAlreadyExists(l.name, existingTeams));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Importar Times por País
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

          {/* Select all / deselect */}
          {!isLoadingLogos && logos.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedSlugs.size} de {availableLogos.length} disponíveis selecionados
                {existingLogos.length > 0 && (
                  <> • {existingLogos.length} já cadastrado(s)</>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Selecionar Todos
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Limpar
                </Button>
              </div>
            </div>
          )}

          {/* Logos list */}
          <ScrollArea className="h-[380px]">
            {isLoadingLogos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-1 pr-4">
                {availableLogos.map((logo) => (
                  <label
                    key={logo.slug}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSlugs.has(logo.slug)}
                      onCheckedChange={() => toggleLogo(logo.slug)}
                    />
                    <img
                      src={logo.logoUrl}
                      alt={logo.name}
                      className="h-8 w-8 object-contain"
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{logo.name}</p>
                      {logo.shortName && (
                        <p className="text-xs text-muted-foreground">{logo.shortName}</p>
                      )}
                    </div>
                  </label>
                ))}

                {existingLogos.length > 0 && (
                  <>
                    <div className="py-2 px-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        Já cadastrados
                      </p>
                    </div>
                    {existingLogos.map((logo) => (
                      <div
                        key={logo.slug}
                        className="flex items-center gap-3 p-2 rounded-lg opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <img
                          src={logo.logoUrl}
                          alt={logo.name}
                          className="h-8 w-8 object-contain"
                          loading="lazy"
                        />
                        <p className="text-sm truncate">{logo.name}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="arena"
            onClick={handleImport}
            disabled={isImporting || selectedSlugs.size === 0}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Importar {selectedSlugs.size} Time(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
