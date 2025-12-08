import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FolderOpen, Upload, Link as LinkIcon, BarChart3, Share2, Settings } from 'lucide-react';
import logoKakttus from '@/assets/logo-kakttus.png';
import soccerBall from '@/assets/soccer-ball.png';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 tactical-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />
      
      {/* Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full" />
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <img src={logoKakttus} alt="Kakttus Solutions" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="font-semibold text-foreground">Kakttus Solutions</h1>
            <p className="text-xs text-muted-foreground">Tecnologia com Inteligência</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Link to="/matches" className="text-muted-foreground hover:text-foreground transition-colors">
            <BarChart3 className="h-5 w-5" />
          </Link>
          <Link to="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            <Share2 className="h-5 w-5" />
          </Link>
          <Link to="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 py-16">
        {/* Title with Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <img src={arenaIcon} alt="Arena Play" className="h-20 w-20 md:h-24 md:w-24 object-contain" />
            <img src={arenaWordmark} alt="Arena Play" className="h-14 md:h-16 object-contain" />
          </div>
          <p className="text-muted-foreground mt-3 text-lg">
            Análise Inteligente de Futebol
          </p>
        </div>

        {/* Main CTA Button */}
        <Button 
          asChild 
          variant="outline" 
          size="lg" 
          className="mb-12 gap-2 border-border/50 hover:border-primary/50 hover:bg-primary/5"
        >
          <Link to="/auth">
            <FolderOpen className="h-5 w-5" />
            Ver Galeria de Partidas
          </Link>
        </Button>

        {/* Upload Section */}
        <div className="w-full max-w-xl">
          {/* Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-border/50 mb-8">
            <Link 
              to="/auth"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-secondary/50 hover:bg-secondary/80 transition-colors text-foreground"
            >
              <Upload className="h-4 w-4" />
              Upload de Arquivo
            </Link>
            <Link 
              to="/auth"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-transparent hover:bg-secondary/30 transition-colors text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-4 w-4" />
              Link + Legenda
            </Link>
          </div>

          {/* Upload Icon */}
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6 arena-glow">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              Enviar Vídeo para Análise
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              Faça upload de um vídeo de futebol para análise tática em tempo real com IA. 
              Formatos suportados: MP4, WebM, MOV, MKV, AVI (até 500MB - compressão automática para 80MB)
            </p>

            <Button asChild variant="arena" size="lg" className="gap-2">
              <Link to="/auth">
                <Upload className="h-4 w-4" />
                Selecionar Vídeo
              </Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
