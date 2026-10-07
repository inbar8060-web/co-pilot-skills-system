export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: number
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_requests: {
        Row: {
          expires_at: string
          id: string
          organization_id: string
          requested_at: string
          requester_user_id: string
          responded_at: string | null
          routine_type: string
          status: string
          target_user_id: string
          valid_until: string | null
        }
        Insert: {
          expires_at?: string
          id?: string
          organization_id: string
          requested_at?: string
          requester_user_id: string
          responded_at?: string | null
          routine_type: string
          status?: string
          target_user_id: string
          valid_until?: string | null
        }
        Update: {
          expires_at?: string
          id?: string
          organization_id?: string
          requested_at?: string
          requester_user_id?: string
          responded_at?: string | null
          routine_type?: string
          status?: string
          target_user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_logs: {
        Row: {
          action_type: string
          created_at: string
          credits_awarded: number
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          credits_awarded: number
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          credits_awarded?: number
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_rules: {
        Row: {
          action_type: string
          cooldown_kind: string
          cooldown_limit: number
          credits: number
          description: string | null
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          action_type: string
          cooldown_kind: string
          cooldown_limit?: number
          credits: number
          description?: string | null
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          cooldown_kind?: string
          cooldown_limit?: number
          credits?: number
          description?: string | null
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      insight_acknowledgements: {
        Row: {
          acknowledged_at: string
          insight_id: string
          iso_week: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          insight_id: string
          iso_week: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          insight_id?: string
          iso_week?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_acknowledgements_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "weekly_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_rewards: {
        Row: {
          cost_in_credits: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          inventory_count: number
          is_active: boolean
          organization_id: string
          title: string
        }
        Insert: {
          cost_in_credits: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inventory_count?: number
          is_active?: boolean
          organization_id: string
          title: string
        }
        Update: {
          cost_in_credits?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inventory_count?: number
          is_active?: boolean
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          canvas_enabled: boolean
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          canvas_enabled?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          canvas_enabled?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      readiness_tiers: {
        Row: {
          label: string
          min_credits: number
          sort_order: number
          tier: string
        }
        Insert: {
          label: string
          min_credits: number
          sort_order: number
          tier: string
        }
        Update: {
          label?: string
          min_credits?: number
          sort_order?: number
          tier?: string
        }
        Relationships: []
      }
      reflections: {
        Row: {
          created_at: string
          id: string
          routine_type: string
          session_id: string | null
          user_id: string
          what_to_change: string
          what_worked: string
        }
        Insert: {
          created_at?: string
          id?: string
          routine_type: string
          session_id?: string | null
          user_id: string
          what_to_change: string
          what_worked: string
        }
        Update: {
          created_at?: string
          id?: string
          routine_type?: string
          session_id?: string | null
          user_id?: string
          what_to_change?: string
          what_worked?: string
        }
        Relationships: [
          {
            foreignKeyName: "reflections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "routine_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          created_at: string
          credits_spent: number
          id: string
          organization_id: string
          processed_at: string | null
          reward_id: string
          reward_title: string
          status: string
          stock_decremented: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_spent: number
          id?: string
          organization_id: string
          processed_at?: string | null
          reward_id: string
          reward_title?: string
          status?: string
          stock_decremented?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          credits_spent?: number
          id?: string
          organization_id?: string
          processed_at?: string | null
          reward_id?: string
          reward_title?: string
          status?: string
          stock_decremented?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "organization_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_sessions: {
        Row: {
          ai_generated_output: Json
          created_at: string
          id: string
          input_tokens: number | null
          model: string | null
          organization_id: string | null
          output_tokens: number | null
          partner_user_id: string | null
          primary_user_id: string
          prompt_version: number | null
          routine_code: string
          scenario_context: Json
        }
        Insert: {
          ai_generated_output: Json
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          organization_id?: string | null
          output_tokens?: number | null
          partner_user_id?: string | null
          primary_user_id: string
          prompt_version?: number | null
          routine_code: string
          scenario_context?: Json
        }
        Update: {
          ai_generated_output?: Json
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          organization_id?: string | null
          output_tokens?: number | null
          partner_user_id?: string | null
          primary_user_id?: string
          prompt_version?: number | null
          routine_code?: string
          scenario_context?: Json
        }
        Relationships: [
          {
            foreignKeyName: "routine_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_sessions_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_sessions_primary_user_id_fkey"
            columns: ["primary_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          routine_type: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          routine_type: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          routine_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_canvas_layouts: {
        Row: {
          layout: Json
          layout_version: number
          page: string
          surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          layout?: Json
          layout_version?: number
          page?: string
          surface?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          layout?: Json
          layout_version?: number
          page?: string
          surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_canvas_layouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gamification_status: {
        Row: {
          current_balance: number
          current_streak_weeks: number
          last_action_at: string | null
          readiness_tier: string
          total_credits_earned: number
          user_id: string
        }
        Insert: {
          current_balance?: number
          current_streak_weeks?: number
          last_action_at?: string | null
          readiness_tier?: string
          total_credits_earned?: number
          user_id: string
        }
        Update: {
          current_balance?: number
          current_streak_weeks?: number
          last_action_at?: string | null
          readiness_tier?: string
          total_credits_earned?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_gamification_status_readiness_tier_fkey"
            columns: ["readiness_tier"]
            isOneToOne: false
            referencedRelation: "readiness_tiers"
            referencedColumns: ["tier"]
          },
          {
            foreignKeyName: "user_gamification_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences_and_consent: {
        Row: {
          allowed_scenarios: string[]
          max_notifications_per_week: number
          notification_focus: string[]
          notification_frequency: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sharing_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_scenarios?: string[]
          max_notifications_per_week?: number
          notification_focus?: string[]
          notification_frequency?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sharing_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_scenarios?: string[]
          max_notifications_per_week?: number
          notification_focus?: string[]
          notification_frequency?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sharing_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_and_consent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          gender: string | null
          has_active_report: boolean
          id: string
          operational_category: string | null
          organization_id: string | null
          role: string
          team: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          gender?: string | null
          has_active_report?: boolean
          id: string
          operational_category?: string | null
          organization_id?: string | null
          role?: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          gender?: string | null
          has_active_report?: boolean
          id?: string
          operational_category?: string | null
          organization_id?: string | null
          role?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_insights: {
        Row: {
          body: string
          focus: string
          id: string
          title: string
          week_index: number
        }
        Insert: {
          body: string
          focus: string
          id?: string
          title: string
          week_index: number
        }
        Update: {
          body?: string
          focus?: string
          id?: string
          title?: string
          week_index?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_activate_prompt: {
        Args: { p_actor: string; p_id: string }
        Returns: Json
      }
      admin_award_credits: {
        Args: { p_action: string; p_metadata?: Json; p_user_id: string }
        Returns: Json
      }
      admin_check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      admin_create_prompt_version: {
        Args: {
          p_activate: boolean
          p_actor: string
          p_content: string
          p_family: string
          p_notes: string
        }
        Returns: Json
      }
      admin_org_stats: {
        Args: never
        Returns: {
          admins: number
          crew: number
          organization_id: string
          reports: number
        }[]
      }
      admin_wall_auto_match: {
        Args: { p_actor: string; p_org_id: string }
        Returns: number
      }
      admin_wall_get_profile_for_user: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_wall_identity_audit: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor: string
          actor_email: string
          code: string
          created_at: string
          id: number
          metadata: Json
          profile_id: string
          user_email: string
          user_id: string
        }[]
      }
      admin_wall_ingest_profile: {
        Args: {
          p_framework: string
          p_link_user_id?: string
          p_method?: string
          p_normalized: Json
          p_org_id: string
          p_raw: Json
          p_uploaded_by: string
        }
        Returns: Json
      }
      admin_wall_link_profile: {
        Args: {
          p_actor: string
          p_method?: string
          p_profile_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_wall_list_mappings: {
        Args: { p_org_id?: string }
        Returns: {
          code: string
          email: string
          framework: string
          full_name: string
          linked_at: string
          mapping_id: string
          method: string
          organization_id: string
          profile_id: string
          user_id: string
        }[]
      }
      admin_wall_list_profiles: {
        Args: { p_org_id: string }
        Returns: {
          code: string
          created_at: string
          framework: string
          id: string
          is_linked: boolean
        }[]
      }
      admin_wall_research_rows: {
        Args: { p_category?: string; p_gender?: string; p_org_id?: string }
        Returns: {
          extraversion: number
          framework: string
          gender: string
          judging: number
          linked: boolean
          operational_category: string
          organization_id: string
          sensing: number
          thinking: number
          type_code: string
        }[]
      }
      admin_wall_unlink_profile: {
        Args: { p_actor: string; p_user_id: string }
        Returns: undefined
      }
      admin_wall_unlinked_profiles: {
        Args: { p_org_id?: string }
        Returns: {
          candidate_email: string
          candidate_name: string
          code: string
          created_at: string
          framework: string
          id: string
          organization_id: string
        }[]
      }
      admin_write_audit: {
        Args: {
          p_action?: string
          p_actor?: string
          p_metadata?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: undefined
      }
      crew_directory: {
        Args: never
        Returns: {
          full_name: string
          has_active_report: boolean
          id: string
          team: string
        }[]
      }
      expire_stale_consents: { Args: never; Returns: number }
      org_engagement_stats: { Args: never; Returns: Json }
      redeem_reward: { Args: { p_reward_id: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

