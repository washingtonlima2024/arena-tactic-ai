import { useState } from 'react';
import { ArrowLeft, Download, RefreshCw, Wand2, Play, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';

import VideoUploadZone from '@/components/smart-editor/VideoUploadZone';
import ClipsList from '@/components/smart-editor/ClipsList';
import VignetteSettings from '@/components/smart-editor/VignetteSettings';
import VideoTimeline from '@/components/smart-editor/VideoTimeline';
import CSSVignette from '@/components/smart-editor/CSSVignette';
import { SoccerBallLoader } from '@/components/ui/SoccerBallLoader';
import useSmartVideoEditor from '@/hooks/useSmartVideoEditor';

const SmartEditor = () => {
  document.title = 'Editor Inteligente - Arena Play';
  
  const {
    project,
    clips,
    settings,
    isUploading,
    uploadProgress,
    uploadStatus,
    isAnalyzing,
    isRendering,
    renderProgress,
    finalVideoUrl,
    uploadVideo,
    toggleClip,
    updateSettings,
    renderFinalVideo,
    reset
  } = useSmartVideoEditor();

  const [showPreview, setShowPreview] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const enabledClips = clips.filter(c => c.is_enabled);
  const hasProject = !!project;
  const isReady = project?.status === 'ready';

  const handlePreviewTimeline = () => {
    setShowPreview(true);
    setPreviewPlaying(true);
  };

  return (
    <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                  </Button>
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Editor Inteligente</h1>
                  <p className="text-sm text-muted-foreground">
                    {project ? project.title : 'Crie vídeos com cortes e vinhetas automáticas'}
                  </p>
                </div>
              </div>

              {hasProject && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Novo Projeto
                  </Button>
                  {isReady && enabledClips.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={handlePreviewTimeline}>
                        <Play className="w-4 h-4 mr-2" />
                        Preview
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={renderFinalVideo}
                        disabled={isRendering}
                        className="bg-arena-green hover:bg-arena-green/90"
                      >
                        {isRendering ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        Renderizar Vídeo
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          {/* Upload Section */}
          {!hasProject && (
            <div className="max-w-2xl mx-auto">
              <VideoUploadZone
                onUpload={uploadVideo}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                status={uploadStatus}
              />
            </div>
          )}

          {/* Analyzing State */}
          {hasProject && isAnalyzing && (
            <div className="flex items-center justify-center py-16">
              <SoccerBallLoader 
                message="Analisando vídeo com IA..." 
                progress={50}
                showProgress
              />
            </div>
          )}

          {/* Editor Section */}
          {hasProject && isReady && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Panel - Clips */}
              <div className="lg:col-span-2 space-y-6">
                <Tabs defaultValue="clips">
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="clips">Clips ({clips.length})</TabsTrigger>
                    <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
                  </TabsList>

                  <TabsContent value="clips" className="mt-4">
                    <ClipsList
                      clips={clips}
                      onToggleClip={toggleClip}
                    />
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-4">
                    <VideoTimeline
                      clips={clips}
                      settings={{
                        channelName: settings.channelName,
                        openingText: settings.openingText,
                        transitionText: settings.transitionText,
                        closingText: settings.closingText
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right Panel - Settings */}
              <div>
                <VignetteSettings
                  settings={settings}
                  onSettingsChange={updateSettings}
                />
              </div>
            </div>
          )}

          {/* Rendering Progress */}
          {isRendering && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full mx-4">
                <SoccerBallLoader
                  message={renderProgress.message}
                  progress={renderProgress.progress}
                  showProgress
                />
              </div>
            </div>
          )}

          {/* Final Video Result */}
          {finalVideoUrl && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-card border border-border rounded-xl p-6 max-w-3xl w-full mx-4">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  Vídeo Renderizado!
                </h3>
                <video
                  src={finalVideoUrl}
                  controls
                  className="w-full rounded-lg mb-4"
                />
                <div className="flex gap-2">
                  <a href={finalVideoUrl} download className="flex-1">
                    <Button className="w-full bg-arena-green hover:bg-arena-green/90">
                      <Download className="w-4 h-4 mr-2" />
                      Download MP4
                    </Button>
                  </a>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowPreview(false);
                      reset();
                    }}
                  >
                    Novo Projeto
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Preview Modal */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none">
            {previewPlaying && (
              <CSSVignette
                type="opening"
                text={settings.openingText}
                channelName={settings.channelName}
                duration={3}
                onComplete={() => setPreviewPlaying(false)}
              />
            )}
            {!previewPlaying && (
              <div className="bg-card p-6 rounded-lg text-center">
                <p className="text-foreground mb-4">Preview da vinheta de abertura concluído</p>
                <Button onClick={() => setShowPreview(false)}>Fechar</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default SmartEditor;
