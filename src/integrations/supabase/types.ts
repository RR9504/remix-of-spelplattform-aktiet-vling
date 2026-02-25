export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      competitions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          initial_balance: number
          invite_code: string | null
          is_public: boolean
          max_teams: number | null
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          initial_balance?: number
          invite_code?: string | null
          is_public?: boolean
          max_teams?: number | null
          name: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          initial_balance?: number
          invite_code?: string | null
          is_public?: boolean
          max_teams?: number | null
          name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_teams: {
        Row: {
          id: string
          competition_id: string
          team_id: string
          cash_balance_sek: number
          joined_at: string
        }
        Insert: {
          id?: string
          competition_id: string
          team_id: string
          cash_balance_sek: number
          joined_at?: string
        }
        Update: {
          id?: string
          competition_id?: string
          team_id?: string
          cash_balance_sek?: number
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          profile_id: string
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          profile_id: string
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_id: string
          competition_id: string | null
          created_at: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          captain_id: string
          competition_id?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          name: string
        }
        Update: {
          captain_id?: string
          competition_id?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          id: string
          competition_id: string
          team_id: string
          executed_by: string
          ticker: string
          stock_name: string
          side: "buy" | "sell"
          shares: number
          price_per_share: number
          currency: string
          exchange_rate: number
          total_sek: number
          executed_at: string
        }
        Insert: {
          id?: string
          competition_id: string
          team_id: string
          executed_by: string
          ticker: string
          stock_name: string
          side: "buy" | "sell"
          shares: number
          price_per_share: number
          currency?: string
          exchange_rate?: number
          total_sek: number
          executed_at?: string
        }
        Update: {
          id?: string
          competition_id?: string
          team_id?: string
          executed_by?: string
          ticker?: string
          stock_name?: string
          side?: "buy" | "sell"
          shares?: number
          price_per_share?: number
          currency?: string
          exchange_rate?: number
          total_sek?: number
          executed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          id: string
          competition_id: string
          team_id: string
          snapshot_date: string
          total_value_sek: number
          cash_sek: number
          holdings_value_sek: number
        }
        Insert: {
          id?: string
          competition_id: string
          team_id: string
          snapshot_date: string
          total_value_sek: number
          cash_sek: number
          holdings_value_sek: number
        }
        Update: {
          id?: string
          competition_id?: string
          team_id?: string
          snapshot_date?: string
          total_value_sek?: number
          cash_sek?: number
          holdings_value_sek?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_snapshots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          id: string
          profile_id: string
          ticker: string
          stock_name: string | null
          added_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          ticker: string
          stock_name?: string | null
          added_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          ticker?: string
          stock_name?: string | null
          added_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_price_cache: {
        Row: {
          ticker: string
          price: number
          currency: string
          exchange_rate: number
          price_sek: number
          change_percent: number | null
          stock_name: string | null
          exchange: string | null
          updated_at: string
        }
        Insert: {
          ticker: string
          price: number
          currency?: string
          exchange_rate?: number
          price_sek: number
          change_percent?: number | null
          stock_name?: string | null
          exchange?: string | null
          updated_at?: string
        }
        Update: {
          ticker?: string
          price?: number
          currency?: string
          exchange_rate?: number
          price_sek?: number
          change_percent?: number | null
          stock_name?: string | null
          exchange?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      insider_trades_cache: {
        Row: {
          id: string
          ticker: string
          transaction_date: string
          insider_name: string
          title: string | null
          transaction_type: string
          shares: number | null
          value_sek: number | null
          source: string
          fetched_at: string
        }
        Insert: {
          id?: string
          ticker: string
          transaction_date: string
          insider_name: string
          title?: string | null
          transaction_type: string
          shares?: number | null
          value_sek?: number | null
          source: string
          fetched_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          transaction_date?: string
          insider_name?: string
          title?: string | null
          transaction_type?: string
          shares?: number | null
          value_sek?: number | null
          source?: string
          fetched_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      team_holdings: {
        Row: {
          team_id: string
          competition_id: string
          ticker: string
          stock_name: string
          currency: string
          total_shares: number
          avg_cost_per_share_sek: number
        }
        Relationships: []
      }
    }
    Functions: {
      execute_trade: {
        Args: {
          _competition_id: string
          _team_id: string
          _executed_by: string
          _ticker: string
          _stock_name: string
          _side: string
          _shares: number
          _price_per_share: number
          _currency: string
          _exchange_rate: number
          _total_sek: number
        }
        Returns: Json
      }
      is_competition_creator: {
        Args: { _competition_id: string }
        Returns: boolean
      }
      is_team_captain: { Args: { _team_id: string }; Returns: boolean }
      is_team_member: { Args: { _team_id: string }; Returns: boolean }
    }
    Enums: {
      trade_side: "buy" | "sell"
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
      trade_side: ["buy", "sell"] as const,
    },
  },
} as const
