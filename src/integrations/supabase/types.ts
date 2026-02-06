export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_prompts: {
        Row: {
          ai_model: string
          category: string
          default_model: string
          default_value: string
          description: string | null
          id: string
          is_default: boolean
          prompt_key: string
          prompt_name: string
          prompt_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_model: string
          category?: string
          default_model: string
          default_value: string
          description?: string | null
          id?: string
          is_default?: boolean
          prompt_key: string
          prompt_name: string
          prompt_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_model?: string
          category?: string
          default_model?: string
          default_value?: string
          description?: string | null
          id?: string
          is_default?: boolean
          prompt_key?: string
          prompt_name?: string
          prompt_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      analysis_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_message: string | null
          id: string
          match_id: string
          progress: number | null
          result: Json | null
          started_at: string | null
          status: string | null
          video_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          match_id: string
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          video_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          match_id?: string
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      api_settings: {
        Row: {
          created_at: string
          id: string
          is_encrypted: boolean | null
          setting_key: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_encrypted?: boolean | null
          setting_key: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_encrypted?: boolean | null
          setting_key?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_conversations: {
        Row: {
          created_at: string
          id: string
          match_id: string
          messages: Json
          team_name: string
          team_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          messages?: Json
          team_name: string
          team_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          messages?: Json
          team_name?: string
          team_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          match_id: string | null
          organization_id: string | null
          stripe_payment_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          match_id?: string | null
          organization_id?: string | null
          stripe_payment_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          match_id?: string | null
          organization_id?: string | null
          stripe_payment_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_audio: {
        Row: {
          audio_type: string
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          match_id: string
          script: string | null
          updated_at: string
          voice: string | null
        }
        Insert: {
          audio_type: string
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          match_id: string
          script?: string | null
          updated_at?: string
          voice?: string | null
        }
        Update: {
          audio_type?: string
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          match_id?: string
          script?: string | null
          updated_at?: string
          voice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_audio_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          clip_pending: boolean | null
          clip_url: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          is_highlight: boolean | null
          match_half: string | null
          match_id: string
          metadata: Json | null
          minute: number | null
          player_id: string | null
          position_x: number | null
          position_y: number | null
          second: number | null
          video_id: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          clip_pending?: boolean | null
          clip_url?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          is_highlight?: boolean | null
          match_half?: string | null
          match_id: string
          metadata?: Json | null
          minute?: number | null
          player_id?: string | null
          position_x?: number | null
          position_y?: number | null
          second?: number | null
          video_id?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          clip_pending?: boolean | null
          clip_url?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          is_highlight?: boolean | null
          match_half?: string | null
          match_id?: string
          metadata?: Json | null
          minute?: number | null
          player_id?: string | null
          position_x?: number | null
          position_y?: number | null
          second?: number | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          competition: string | null
          created_at: string
          home_score: number | null
          home_team_id: string | null
          id: string
          match_date: string | null
          organization_id: string | null
          score_locked: boolean | null
          status: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          competition?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_date?: string | null
          organization_id?: string | null
          score_locked?: boolean | null
          status?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          competition?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_date?: string | null
          organization_id?: string | null
          score_locked?: boolean | null
          status?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          id: string
          organization_id: string | null
          role: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          organization_id?: string | null
          role?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          role?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          organization_id: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          credits_balance: number | null
          credits_monthly_quota: number | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          owner_id: string | null
          plan_id: string | null
          slug: string
          storage_limit_bytes: number | null
          storage_used_bytes: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_balance?: number | null
          credits_monthly_quota?: number | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          plan_id?: string | null
          slug: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_balance?: number | null
          credits_monthly_quota?: number | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          plan_id?: string | null
          slug?: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          id: string
          name: string
          number: number | null
          photo_url: string | null
          position: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          number?: number | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          number?: number | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          actual_duration_seconds: number | null
          clip_ids: string[]
          closing_duration_ms: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          format: string | null
          id: string
          include_closing: boolean | null
          include_opening: boolean | null
          include_transitions: boolean | null
          match_id: string | null
          name: string
          opening_duration_ms: number | null
          status: string | null
          target_duration_seconds: number
          team_id: string | null
          thumbnail_url: string | null
          transition_duration_ms: number | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          actual_duration_seconds?: number | null
          clip_ids: string[]
          closing_duration_ms?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          format?: string | null
          id?: string
          include_closing?: boolean | null
          include_opening?: boolean | null
          include_transitions?: boolean | null
          match_id?: string | null
          name: string
          opening_duration_ms?: number | null
          status?: string | null
          target_duration_seconds?: number
          team_id?: string | null
          thumbnail_url?: string | null
          transition_duration_ms?: number | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          actual_duration_seconds?: number | null
          clip_ids?: string[]
          closing_duration_ms?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          format?: string | null
          id?: string
          include_closing?: boolean | null
          include_opening?: boolean | null
          include_transitions?: boolean | null
          match_id?: string | null
          name?: string
          opening_duration_ms?: number | null
          status?: string | null
          target_duration_seconds?: number
          team_id?: string | null
          thumbnail_url?: string | null
          transition_duration_ms?: number | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlists_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits_balance: number | null
          credits_monthly_quota: number | null
          display_name: string | null
          email: string | null
          id: string
          organization_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number | null
          credits_monthly_quota?: number | null
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number | null
          credits_monthly_quota?: number | null
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_edit_clips: {
        Row: {
          confidence: number | null
          created_at: string | null
          end_second: number
          event_type: string | null
          id: string
          is_enabled: boolean | null
          project_id: string | null
          sort_order: number | null
          start_second: number
          title: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          end_second: number
          event_type?: string | null
          id?: string
          is_enabled?: boolean | null
          project_id?: string | null
          sort_order?: number | null
          start_second: number
          title?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          end_second?: number
          event_type?: string | null
          id?: string
          is_enabled?: boolean | null
          project_id?: string | null
          sort_order?: number | null
          start_second?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_edit_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "smart_edit_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_edit_projects: {
        Row: {
          created_at: string | null
          id: string
          language: string | null
          source_video_url: string
          status: string | null
          title: string
          transcription: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          language?: string | null
          source_video_url: string
          status?: string | null
          title: string
          transcription?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          language?: string | null
          source_video_url?: string
          status?: string | null
          title?: string
          transcription?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      smart_edit_renders: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          progress: number | null
          project_id: string | null
          status: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          progress?: number | null
          project_id?: string | null
          status?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          progress?: number | null
          project_id?: string | null
          status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_edit_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "smart_edit_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_edit_settings: {
        Row: {
          channel_name: string | null
          closing_text: string | null
          created_at: string | null
          cut_intensity: string | null
          id: string
          max_clip_duration: number | null
          max_clips: number | null
          min_clip_duration: number | null
          opening_text: string | null
          project_id: string | null
          transition_text: string | null
        }
        Insert: {
          channel_name?: string | null
          closing_text?: string | null
          created_at?: string | null
          cut_intensity?: string | null
          id?: string
          max_clip_duration?: number | null
          max_clips?: number | null
          min_clip_duration?: number | null
          opening_text?: string | null
          project_id?: string | null
          transition_text?: string | null
        }
        Update: {
          channel_name?: string | null
          closing_text?: string | null
          created_at?: string | null
          cut_intensity?: string | null
          id?: string
          max_clip_duration?: number | null
          max_clips?: number | null
          min_clip_duration?: number | null
          opening_text?: string | null
          project_id?: string | null
          transition_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_edit_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "smart_edit_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      social_campaigns: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          tags: string[] | null
          target_platforms: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          target_platforms?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          target_platforms?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_sync_at: string | null
          platform: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_at?: string | null
          platform: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_at?: string | null
          platform?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_scheduled_posts: {
        Row: {
          campaign_id: string | null
          content: string
          created_at: string | null
          error_message: string | null
          event_id: string | null
          external_post_id: string | null
          id: string
          match_id: string | null
          media_type: string | null
          media_url: string | null
          platform: string
          published_at: string | null
          scheduled_at: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          content: string
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          external_post_id?: string | null
          id?: string
          match_id?: string | null
          media_type?: string | null
          media_url?: string | null
          platform: string
          published_at?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          content?: string
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          external_post_id?: string | null
          id?: string
          match_id?: string | null
          media_type?: string | null
          media_url?: string | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_scheduled_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_configurations: {
        Row: {
          audio_channels: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          match_id: string | null
          ntp_last_sync: string | null
          ntp_offset_ms: number | null
          ntp_server: string | null
          stream_url: string
          updated_at: string | null
          validation_errors: Json | null
          validation_status: string | null
          video_aspect_ratio: string | null
          video_bitrate: number | null
          video_codec: string | null
          video_frame_rate: number | null
          video_resolution: string | null
          video_scan_type: string | null
        }
        Insert: {
          audio_channels?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_id?: string | null
          ntp_last_sync?: string | null
          ntp_offset_ms?: number | null
          ntp_server?: string | null
          stream_url: string
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
          video_aspect_ratio?: string | null
          video_bitrate?: number | null
          video_codec?: string | null
          video_frame_rate?: number | null
          video_resolution?: string | null
          video_scan_type?: string | null
        }
        Update: {
          audio_channels?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_id?: string | null
          ntp_last_sync?: string | null
          ntp_offset_ms?: number | null
          ntp_server?: string | null
          stream_url?: string
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
          video_aspect_ratio?: string | null
          video_bitrate?: number | null
          video_codec?: string | null
          video_frame_rate?: number | null
          video_resolution?: string | null
          video_scan_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_configurations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          credits_per_month: number
          features: Json | null
          id: string
          is_active: boolean | null
          max_matches_per_month: number | null
          max_users: number | null
          name: string
          price_monthly: number
          price_yearly: number | null
          slug: string
          sort_order: number | null
          storage_limit_bytes: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
        }
        Insert: {
          created_at?: string | null
          credits_per_month?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_matches_per_month?: number | null
          max_users?: number | null
          name: string
          price_monthly?: number
          price_yearly?: number | null
          slug: string
          sort_order?: number | null
          storage_limit_bytes?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Update: {
          created_at?: string | null
          credits_per_month?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_matches_per_month?: number | null
          max_users?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          slug?: string
          sort_order?: number | null
          storage_limit_bytes?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          secondary_color: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnails: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          image_url: string
          match_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          image_url: string
          match_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          image_url?: string
          match_id?: string
          title?: string | null
        }
        Relationships: []
      }
      user_payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          credits_added: number | null
          error_message: string | null
          id: string
          payment_method: string
          pix_code: string | null
          pix_expiration: string | null
          pix_qr_code: string | null
          status: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          credits_added?: number | null
          error_message?: string | null
          id?: string
          payment_method: string
          pix_code?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          credits_added?: number | null
          error_message?: string | null
          id?: string
          payment_method?: string
          pix_code?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          end_minute: number | null
          file_name: string | null
          file_url: string
          id: string
          match_id: string | null
          start_minute: number | null
          status: string | null
          video_type: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          end_minute?: number | null
          file_name?: string | null
          file_url: string
          id?: string
          match_id?: string | null
          start_minute?: number | null
          status?: string | null
          video_type?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          end_minute?: number | null
          file_name?: string | null
          file_url?: string
          id?: string
          match_id?: string | null
          start_minute?: number | null
          status?: string | null
          video_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage: { Args: never; Returns: boolean }
      can_upload: { Args: never; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_org_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
