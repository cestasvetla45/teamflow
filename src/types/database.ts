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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _applied_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      account_assignments: {
        Row: {
          account_handle: string
          assigned_at: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          unassigned_at: string | null
          va_name: string
        }
        Insert: {
          account_handle: string
          assigned_at?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          unassigned_at?: string | null
          va_name: string
        }
        Update: {
          account_handle?: string
          assigned_at?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          unassigned_at?: string | null
          va_name?: string
        }
        Relationships: []
      }
      account_snapshots: {
        Row: {
          account_handle: string
          followers: number | null
          id: string
          reel_count: number | null
          snapshot_at: string | null
          total_views: number | null
        }
        Insert: {
          account_handle: string
          followers?: number | null
          id?: string
          reel_count?: number | null
          snapshot_at?: string | null
          total_views?: number | null
        }
        Update: {
          account_handle?: string
          followers?: number | null
          id?: string
          reel_count?: number | null
          snapshot_at?: string | null
          total_views?: number | null
        }
        Relationships: []
      }
      agency_creators: {
        Row: {
          avatar: string | null
          chatting_pointers: string | null
          content_types: string[]
          created_at: string
          creator_view_token: string
          currency: string
          id: string
          label: string
          late_penalty_cents: number | null
          notes: string | null
          of_account_id: string | null
          org_id: string
          pay_type: Database["public"]["Enums"]["creator_pay_type"]
          percentage_rate_bps: number | null
          platforms: string[]
          salary_amount_cents: number | null
          salary_period:
            | Database["public"]["Enums"]["creator_salary_period"]
            | null
          share_enabled: boolean
          share_token: string
          updated_at: string
          voice_persona: string | null
          withdrawal_fee_bps: number
        }
        Insert: {
          avatar?: string | null
          chatting_pointers?: string | null
          content_types?: string[]
          created_at?: string
          creator_view_token: string
          currency?: string
          id?: string
          label: string
          late_penalty_cents?: number | null
          notes?: string | null
          of_account_id?: string | null
          org_id: string
          pay_type?: Database["public"]["Enums"]["creator_pay_type"]
          percentage_rate_bps?: number | null
          platforms?: string[]
          salary_amount_cents?: number | null
          salary_period?:
            | Database["public"]["Enums"]["creator_salary_period"]
            | null
          share_enabled?: boolean
          share_token: string
          updated_at?: string
          voice_persona?: string | null
          withdrawal_fee_bps?: number
        }
        Update: {
          avatar?: string | null
          chatting_pointers?: string | null
          content_types?: string[]
          created_at?: string
          creator_view_token?: string
          currency?: string
          id?: string
          label?: string
          late_penalty_cents?: number | null
          notes?: string | null
          of_account_id?: string | null
          org_id?: string
          pay_type?: Database["public"]["Enums"]["creator_pay_type"]
          percentage_rate_bps?: number | null
          platforms?: string[]
          salary_amount_cents?: number | null
          salary_period?:
            | Database["public"]["Enums"]["creator_salary_period"]
            | null
          share_enabled?: boolean
          share_token?: string
          updated_at?: string
          voice_persona?: string | null
          withdrawal_fee_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_creators_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_transactions: {
        Row: {
          account: string | null
          amount_cents: number
          attachment_url: string | null
          category: string
          chatter_id: string | null
          created_at: string
          created_by: string
          creator_id: string | null
          currency: string
          fee_amount_cents: number | null
          id: string
          item: string | null
          kind: Database["public"]["Enums"]["transaction_kind"]
          marketing_channel: string | null
          notes: string | null
          occurred_on: string
          org_id: string
          source: string | null
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          account?: string | null
          amount_cents: number
          attachment_url?: string | null
          category: string
          chatter_id?: string | null
          created_at?: string
          created_by: string
          creator_id?: string | null
          currency?: string
          fee_amount_cents?: number | null
          id?: string
          item?: string | null
          kind: Database["public"]["Enums"]["transaction_kind"]
          marketing_channel?: string | null
          notes?: string | null
          occurred_on: string
          org_id: string
          source?: string | null
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          account?: string | null
          amount_cents?: number
          attachment_url?: string | null
          category?: string
          chatter_id?: string | null
          created_at?: string
          created_by?: string
          creator_id?: string | null
          currency?: string
          fee_amount_cents?: number | null
          id?: string
          item?: string | null
          kind?: Database["public"]["Enums"]["transaction_kind"]
          marketing_channel?: string | null
          notes?: string | null
          occurred_on?: string
          org_id?: string
          source?: string | null
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_transactions_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_transactions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "agency_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          password_hash: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          password_hash: string
          role?: string
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          password_hash?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      chatter_payouts: {
        Row: {
          attributed_revenue_cents: number
          chatter_id: string
          created_at: string
          currency: string
          hourly_amount_cents: number
          hourly_rate_cents: number | null
          hours_worked: number
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          paid_by: string | null
          percentage_amount_cents: number
          percentage_rate_bps: number | null
          period_end: string
          period_start: string
          total_amount_cents: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          attributed_revenue_cents?: number
          chatter_id: string
          created_at?: string
          currency?: string
          hourly_amount_cents?: number
          hourly_rate_cents?: number | null
          hours_worked?: number
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_amount_cents?: number
          percentage_rate_bps?: number | null
          period_end: string
          period_start: string
          total_amount_cents?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          attributed_revenue_cents?: number
          chatter_id?: string
          created_at?: string
          currency?: string
          hourly_amount_cents?: number
          hourly_rate_cents?: number | null
          hours_worked?: number
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_amount_cents?: number
          percentage_rate_bps?: number | null
          period_end?: string
          period_start?: string
          total_amount_cents?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_payouts_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "agency_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_shifts: {
        Row: {
          chatter_id: string
          created_at: string
          creator_id: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          end_time_utc: string
          id: string
          notes: string | null
          org_id: string
          start_time_utc: string
        }
        Insert: {
          chatter_id: string
          created_at?: string
          creator_id?: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          end_time_utc: string
          id?: string
          notes?: string | null
          org_id: string
          start_time_utc: string
        }
        Update: {
          chatter_id?: string
          created_at?: string
          creator_id?: string | null
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          end_time_utc?: string
          id?: string
          notes?: string | null
          org_id?: string
          start_time_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_shifts_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_shifts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "agency_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatters: {
        Row: {
          avatar: string | null
          bio: string | null
          created_at: string
          currency: string
          email: string | null
          hourly_rate_cents: number | null
          id: string
          name: string
          notes: string | null
          org_id: string
          pay_type: Database["public"]["Enums"]["chatter_pay_type"]
          percentage_rate_bps: number | null
          status: Database["public"]["Enums"]["chatter_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          hourly_rate_cents?: number | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          pay_type?: Database["public"]["Enums"]["chatter_pay_type"]
          percentage_rate_bps?: number | null
          status?: Database["public"]["Enums"]["chatter_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          hourly_rate_cents?: number | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          pay_type?: Database["public"]["Enums"]["chatter_pay_type"]
          percentage_rate_bps?: number | null
          status?: Database["public"]["Enums"]["chatter_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_insights: {
        Row: {
          account_handle: string | null
          ai_count: number | null
          ai_pct: number | null
          caption: string | null
          comments_analyzed: number | null
          comments_total: number | null
          id: string
          neg_count: number | null
          pos_count: number | null
          reel_url: string
          sample_ai: string[] | null
          sample_neg: string[] | null
          shortcode: string | null
          tells: Json | null
          updated_at: string | null
          views: number | null
        }
        Insert: {
          account_handle?: string | null
          ai_count?: number | null
          ai_pct?: number | null
          caption?: string | null
          comments_analyzed?: number | null
          comments_total?: number | null
          id?: string
          neg_count?: number | null
          pos_count?: number | null
          reel_url: string
          sample_ai?: string[] | null
          sample_neg?: string[] | null
          shortcode?: string | null
          tells?: Json | null
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          account_handle?: string | null
          ai_count?: number | null
          ai_pct?: number | null
          caption?: string | null
          comments_analyzed?: number | null
          comments_total?: number | null
          id?: string
          neg_count?: number | null
          pos_count?: number | null
          reel_url?: string
          sample_ai?: string[] | null
          sample_neg?: string[] | null
          shortcode?: string | null
          tells?: Json | null
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      content_assignments: {
        Row: {
          account_handle: string
          assigned_at: string | null
          brief_id: string | null
          concept_id: string | null
          cooldown_expires_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          posted_at: string | null
          reel_url: string | null
          status: string | null
          va_name: string | null
        }
        Insert: {
          account_handle: string
          assigned_at?: string | null
          brief_id?: string | null
          concept_id?: string | null
          cooldown_expires_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          reel_url?: string | null
          status?: string | null
          va_name?: string | null
        }
        Update: {
          account_handle?: string
          assigned_at?: string | null
          brief_id?: string | null
          concept_id?: string | null
          cooldown_expires_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          reel_url?: string | null
          status?: string | null
          va_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assignments_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "content_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assignments_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "content_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_briefs: {
        Row: {
          airtable_record_id: string | null
          airtable_synced_at: string | null
          concept_id: string | null
          created_at: string | null
          created_by: string | null
          generation_prompt: string | null
          id: string
          notes: string | null
          reference_reel_url: string | null
          reference_thumbnail: string | null
          status: string | null
          title: string
          updated_at: string | null
          variant_label: string | null
        }
        Insert: {
          airtable_record_id?: string | null
          airtable_synced_at?: string | null
          concept_id?: string | null
          created_at?: string | null
          created_by?: string | null
          generation_prompt?: string | null
          id?: string
          notes?: string | null
          reference_reel_url?: string | null
          reference_thumbnail?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          variant_label?: string | null
        }
        Update: {
          airtable_record_id?: string | null
          airtable_synced_at?: string | null
          concept_id?: string | null
          created_at?: string | null
          created_by?: string | null
          generation_prompt?: string | null
          id?: string
          notes?: string | null
          reference_reel_url?: string | null
          reference_thumbnail?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_briefs_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "content_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_calendar_entries: {
        Row: {
          completed_at: string | null
          content_type: string
          created_at: string
          created_by: string
          creator_id: string
          id: string
          link: string | null
          notes: string | null
          org_id: string
          platform: string
          quantity: number
          scheduled_for: string
          status: Database["public"]["Enums"]["calendar_status"]
          time_hint: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          content_type: string
          created_at?: string
          created_by: string
          creator_id: string
          id?: string
          link?: string | null
          notes?: string | null
          org_id: string
          platform: string
          quantity?: number
          scheduled_for: string
          status?: Database["public"]["Enums"]["calendar_status"]
          time_hint?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          creator_id?: string
          id?: string
          link?: string | null
          notes?: string | null
          org_id?: string
          platform?: string
          quantity?: number
          scheduled_for?: string
          status?: Database["public"]["Enums"]["calendar_status"]
          time_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "agency_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_calendar_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_concepts: {
        Row: {
          content_type: string
          created_at: string | null
          description: string | null
          hook_text: string | null
          id: string
          inspiration_account: string | null
          inspiration_reel_url: string | null
          inspiration_thumbnail: string | null
          name: string
          niche: string | null
          status: string | null
          subniche: string | null
          updated_at: string | null
          visual_prompt: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string | null
          description?: string | null
          hook_text?: string | null
          id?: string
          inspiration_account?: string | null
          inspiration_reel_url?: string | null
          inspiration_thumbnail?: string | null
          name: string
          niche?: string | null
          status?: string | null
          subniche?: string | null
          updated_at?: string | null
          visual_prompt?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string | null
          description?: string | null
          hook_text?: string | null
          id?: string
          inspiration_account?: string | null
          inspiration_reel_url?: string | null
          inspiration_thumbnail?: string | null
          name?: string
          niche?: string | null
          status?: string | null
          subniche?: string | null
          updated_at?: string | null
          visual_prompt?: string | null
        }
        Relationships: []
      }
      content_types: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      discovery_candidates: {
        Row: {
          ai_fit: number | null
          ai_niche: string | null
          ai_reason: string | null
          avg_views: number | null
          bio: string | null
          clips_count: number | null
          created_at: string | null
          decided_at: string | null
          discovery_score: number | null
          followers: number | null
          following: number | null
          full_name: string | null
          handle: string
          id: string
          is_private: boolean | null
          is_verified: boolean | null
          last_posted_at: string | null
          max_views: number | null
          posts_count: number | null
          profile_pic_url: string | null
          reels_sampled: number | null
          reject_reason: string | null
          source_count: number | null
          source_handles: string[] | null
          sources: Json | null
          status: string | null
          top_reels: Json | null
          updated_at: string | null
          vetted_at: string | null
          view_follow_ratio: number | null
        }
        Insert: {
          ai_fit?: number | null
          ai_niche?: string | null
          ai_reason?: string | null
          avg_views?: number | null
          bio?: string | null
          clips_count?: number | null
          created_at?: string | null
          decided_at?: string | null
          discovery_score?: number | null
          followers?: number | null
          following?: number | null
          full_name?: string | null
          handle: string
          id?: string
          is_private?: boolean | null
          is_verified?: boolean | null
          last_posted_at?: string | null
          max_views?: number | null
          posts_count?: number | null
          profile_pic_url?: string | null
          reels_sampled?: number | null
          reject_reason?: string | null
          source_count?: number | null
          source_handles?: string[] | null
          sources?: Json | null
          status?: string | null
          top_reels?: Json | null
          updated_at?: string | null
          vetted_at?: string | null
          view_follow_ratio?: number | null
        }
        Update: {
          ai_fit?: number | null
          ai_niche?: string | null
          ai_reason?: string | null
          avg_views?: number | null
          bio?: string | null
          clips_count?: number | null
          created_at?: string | null
          decided_at?: string | null
          discovery_score?: number | null
          followers?: number | null
          following?: number | null
          full_name?: string | null
          handle?: string
          id?: string
          is_private?: boolean | null
          is_verified?: boolean | null
          last_posted_at?: string | null
          max_views?: number | null
          posts_count?: number | null
          profile_pic_url?: string | null
          reels_sampled?: number | null
          reject_reason?: string | null
          source_count?: number | null
          source_handles?: string[] | null
          sources?: Json | null
          status?: string | null
          top_reels?: Json | null
          updated_at?: string | null
          vetted_at?: string | null
          view_follow_ratio?: number | null
        }
        Relationships: []
      }
      fan_profiles: {
        Row: {
          age: number | null
          buying_patterns: string | null
          created_at: string
          display_name: string | null
          id: string
          interests: string[]
          kinks: string[]
          last_analyzed_at: string | null
          location: string | null
          messages_analyzed: number
          notes: string | null
          occupation: string | null
          of_fan_id: number
          org_id: string
          raw: Json | null
          real_name: string | null
          relationship: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          age?: number | null
          buying_patterns?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          interests?: string[]
          kinks?: string[]
          last_analyzed_at?: string | null
          location?: string | null
          messages_analyzed?: number
          notes?: string | null
          occupation?: string | null
          of_fan_id: number
          org_id: string
          raw?: Json | null
          real_name?: string | null
          relationship?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          age?: number | null
          buying_patterns?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          interests?: string[]
          kinks?: string[]
          last_analyzed_at?: string | null
          location?: string | null
          messages_analyzed?: number
          notes?: string | null
          occupation?: string | null
          of_fan_id?: number
          org_id?: string
          raw?: Json | null
          real_name?: string | null
          relationship?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fan_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_accounts: {
        Row: {
          bio: string | null
          date_added: string | null
          followers: number | null
          following: number | null
          full_name: string | null
          handle: string
          id: string
          is_active: boolean | null
          niche: string | null
          posts_count: number | null
          profile_pic_url: string | null
          profile_url: string | null
          sub_category: string | null
          tray: string | null
          updated_at: string | null
          why_saved: string | null
        }
        Insert: {
          bio?: string | null
          date_added?: string | null
          followers?: number | null
          following?: number | null
          full_name?: string | null
          handle: string
          id?: string
          is_active?: boolean | null
          niche?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          sub_category?: string | null
          tray?: string | null
          updated_at?: string | null
          why_saved?: string | null
        }
        Update: {
          bio?: string | null
          date_added?: string | null
          followers?: number | null
          following?: number | null
          full_name?: string | null
          handle?: string
          id?: string
          is_active?: boolean | null
          niche?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          sub_category?: string | null
          tray?: string | null
          updated_at?: string | null
          why_saved?: string | null
        }
        Relationships: []
      }
      inspiration_reels: {
        Row: {
          ai_categorized_at: string | null
          ai_confidence: number | null
          ai_is_new: boolean | null
          ai_reason: string | null
          ai_suggested_niche: string | null
          author_handle: string | null
          caption: string | null
          categorization_notes: string | null
          comments: number | null
          comments_at_download: number | null
          content_type: string | null
          date_scraped: string | null
          discovery_scanned_at: string | null
          downloaded_at: string | null
          duration_sec: number | null
          engagement_rate: number | null
          first_seen_at: string | null
          followers_at_download: number | null
          followers_at_scrape: number | null
          format: string | null
          format_source: string | null
          id: string
          inspiration_score: number | null
          is_viral: boolean | null
          last_trend_check: string | null
          likes: number | null
          likes_at_download: number | null
          niche: string | null
          posted_at: string | null
          posted_date: string | null
          reel_url: string
          refresh_count: number | null
          saves: number | null
          shares: number | null
          shortcode: string | null
          status: string | null
          sub_category: string | null
          sub_category_confidence: number | null
          sub_category_reason: string | null
          subniche: string | null
          tags: string[] | null
          thumbnail_url: string | null
          tray: string | null
          trend_velocity: number | null
          updated_at: string | null
          video_path: string | null
          video_url: string | null
          view_follow_ratio: number | null
          views: number | null
          views_at_download: number | null
          viral_score: number | null
        }
        Insert: {
          ai_categorized_at?: string | null
          ai_confidence?: number | null
          ai_is_new?: boolean | null
          ai_reason?: string | null
          ai_suggested_niche?: string | null
          author_handle?: string | null
          caption?: string | null
          categorization_notes?: string | null
          comments?: number | null
          comments_at_download?: number | null
          content_type?: string | null
          date_scraped?: string | null
          discovery_scanned_at?: string | null
          downloaded_at?: string | null
          duration_sec?: number | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          followers_at_download?: number | null
          followers_at_scrape?: number | null
          format?: string | null
          format_source?: string | null
          id?: string
          inspiration_score?: number | null
          is_viral?: boolean | null
          last_trend_check?: string | null
          likes?: number | null
          likes_at_download?: number | null
          niche?: string | null
          posted_at?: string | null
          posted_date?: string | null
          reel_url: string
          refresh_count?: number | null
          saves?: number | null
          shares?: number | null
          shortcode?: string | null
          status?: string | null
          sub_category?: string | null
          sub_category_confidence?: number | null
          sub_category_reason?: string | null
          subniche?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          tray?: string | null
          trend_velocity?: number | null
          updated_at?: string | null
          video_path?: string | null
          video_url?: string | null
          view_follow_ratio?: number | null
          views?: number | null
          views_at_download?: number | null
          viral_score?: number | null
        }
        Update: {
          ai_categorized_at?: string | null
          ai_confidence?: number | null
          ai_is_new?: boolean | null
          ai_reason?: string | null
          ai_suggested_niche?: string | null
          author_handle?: string | null
          caption?: string | null
          categorization_notes?: string | null
          comments?: number | null
          comments_at_download?: number | null
          content_type?: string | null
          date_scraped?: string | null
          discovery_scanned_at?: string | null
          downloaded_at?: string | null
          duration_sec?: number | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          followers_at_download?: number | null
          followers_at_scrape?: number | null
          format?: string | null
          format_source?: string | null
          id?: string
          inspiration_score?: number | null
          is_viral?: boolean | null
          last_trend_check?: string | null
          likes?: number | null
          likes_at_download?: number | null
          niche?: string | null
          posted_at?: string | null
          posted_date?: string | null
          reel_url?: string
          refresh_count?: number | null
          saves?: number | null
          shares?: number | null
          shortcode?: string | null
          status?: string | null
          sub_category?: string | null
          sub_category_confidence?: number | null
          sub_category_reason?: string | null
          subniche?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          tray?: string | null
          trend_velocity?: number | null
          updated_at?: string | null
          video_path?: string | null
          video_url?: string | null
          view_follow_ratio?: number | null
          views?: number | null
          views_at_download?: number | null
          viral_score?: number | null
        }
        Relationships: []
      }
      inspiration_trays: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          label: string | null
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string | null
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      instagram_tokens: {
        Row: {
          access_token: string
          account_handle: string | null
          connected_at: string | null
          created_at: string | null
          follower_count: number | null
          id: string
          ig_account_id: string
          ig_username: string | null
          is_active: boolean | null
          last_synced_at: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          account_handle?: string | null
          connected_at?: string | null
          created_at?: string | null
          follower_count?: number | null
          id?: string
          ig_account_id: string
          ig_username?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          account_handle?: string | null
          connected_at?: string | null
          created_at?: string | null
          follower_count?: number | null
          id?: string
          ig_account_id?: string
          ig_username?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      jarvis_conversations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "jarvis_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      link_metadata: {
        Row: {
          created_at: string
          currency: string
          id: string
          kind: string
          notes: string | null
          of_link_id: string
          one_time_cost_cents: number
          org_id: string
          platform_tag: string | null
          recurring_cost_cents: number
          recurring_end_date: string | null
          recurring_period:
            | Database["public"]["Enums"]["link_recurring_period"]
            | null
          recurring_start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          notes?: string | null
          of_link_id: string
          one_time_cost_cents?: number
          org_id: string
          platform_tag?: string | null
          recurring_cost_cents?: number
          recurring_end_date?: string | null
          recurring_period?:
            | Database["public"]["Enums"]["link_recurring_period"]
            | null
          recurring_start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          notes?: string | null
          of_link_id?: string
          one_time_cost_cents?: number
          org_id?: string
          platform_tag?: string | null
          recurring_cost_cents?: number
          recurring_end_date?: string | null
          recurring_period?:
            | Database["public"]["Enums"]["link_recurring_period"]
            | null
          recurring_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_metadata_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          access_token_encrypted: string
          access_token_expires_at: string | null
          access_token_iv: string
          access_token_tag: string
          auth_metadata: Json
          client_id: string
          client_secret_encrypted: string | null
          client_secret_iv: string | null
          client_secret_tag: string | null
          connected_at: string
          connected_by: string
          created_at: string
          id: string
          last_refreshed_at: string | null
          org_id: string
          provider: string
          refresh_token_encrypted: string | null
          refresh_token_iv: string | null
          refresh_token_tag: string | null
          scope: string | null
          server_url: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          access_token_expires_at?: string | null
          access_token_iv: string
          access_token_tag: string
          auth_metadata?: Json
          client_id: string
          client_secret_encrypted?: string | null
          client_secret_iv?: string | null
          client_secret_tag?: string | null
          connected_at?: string
          connected_by: string
          created_at?: string
          id?: string
          last_refreshed_at?: string | null
          org_id: string
          provider: string
          refresh_token_encrypted?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          scope?: string | null
          server_url: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          access_token_expires_at?: string | null
          access_token_iv?: string
          access_token_tag?: string
          auth_metadata?: Json
          client_id?: string
          client_secret_encrypted?: string | null
          client_secret_iv?: string | null
          client_secret_tag?: string | null
          connected_at?: string
          connected_by?: string
          created_at?: string
          id?: string
          last_refreshed_at?: string | null
          org_id?: string
          provider?: string
          refresh_token_encrypted?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          scope?: string | null
          server_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_snapshots: {
        Row: {
          comments: number | null
          engagement_rate: number | null
          followers: number | null
          id: string
          likes: number | null
          reel_url: string
          saves: number | null
          shares: number | null
          snapshot_at: string | null
          source: string
          view_follow_ratio: number | null
          views: number | null
        }
        Insert: {
          comments?: number | null
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          likes?: number | null
          reel_url: string
          saves?: number | null
          shares?: number | null
          snapshot_at?: string | null
          source: string
          view_follow_ratio?: number | null
          views?: number | null
        }
        Update: {
          comments?: number | null
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          likes?: number | null
          reel_url?: string
          saves?: number | null
          shares?: number | null
          snapshot_at?: string | null
          source?: string
          view_follow_ratio?: number | null
          views?: number | null
        }
        Relationships: []
      }
      niches: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      of_accounts: {
        Row: {
          api_key_encrypted: string
          api_key_iv: string
          api_key_tag: string
          created_at: string
          id: string
          label: string
          metadata: Json | null
          of_account_id: string
          org_id: string
        }
        Insert: {
          api_key_encrypted: string
          api_key_iv: string
          api_key_tag: string
          created_at?: string
          id?: string
          label: string
          metadata?: Json | null
          of_account_id: string
          org_id: string
        }
        Update: {
          api_key_encrypted?: string
          api_key_iv?: string
          api_key_tag?: string
          created_at?: string
          id?: string
          label?: string
          metadata?: Json | null
          of_account_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "of_accounts_org_id_organizations_id_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      of_fan_sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          fans_added: number
          fans_updated: number
          id: string
          of_account_id: string
          org_id: string
          pages_fetched: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          fans_added?: number
          fans_updated?: number
          id?: string
          of_account_id: string
          org_id: string
          pages_fetched?: number
          source: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          fans_added?: number
          fans_updated?: number
          id?: string
          of_account_id?: string
          org_id?: string
          pages_fetched?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      of_fans: {
        Row: {
          avatar_url: string | null
          expires_at: string | null
          first_synced_at: string
          id: string
          is_active_subscriber: boolean
          is_chat_only: boolean
          is_expired_subscriber: boolean
          last_seen_at: string | null
          last_synced_at: string
          messages_spent_cents: number
          name: string | null
          of_account_id: string
          of_fan_id: number
          org_id: string
          posts_spent_cents: number
          raw: Json | null
          source: string
          subscribed_at: string | null
          subscribes_spent_cents: number
          tips_spent_cents: number
          total_spent_cents: number
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          expires_at?: string | null
          first_synced_at?: string
          id?: string
          is_active_subscriber?: boolean
          is_chat_only?: boolean
          is_expired_subscriber?: boolean
          last_seen_at?: string | null
          last_synced_at?: string
          messages_spent_cents?: number
          name?: string | null
          of_account_id: string
          of_fan_id: number
          org_id: string
          posts_spent_cents?: number
          raw?: Json | null
          source?: string
          subscribed_at?: string | null
          subscribes_spent_cents?: number
          tips_spent_cents?: number
          total_spent_cents?: number
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          expires_at?: string | null
          first_synced_at?: string
          id?: string
          is_active_subscriber?: boolean
          is_chat_only?: boolean
          is_expired_subscriber?: boolean
          last_seen_at?: string | null
          last_synced_at?: string
          messages_spent_cents?: number
          name?: string | null
          of_account_id?: string
          of_fan_id?: number
          org_id?: string
          posts_spent_cents?: number
          raw?: Json | null
          source?: string
          subscribed_at?: string | null
          subscribes_spent_cents?: number
          tips_spent_cents?: number
          total_spent_cents?: number
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "of_fans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_organizations_id_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          share_token: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          share_token: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          share_token?: string
          slug?: string
        }
        Relationships: []
      }
      our_accounts: {
        Row: {
          active: boolean | null
          content_type: string | null
          followers: number | null
          following: number | null
          handle: string
          id: string
          niche: string | null
          notes: string | null
          posts_count: number | null
          profile_pic_url: string | null
          profile_url: string | null
          subniche: string | null
          updated_at: string | null
          va_group: string | null
        }
        Insert: {
          active?: boolean | null
          content_type?: string | null
          followers?: number | null
          following?: number | null
          handle: string
          id?: string
          niche?: string | null
          notes?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          subniche?: string | null
          updated_at?: string | null
          va_group?: string | null
        }
        Update: {
          active?: boolean | null
          content_type?: string | null
          followers?: number | null
          following?: number | null
          handle?: string
          id?: string
          niche?: string | null
          notes?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          subniche?: string | null
          updated_at?: string | null
          va_group?: string | null
        }
        Relationships: []
      }
      our_reels: {
        Row: {
          account_handle: string | null
          caption: string | null
          comments: number | null
          date_scraped: string | null
          duration_sec: number | null
          engagement_rate: number | null
          first_seen_at: string | null
          followers_at_scrape: number | null
          format: string | null
          format_source: string | null
          id: string
          inspiration_source: string | null
          likes: number | null
          posted_at: string | null
          posted_date: string | null
          reel_url: string
          saves: number | null
          shares: number | null
          shortcode: string | null
          status: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          video_path: string | null
          video_url: string | null
          view_follow_ratio: number | null
          views: number | null
        }
        Insert: {
          account_handle?: string | null
          caption?: string | null
          comments?: number | null
          date_scraped?: string | null
          duration_sec?: number | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          followers_at_scrape?: number | null
          format?: string | null
          format_source?: string | null
          id?: string
          inspiration_source?: string | null
          likes?: number | null
          posted_at?: string | null
          posted_date?: string | null
          reel_url: string
          saves?: number | null
          shares?: number | null
          shortcode?: string | null
          status?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_path?: string | null
          video_url?: string | null
          view_follow_ratio?: number | null
          views?: number | null
        }
        Update: {
          account_handle?: string | null
          caption?: string | null
          comments?: number | null
          date_scraped?: string | null
          duration_sec?: number | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          followers_at_scrape?: number | null
          format?: string | null
          format_source?: string | null
          id?: string
          inspiration_source?: string | null
          likes?: number | null
          posted_at?: string | null
          posted_date?: string | null
          reel_url?: string
          saves?: number | null
          shares?: number | null
          shortcode?: string | null
          status?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_path?: string | null
          video_url?: string | null
          view_follow_ratio?: number | null
          views?: number | null
        }
        Relationships: []
      }
      posting_schedule: {
        Row: {
          account_handle: string
          created_at: string | null
          id: string
          is_active: boolean | null
          post_time: string
          post_type: string | null
          slot_name: string | null
        }
        Insert: {
          account_handle: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          post_time: string
          post_type?: string | null
          slot_name?: string | null
        }
        Update: {
          account_handle?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          post_time?: string
          post_type?: string | null
          slot_name?: string | null
        }
        Relationships: []
      }
      reel_performance: {
        Row: {
          account_handle: string
          ai_analyzed_at: string | null
          ai_feedback: string | null
          ai_score: number | null
          ai_strengths: string[] | null
          ai_weaknesses: string[] | null
          avg_retention: number | null
          brief_id: string | null
          comments_24h: number | null
          concept_id: string | null
          created_at: string | null
          demographics: Json | null
          drop_off_points: Json | null
          id: string
          inspiration_reel_url: string | null
          is_winner: boolean | null
          likes_24h: number | null
          peak_retention: number | null
          posted_at: string | null
          reel_url: string | null
          retention_graph: Json | null
          saves_24h: number | null
          screenshot_urls: string[] | null
          shares_24h: number | null
          skip_rate: number | null
          status: string | null
          top_territories: Json | null
          trend_tags: string[] | null
          updated_at: string | null
          va_name: string | null
          views_24h: number | null
          winner_template: string | null
        }
        Insert: {
          account_handle: string
          ai_analyzed_at?: string | null
          ai_feedback?: string | null
          ai_score?: number | null
          ai_strengths?: string[] | null
          ai_weaknesses?: string[] | null
          avg_retention?: number | null
          brief_id?: string | null
          comments_24h?: number | null
          concept_id?: string | null
          created_at?: string | null
          demographics?: Json | null
          drop_off_points?: Json | null
          id?: string
          inspiration_reel_url?: string | null
          is_winner?: boolean | null
          likes_24h?: number | null
          peak_retention?: number | null
          posted_at?: string | null
          reel_url?: string | null
          retention_graph?: Json | null
          saves_24h?: number | null
          screenshot_urls?: string[] | null
          shares_24h?: number | null
          skip_rate?: number | null
          status?: string | null
          top_territories?: Json | null
          trend_tags?: string[] | null
          updated_at?: string | null
          va_name?: string | null
          views_24h?: number | null
          winner_template?: string | null
        }
        Update: {
          account_handle?: string
          ai_analyzed_at?: string | null
          ai_feedback?: string | null
          ai_score?: number | null
          ai_strengths?: string[] | null
          ai_weaknesses?: string[] | null
          avg_retention?: number | null
          brief_id?: string | null
          comments_24h?: number | null
          concept_id?: string | null
          created_at?: string | null
          demographics?: Json | null
          drop_off_points?: Json | null
          id?: string
          inspiration_reel_url?: string | null
          is_winner?: boolean | null
          likes_24h?: number | null
          peak_retention?: number | null
          posted_at?: string | null
          reel_url?: string | null
          retention_graph?: Json | null
          saves_24h?: number | null
          screenshot_urls?: string[] | null
          shares_24h?: number | null
          skip_rate?: number | null
          status?: string | null
          top_territories?: Json | null
          trend_tags?: string[] | null
          updated_at?: string | null
          va_name?: string | null
          views_24h?: number | null
          winner_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_performance_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "content_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_performance_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "content_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      story_assets: {
        Row: {
          caption: string | null
          id: string
          image_url: string
          kind: string | null
          label: string | null
          media_type: string | null
          niche: string | null
          path: string | null
          set_name: string | null
          uploaded_at: string | null
          used: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          caption?: string | null
          id?: string
          image_url: string
          kind?: string | null
          label?: string | null
          media_type?: string | null
          niche?: string | null
          path?: string | null
          set_name?: string | null
          uploaded_at?: string | null
          used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          caption?: string | null
          id?: string
          image_url?: string
          kind?: string | null
          label?: string | null
          media_type?: string | null
          niche?: string | null
          path?: string | null
          set_name?: string | null
          uploaded_at?: string | null
          used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      sub_categories: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          label: string | null
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      subniches: {
        Row: {
          content_type: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          content_type?: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          content_type?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      telegram_users: {
        Row: {
          added_at: string | null
          added_by: string | null
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          role: string | null
          telegram_id: number
          username: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          role?: string | null
          telegram_id: number
          username?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          role?: string | null
          telegram_id?: number
          username?: string | null
        }
        Relationships: []
      }
      tf_boards: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tf_boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_member_skills: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          proficiency_level: number | null
          skill_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          proficiency_level?: number | null
          skill_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          proficiency_level?: number | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tf_member_skills_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tf_member_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "tf_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_members: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          max_daily_hours: number | null
          name: string
          role: string | null
          status: string | null
          telegram_id: number | null
          telegram_username: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          max_daily_hours?: number | null
          name: string
          role?: string | null
          status?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          max_daily_hours?: number | null
          name?: string
          role?: string | null
          status?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tf_skills: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tf_sop_versions: {
        Row: {
          change_note: string | null
          content: string
          created_at: string | null
          edited_by: string | null
          id: string
          sop_id: string
          title: string
          version: number
        }
        Insert: {
          change_note?: string | null
          content: string
          created_at?: string | null
          edited_by?: string | null
          id?: string
          sop_id: string
          title: string
          version: number
        }
        Update: {
          change_note?: string | null
          content?: string
          created_at?: string | null
          edited_by?: string | null
          id?: string
          sop_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tf_sop_versions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tf_sop_versions_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "tf_sops"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_sops: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          platform: string | null
          status: string | null
          tags: string[] | null
          telegram_message_id: number | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          platform?: string | null
          status?: string | null
          tags?: string[] | null
          telegram_message_id?: number | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          platform?: string | null
          status?: string | null
          tags?: string[] | null
          telegram_message_id?: number | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tf_sops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_task_activity: {
        Row: {
          action: string
          created_at: string | null
          id: string
          member_id: string | null
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          task_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          member_id?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          task_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          member_id?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tf_task_activity_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tf_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tf_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_tasks: {
        Row: {
          actual_hours: number | null
          assignee_id: string | null
          board_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          platform: string | null
          position: number | null
          priority: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          platform?: string | null
          position?: number | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          platform?: string | null
          position?: number | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tf_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tf_tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "tf_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tf_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_telegram_topics: {
        Row: {
          chat_id: number
          created_at: string | null
          description: string | null
          id: string
          message_thread_id: number | null
          topic_name: string
        }
        Insert: {
          chat_id: number
          created_at?: string | null
          description?: string | null
          id?: string
          message_thread_id?: number | null
          topic_name: string
        }
        Update: {
          chat_id?: number
          created_at?: string | null
          description?: string | null
          id?: string
          message_thread_id?: number | null
          topic_name?: string
        }
        Relationships: []
      }
      tf_va_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          member_id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          member_id: string
          token: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          member_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tf_va_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_va_vault: {
        Row: {
          api_key: string | null
          created_at: string | null
          id: string
          item_type: string
          member_id: string
          name: string
          notes: string | null
          password: string | null
          proxy_address: string | null
          proxy_password: string | null
          proxy_port: string | null
          proxy_username: string | null
          updated_at: string | null
          url: string | null
          username: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          item_type?: string
          member_id: string
          name: string
          notes?: string | null
          password?: string | null
          proxy_address?: string | null
          proxy_password?: string | null
          proxy_port?: string | null
          proxy_username?: string | null
          updated_at?: string | null
          url?: string | null
          username?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          item_type?: string
          member_id?: string
          name?: string
          notes?: string | null
          password?: string | null
          proxy_address?: string | null
          proxy_password?: string | null
          proxy_port?: string | null
          proxy_username?: string | null
          updated_at?: string | null
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tf_va_vault_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tf_workload_log: {
        Row: {
          created_at: string | null
          hours_assigned: number | null
          hours_logged: number | null
          id: string
          log_date: string
          member_id: string
          tasks_active: number | null
          tasks_completed: number | null
        }
        Insert: {
          created_at?: string | null
          hours_assigned?: number | null
          hours_logged?: number | null
          id?: string
          log_date?: string
          member_id: string
          tasks_active?: number | null
          tasks_completed?: number | null
        }
        Update: {
          created_at?: string | null
          hours_assigned?: number | null
          hours_logged?: number | null
          id?: string
          log_date?: string
          member_id?: string
          tasks_active?: number | null
          tasks_completed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tf_workload_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tf_members"
            referencedColumns: ["id"]
          },
        ]
      }
      va_checklist: {
        Row: {
          account_handle: string
          day: string
          done_at: string | null
          done_by: string | null
          id: string
          task_key: string
        }
        Insert: {
          account_handle: string
          day: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          task_key: string
        }
        Update: {
          account_handle?: string
          day?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          task_key?: string
        }
        Relationships: []
      }
      va_plan: {
        Row: {
          account_handle: string
          content: string | null
          day: string
          id: string
          updated_at: string | null
        }
        Insert: {
          account_handle: string
          content?: string | null
          day: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          account_handle?: string
          content?: string | null
          day?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      va_posts: {
        Row: {
          account_handle: string | null
          id: string
          link: string | null
          logged_at: string | null
          note: string | null
          post_type: string | null
          posted_at: string | null
          scheduled_time: string | null
          status: string | null
          va_name: string | null
        }
        Insert: {
          account_handle?: string | null
          id?: string
          link?: string | null
          logged_at?: string | null
          note?: string | null
          post_type?: string | null
          posted_at?: string | null
          scheduled_time?: string | null
          status?: string | null
          va_name?: string | null
        }
        Update: {
          account_handle?: string | null
          id?: string
          link?: string | null
          logged_at?: string | null
          note?: string | null
          post_type?: string | null
          posted_at?: string | null
          scheduled_time?: string | null
          status?: string | null
          va_name?: string | null
        }
        Relationships: []
      }
      va_profiles: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_accounts: number | null
          name: string
          role: string | null
          telegram_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_accounts?: number | null
          name: string
          role?: string | null
          telegram_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_accounts?: number | null
          name?: string
          role?: string | null
          telegram_id?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      va_trials: {
        Row: {
          account_handle: string | null
          concept: string | null
          id: string
          logged_at: string | null
          posted_at: string | null
          reel_link: string | null
          va_name: string | null
          views: number | null
        }
        Insert: {
          account_handle?: string | null
          concept?: string | null
          id?: string
          logged_at?: string | null
          posted_at?: string | null
          reel_link?: string | null
          va_name?: string | null
          views?: number | null
        }
        Update: {
          account_handle?: string | null
          concept?: string | null
          id?: string
          logged_at?: string | null
          posted_at?: string | null
          reel_link?: string | null
          va_name?: string | null
          views?: number | null
        }
        Relationships: []
      }
      winner_templates: {
        Row: {
          avg_duration: number | null
          avg_retention: number | null
          avg_skip_rate: number | null
          avg_views: number | null
          content_type: string | null
          created_at: string | null
          description: string | null
          hook_type: string | null
          id: string
          inspiration_reel_urls: string[] | null
          instance_count: number | null
          name: string
          niche: string | null
          pattern: Json | null
          retention_curve: string | null
          sub_category: string | null
          updated_at: string | null
        }
        Insert: {
          avg_duration?: number | null
          avg_retention?: number | null
          avg_skip_rate?: number | null
          avg_views?: number | null
          content_type?: string | null
          created_at?: string | null
          description?: string | null
          hook_type?: string | null
          id?: string
          inspiration_reel_urls?: string[] | null
          instance_count?: number | null
          name: string
          niche?: string | null
          pattern?: Json | null
          retention_curve?: string | null
          sub_category?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_duration?: number | null
          avg_retention?: number | null
          avg_skip_rate?: number | null
          avg_views?: number | null
          content_type?: string | null
          created_at?: string | null
          description?: string | null
          hook_type?: string | null
          id?: string
          inspiration_reel_urls?: string[] | null
          instance_count?: number | null
          name?: string
          niche?: string | null
          pattern?: Json | null
          retention_curve?: string | null
          sub_category?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      brief_off_cooldown: {
        Args: { p_account_handle: string; p_brief_id: string }
        Returns: boolean
      }
      concept_available_for_account: {
        Args: { p_account_handle: string; p_concept_id: string }
        Returns: boolean
      }
      ig_shortcode_ts: { Args: { sc: string }; Returns: string }
      mark_reel_viral: { Args: { p_reel_url: string }; Returns: boolean }
      reel_trend_velocity: { Args: { p_reel_url: string }; Returns: number }
      user_orgs: { Args: { uid: string }; Returns: string[] }
    }
    Enums: {
      calendar_status:
        | "pending"
        | "done"
        | "skipped"
        | "cancelled"
        | "in_progress"
        | "late"
        | "redo"
        | "not_done"
        | "uploaded_not_on_feed"
        | "uploaded"
        | "done_late"
        | "partially_done"
      chatter_pay_type:
        | "none"
        | "hourly"
        | "percentage"
        | "hourly_plus_percentage"
      chatter_status: "active" | "inactive" | "archived"
      creator_pay_type: "none" | "salary" | "percentage"
      creator_salary_period: "weekly" | "monthly" | "semi_monthly"
      day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
      link_recurring_period: "daily" | "monthly"
      member_role: "owner" | "manager" | "chatter" | "viewer"
      transaction_kind: "income" | "expense"
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
      calendar_status: [
        "pending",
        "done",
        "skipped",
        "cancelled",
        "in_progress",
        "late",
        "redo",
        "not_done",
        "uploaded_not_on_feed",
        "uploaded",
        "done_late",
        "partially_done",
      ],
      chatter_pay_type: [
        "none",
        "hourly",
        "percentage",
        "hourly_plus_percentage",
      ],
      chatter_status: ["active", "inactive", "archived"],
      creator_pay_type: ["none", "salary", "percentage"],
      creator_salary_period: ["weekly", "monthly", "semi_monthly"],
      day_of_week: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      link_recurring_period: ["daily", "monthly"],
      member_role: ["owner", "manager", "chatter", "viewer"],
      transaction_kind: ["income", "expense"],
    },
  },
} as const
