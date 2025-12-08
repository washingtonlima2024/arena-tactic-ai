-- Create table for chatbot conversations
CREATE TABLE public.chatbot_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  team_name TEXT NOT NULL,
  team_type TEXT NOT NULL CHECK (team_type IN ('home', 'away')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id, team_type)
);

-- Enable RLS
ALTER TABLE public.chatbot_conversations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read on chatbot_conversations" 
ON public.chatbot_conversations 
FOR SELECT USING (true);

CREATE POLICY "Allow public insert on chatbot_conversations" 
ON public.chatbot_conversations 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on chatbot_conversations" 
ON public.chatbot_conversations 
FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on chatbot_conversations" 
ON public.chatbot_conversations 
FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_chatbot_conversations_updated_at
BEFORE UPDATE ON public.chatbot_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Also add unique constraint for generated_audio upsert to work properly
ALTER TABLE public.generated_audio ADD CONSTRAINT generated_audio_match_type_voice_unique 
UNIQUE (match_id, audio_type, voice);