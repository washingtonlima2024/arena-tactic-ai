import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SmartClip } from '@/components/smart-editor/ClipsList';
import { SmartEditorSettings } from '@/components/smart-editor/VignetteSettings';

interface SmartProject {
  id: string;
  title: string;
  source_video_url: string;
  transcription: string | null;
  status: string;
  language: string;
}

export const useSmartVideoEditor = () => {
  const [project, setProject] = useState<SmartProject | null>(null);
  const [clips, setClips] = useState<SmartClip[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [settings, setSettings] = useState<SmartEditorSettings>({
    channelName: 'Meu Canal',
    openingText: 'Bem-vindo!',
    transitionText: 'Oferecimento',
    closingText: 'Até o próximo vídeo!',
    language: 'pt',
    minClipDuration: 5,
    maxClipDuration: 60,
    maxClips: 10,
    cutIntensity: 'medium'
  });

  const uploadVideo = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Iniciando upload...');

    try {
      // Create project first
      const { data: projectData, error: projectError } = await supabase
        .from('smart_edit_projects')
        .insert({
          title: file.name.replace(/\.[^/.]+$/, ''),
          source_video_url: '',
          status: 'uploading',
          language: settings.language
        })
        .select()
        .single();

      if (projectError) throw projectError;

      setUploadStatus('Enviando vídeo...');
      
      // Upload to storage
      const filePath = `${projectData.id}/${file.name}`;
      
      // Simulate progress since Supabase storage doesn't support onUploadProgress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);
      
      const { error: uploadError } = await supabase.storage
        .from('smart-editor')
        .upload(filePath, file);

      clearInterval(progressInterval);
      setUploadProgress(95);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('smart-editor')
        .getPublicUrl(filePath);

      // Update project with video URL
      const { error: updateError } = await supabase
        .from('smart_edit_projects')
        .update({
          source_video_url: urlData.publicUrl,
          status: 'uploaded'
        })
        .eq('id', projectData.id);

      if (updateError) throw updateError;

      // Create default settings
      await supabase
        .from('smart_edit_settings')
        .insert({
          project_id: projectData.id,
          channel_name: settings.channelName,
          opening_text: settings.openingText,
          transition_text: settings.transitionText,
          closing_text: settings.closingText,
          min_clip_duration: settings.minClipDuration,
          max_clip_duration: settings.maxClipDuration,
          max_clips: settings.maxClips,
          cut_intensity: settings.cutIntensity
        });

      setProject({
        ...projectData,
        source_video_url: urlData.publicUrl,
        status: 'uploaded'
      });

      setUploadStatus('Upload concluído!');
      toast.success('Vídeo enviado com sucesso!');

      // Auto-start analysis
      await analyzeVideo(projectData.id, urlData.publicUrl);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar vídeo');
      setUploadStatus('Erro no upload');
    } finally {
      setIsUploading(false);
    }
  }, [settings]);

  const analyzeVideo = useCallback(async (projectId: string, videoUrl: string) => {
    setIsAnalyzing(true);
    setUploadStatus('Analisando vídeo com IA...');

    try {
      // Update project status
      await supabase
        .from('smart_edit_projects')
        .update({ status: 'analyzing' })
        .eq('id', projectId);

      // Call edge function for analysis
      const { data, error } = await supabase.functions.invoke('analyze-smart-video', {
        body: {
          projectId,
          videoUrl,
          language: settings.language,
          minClipDuration: settings.minClipDuration,
          maxClipDuration: settings.maxClipDuration,
          maxClips: settings.maxClips,
          cutIntensity: settings.cutIntensity
        }
      });

      if (error) throw error;

      // Load clips from database
      const { data: clipsData, error: clipsError } = await supabase
        .from('smart_edit_clips')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      if (clipsError) throw clipsError;

      setClips(clipsData || []);

      // Update project status
      await supabase
        .from('smart_edit_projects')
        .update({ 
          status: 'ready',
          transcription: data?.transcription || null
        })
        .eq('id', projectId);

      if (project) {
        setProject({ ...project, status: 'ready', transcription: data?.transcription });
      }

      setUploadStatus('Análise concluída!');
      toast.success(`${clipsData?.length || 0} clips detectados!`);

    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Erro na análise do vídeo');
      setUploadStatus('Erro na análise');
    } finally {
      setIsAnalyzing(false);
    }
  }, [settings, project]);

  const toggleClip = useCallback(async (clipId: string, enabled: boolean) => {
    setClips(prev => 
      prev.map(clip => 
        clip.id === clipId ? { ...clip, is_enabled: enabled } : clip
      )
    );

    await supabase
      .from('smart_edit_clips')
      .update({ is_enabled: enabled })
      .eq('id', clipId);
  }, []);

  const updateSettings = useCallback((newSettings: SmartEditorSettings) => {
    setSettings(newSettings);
    
    // Update in database if project exists
    if (project?.id) {
      supabase
        .from('smart_edit_settings')
        .update({
          channel_name: newSettings.channelName,
          opening_text: newSettings.openingText,
          transition_text: newSettings.transitionText,
          closing_text: newSettings.closingText,
          min_clip_duration: newSettings.minClipDuration,
          max_clip_duration: newSettings.maxClipDuration,
          max_clips: newSettings.maxClips,
          cut_intensity: newSettings.cutIntensity
        })
        .eq('project_id', project.id);
    }
  }, [project]);

  const reset = useCallback(() => {
    setProject(null);
    setClips([]);
    setUploadProgress(0);
    setUploadStatus('');
  }, []);

  return {
    project,
    clips,
    settings,
    isUploading,
    uploadProgress,
    uploadStatus,
    isAnalyzing,
    uploadVideo,
    toggleClip,
    updateSettings,
    reset
  };
};

export default useSmartVideoEditor;
