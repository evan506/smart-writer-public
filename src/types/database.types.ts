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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          chapter_id: string
          created_at: string
          entity_count: number | null
          error: string | null
          finished_at: string | null
          id: string
          project_id: string
          relation_count: number | null
          started_at: string | null
          status: string
          suggestion_count: number | null
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          entity_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          project_id: string
          relation_count?: number | null
          started_at?: string | null
          status?: string
          suggestion_count?: number | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          entity_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          project_id?: string
          relation_count?: number | null
          started_at?: string | null
          status?: string
          suggestion_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_fact_sources: {
        Row: {
          chapter_id: string | null
          chunk_id: string | null
          created_at: string
          evidence_kind: string
          evidence_text: string | null
          fact_id: string
          id: string
        }
        Insert: {
          chapter_id?: string | null
          chunk_id?: string | null
          created_at?: string
          evidence_kind?: string
          evidence_text?: string | null
          fact_id: string
          id?: string
        }
        Update: {
          chapter_id?: string | null
          chunk_id?: string | null
          created_at?: string
          evidence_kind?: string
          evidence_text?: string | null
          fact_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_fact_sources_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_fact_sources_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_fact_sources_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "canon_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_facts: {
        Row: {
          approved_at: string | null
          confidence: number
          created_at: string
          entity_id: string
          established_chapter_id: string | null
          fact_key: string | null
          fact_type: string
          id: string
          project_id: string
          status: string
          superseded_by: string | null
          updated_at: string
          valid_from_chapter_id: string | null
          valid_until_chapter_id: string | null
          value: string
          value_structured: Json | null
        }
        Insert: {
          approved_at?: string | null
          confidence?: number
          created_at?: string
          entity_id: string
          established_chapter_id?: string | null
          fact_key?: string | null
          fact_type: string
          id?: string
          project_id: string
          status?: string
          superseded_by?: string | null
          updated_at?: string
          valid_from_chapter_id?: string | null
          valid_until_chapter_id?: string | null
          value: string
          value_structured?: Json | null
        }
        Update: {
          approved_at?: string | null
          confidence?: number
          created_at?: string
          entity_id?: string
          established_chapter_id?: string | null
          fact_key?: string | null
          fact_type?: string
          id?: string
          project_id?: string
          status?: string
          superseded_by?: string | null
          updated_at?: string
          valid_from_chapter_id?: string | null
          valid_until_chapter_id?: string | null
          value?: string
          value_structured?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canon_facts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_facts_established_chapter_id_fkey"
            columns: ["established_chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_facts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "canon_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_facts_valid_from_chapter_id_fkey"
            columns: ["valid_from_chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_facts_valid_until_chapter_id_fkey"
            columns: ["valid_until_chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          arc_summary: string | null
          chapter_num: number
          content: string | null
          created_at: string | null
          id: string
          project_id: string
          summary: string | null
          title: string | null
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          arc_summary?: string | null
          chapter_num: number
          content?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          arc_summary?: string | null
          chapter_num?: number
          content?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string | null
          id: string
          meta: Json | null
          persona_id: string
          project_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          meta?: Json | null
          persona_id: string
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          meta?: Json | null
          persona_id?: string
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_persona_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          context_marker: string | null
          conversation_id: string
          created_at: string | null
          embedding: string | null
          emotion_key: string | null
          id: string
          latency_ms: number | null
          model: string | null
          role: string
          token_count: number | null
        }
        Insert: {
          content: string
          context_marker?: string | null
          conversation_id: string
          created_at?: string | null
          embedding?: string | null
          emotion_key?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          role: string
          token_count?: number | null
        }
        Update: {
          content?: string
          context_marker?: string | null
          conversation_id?: string
          created_at?: string | null
          embedding?: string | null
          emotion_key?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          role?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          chapter_id: string
          content: string
          created_at: string | null
          embedding: string | null
          entity_tags: Json | null
          id: string
          position: number | null
          summary: string | null
          type: string
        }
        Insert: {
          chapter_id: string
          content: string
          created_at?: string | null
          embedding?: string | null
          entity_tags?: Json | null
          id?: string
          position?: number | null
          summary?: string | null
          type: string
        }
        Update: {
          chapter_id?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          entity_tags?: Json | null
          id?: string
          position?: number | null
          summary?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          aliases: Json | null
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          name: string
          project_id: string
          summary: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          aliases?: Json | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          name: string
          project_id: string
          summary?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          aliases?: Json | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          project_id?: string
          summary?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_links: {
        Row: {
          created_at: string | null
          description: string | null
          direction: string | null
          from_id: string
          id: string
          relation_type: string
          to_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          direction?: string | null
          from_id: string
          id?: string
          relation_type: string
          to_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          direction?: string | null
          from_id?: string
          id?: string
          relation_type?: string
          to_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_links_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_links_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_suggestions: {
        Row: {
          aliases: Json | null
          chapter_id: string
          confidence: number
          context_snippet: string | null
          created_at: string | null
          id: string
          matched_entity_id: string | null
          name: string
          project_id: string
          status: string
          suggested_action: string | null
          summary: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          aliases?: Json | null
          chapter_id: string
          confidence?: number
          context_snippet?: string | null
          created_at?: string | null
          id?: string
          matched_entity_id?: string | null
          name: string
          project_id: string
          status?: string
          suggested_action?: string | null
          summary?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          aliases?: Json | null
          chapter_id?: string
          confidence?: number
          context_snippet?: string | null
          created_at?: string | null
          id?: string
          matched_entity_id?: string | null
          name?: string
          project_id?: string
          status?: string
          suggested_action?: string | null
          summary?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_suggestions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_suggestions_matched_entity_id_fkey"
            columns: ["matched_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_memory: {
        Row: {
          created_at: string
          evidence: Json | null
          id: string
          kind: string
          project_id: string
          rule_key: string
          rule_text: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence?: Json | null
          id?: string
          kind: string
          project_id: string
          rule_key: string
          rule_text: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence?: Json | null
          id?: string
          kind?: string
          project_id?: string
          rule_key?: string
          rule_text?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_suggestions: {
        Row: {
          chapter_id: string
          confidence: number
          created_at: string
          entity_suggestion_id: string | null
          evidence_text: string | null
          fact_key: string | null
          fact_type: string
          id: string
          matched_entity_id: string | null
          project_id: string
          resulting_fact_id: string | null
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          chapter_id: string
          confidence?: number
          created_at?: string
          entity_suggestion_id?: string | null
          evidence_text?: string | null
          fact_key?: string | null
          fact_type: string
          id?: string
          matched_entity_id?: string | null
          project_id: string
          resulting_fact_id?: string | null
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          chapter_id?: string
          confidence?: number
          created_at?: string
          entity_suggestion_id?: string | null
          evidence_text?: string | null
          fact_key?: string | null
          fact_type?: string
          id?: string
          matched_entity_id?: string | null
          project_id?: string
          resulting_fact_id?: string | null
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_suggestions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_suggestions_entity_suggestion_id_fkey"
            columns: ["entity_suggestion_id"]
            isOneToOne: false
            referencedRelation: "entity_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_suggestions_matched_entity_id_fkey"
            columns: ["matched_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_suggestions_resulting_fact_id_fkey"
            columns: ["resulting_fact_id"]
            isOneToOne: false
            referencedRelation: "canon_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      foreshadows: {
        Row: {
          created_at: string | null
          description: string | null
          entity_ids: string[] | null
          expected_reveal: number | null
          id: string
          planted_chapter: number
          project_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          entity_ids?: string[] | null
          expected_reveal?: number | null
          id?: string
          planted_chapter: number
          project_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          entity_ids?: string[] | null
          expected_reveal?: number | null
          id?: string
          planted_chapter?: number
          project_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foreshadows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      genre_kits: {
        Row: {
          created_at: string | null
          genre_type: string
          id: string
          is_public: boolean
          name: string
          rules: Json | null
          templates: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          genre_type: string
          id?: string
          is_public?: boolean
          name: string
          rules?: Json | null
          templates?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          genre_type?: string
          id?: string
          is_public?: boolean
          name?: string
          rules?: Json | null
          templates?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      llm_usage_logs: {
        Row: {
          cached_prompt_tokens: number | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          error_type: string | null
          feature: string
          id: string
          latency_ms: number | null
          model: string
          project_id: string
          prompt_template_key: string | null
          prompt_template_version: string | null
          prompt_tokens: number | null
          provider: string
          provider_response_id: string | null
          raw_usage: Json
          reasoning_tokens: number | null
          retry_count: number
          status: string
          timed_out: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cached_prompt_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          error_type?: string | null
          feature: string
          id?: string
          latency_ms?: number | null
          model: string
          project_id: string
          prompt_template_key?: string | null
          prompt_template_version?: string | null
          prompt_tokens?: number | null
          provider?: string
          provider_response_id?: string | null
          raw_usage?: Json
          reasoning_tokens?: number | null
          retry_count?: number
          status: string
          timed_out?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cached_prompt_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          error_type?: string | null
          feature?: string
          id?: string
          latency_ms?: number | null
          model?: string
          project_id?: string
          prompt_template_key?: string | null
          prompt_template_version?: string | null
          prompt_tokens?: number | null
          provider?: string
          provider_response_id?: string | null
          raw_usage?: Json
          reasoning_tokens?: number | null
          retry_count?: number
          status?: string
          timed_out?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          chunk_id: string
          count: number | null
          entity_id: string
          id: string
          last_mentioned_at: string | null
        }
        Insert: {
          chunk_id: string
          count?: number | null
          entity_id: string
          id?: string
          last_mentioned_at?: string | null
        }
        Update: {
          chunk_id?: string
          count?: number | null
          entity_id?: string
          id?: string
          last_mentioned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          avatar_url: string | null
          background: string | null
          chat_active: boolean | null
          created_at: string | null
          description: string | null
          emotion_images: Json | null
          entity_id: string | null
          greeting_message: string | null
          id: string
          name: string
          personality: string | null
          system_prompt: string | null
          tone: string | null
          updated_at: string | null
          user_id: string
          world_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          background?: string | null
          chat_active?: boolean | null
          created_at?: string | null
          description?: string | null
          emotion_images?: Json | null
          entity_id?: string | null
          greeting_message?: string | null
          id?: string
          name: string
          personality?: string | null
          system_prompt?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id: string
          world_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          background?: string | null
          chat_active?: boolean | null
          created_at?: string | null
          description?: string | null
          emotion_images?: Json | null
          entity_id?: string | null
          greeting_message?: string | null
          id?: string
          name?: string
          personality?: string | null
          system_prompt?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id?: string
          world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_entity_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_world_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_blocks: {
        Row: {
          created_at: string
          id: string
          kind: string
          notes: string | null
          parent_id: string | null
          position: number
          project_id: string
          status: string
          structure_key: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          notes?: string | null
          parent_id?: string | null
          position?: number
          project_id: string
          status?: string
          structure_key?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          parent_id?: string | null
          position?: number
          project_id?: string
          status?: string
          structure_key?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_blocks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_links: {
        Row: {
          created_at: string
          id: string
          link_kind: string
          planning_block_id: string
          project_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_kind: string
          planning_block_id: string
          project_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          link_kind?: string
          planning_block_id?: string
          project_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_links_planning_block_id_fkey"
            columns: ["planning_block_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_thread_chapters: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          plot_thread_id: string
          project_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          plot_thread_id: string
          project_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          plot_thread_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_thread_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_thread_chapters_plot_thread_id_fkey"
            columns: ["plot_thread_id"]
            isOneToOne: false
            referencedRelation: "plot_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_thread_chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_thread_planning_blocks: {
        Row: {
          created_at: string
          id: string
          planning_block_id: string
          plot_thread_id: string
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          planning_block_id: string
          plot_thread_id: string
          position?: number
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          planning_block_id?: string
          plot_thread_id?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_thread_planning_blocks_planning_block_id_fkey"
            columns: ["planning_block_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_thread_planning_blocks_plot_thread_id_fkey"
            columns: ["plot_thread_id"]
            isOneToOne: false
            referencedRelation: "plot_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_thread_planning_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_threads: {
        Row: {
          created_at: string
          id: string
          position: number
          project_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          project_id: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          project_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          excluded_terms: Json | null
          genre: string | null
          id: string
          metadata: Json | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          excluded_terms?: Json | null
          genre?: string | null
          id?: string
          metadata?: Json | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          excluded_terms?: Json | null
          genre?: string | null
          id?: string
          metadata?: Json | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      rag_logs: {
        Row: {
          cited_entities: string[] | null
          created_at: string | null
          final_response: string | null
          id: string
          latency_ms: number | null
          mode_classification: string | null
          project_id: string
          query_original: string | null
          query_rewrites: Json | null
          reranked_top_8: Json | null
          search_results_top_n: Json | null
        }
        Insert: {
          cited_entities?: string[] | null
          created_at?: string | null
          final_response?: string | null
          id?: string
          latency_ms?: number | null
          mode_classification?: string | null
          project_id: string
          query_original?: string | null
          query_rewrites?: Json | null
          reranked_top_8?: Json | null
          search_results_top_n?: Json | null
        }
        Update: {
          cited_entities?: string[] | null
          created_at?: string | null
          final_response?: string | null
          id?: string
          latency_ms?: number | null
          mode_classification?: string | null
          project_id?: string
          query_original?: string | null
          query_rewrites?: Json | null
          reranked_top_8?: Json | null
          search_results_top_n?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_relationship: {
        Args: { entity_a: string; entity_b: string }
        Returns: {
          depth: number
          path: string[]
          relation_types: string[]
        }[]
      }
      detect_conflicts: {
        Args: { p_chapter_id: string }
        Returns: {
          conflict_type: string
          detail: string
          entity_id: string
          entity_name: string
        }[]
      }
      find_related_entities: {
        Args: { max_depth?: number; target_entity_id: string }
        Returns: {
          cumulative_weight: number
          depth: number
          entity_id: string
          entity_name: string
          entity_type: string
          path: string[]
          relation_type: string
        }[]
      }
      get_entity_context: {
        Args: { target_entity_id: string }
        Returns: {
          aliases: Json
          entity_id: string
          name: string
          related_id: string
          related_name: string
          related_summary: string
          related_type: string
          relation_direction: string
          relation_type: string
          relation_weight: number
          summary: string
          type: string
        }[]
      }
      match_chat_messages: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_conversation_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          emotion_key: string
          id: string
          role: string
          similarity: number
        }[]
      }
      match_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_chunk_types?: string[]
          p_project_id?: string
          query_embedding: string
        }
        Returns: {
          chapter_id: string
          content: string
          entity_tags: Json
          id: string
          position: number
          similarity: number
          summary: string
          type: string
        }[]
      }
      list_pending_fact_review_items: {
        Args: { p_project_id: string }
        Returns: {
          approval_mode: string
          can_approve: boolean
          chapter_id: string
          chapter_num: number | null
          chapter_title: string | null
          confidence: number
          entity_id: string | null
          entity_name: string | null
          entity_suggestion_id: string | null
          entity_suggestion_name: string | null
          evidence_text: string | null
          conflicting_fact_id: string | null
          conflicting_value: string | null
          existing_fact_id: string | null
          existing_source_count: number
          fact_key: string | null
          fact_type: string
          id: string
          project_id: string
          value: string
        }[]
      }
      search_chapters_bm25: {
        Args: { p_limit?: number; p_project_id: string; p_query: string }
        Returns: {
          chapter_num: number
          content: string
          id: string
          rank: number
          summary: string
          title: string
        }[]
      }
      search_entities_bm25: {
        Args: { p_limit?: number; p_project_id: string; p_query: string }
        Returns: {
          description: string
          id: string
          name: string
          rank: number
          settings: Json
          type: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
