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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      captured_images: {
        Row: {
          created_at: string
          id: string
          image_type: string
          image_url: string
          inspection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_type?: string
          image_url: string
          inspection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_type?: string
          image_url?: string
          inspection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captured_images_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_results: {
        Row: {
          annotated_image: string | null
          confidence: number
          created_at: string
          defect_name: string
          id: string
          inspection_id: string
          status: string
        }
        Insert: {
          annotated_image?: string | null
          confidence?: number
          created_at?: string
          defect_name: string
          id?: string
          inspection_id: string
          status?: string
        }
        Update: {
          annotated_image?: string | null
          confidence?: number
          created_at?: string
          defect_name?: string
          id?: string
          inspection_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "defect_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          area: string
          created_at: string
          duration_seconds: number
          id: string
          inspection_date: string
          inspection_number: string
          inspection_time: string
          inspector_id: string
          model_id: string | null
          part_id: string | null
          remarks: string
          report_url: string | null
          shift: string
          status: string
        }
        Insert: {
          area?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          inspection_date?: string
          inspection_number?: string
          inspection_time?: string
          inspector_id: string
          model_id?: string | null
          part_id?: string | null
          remarks?: string
          report_url?: string | null
          shift?: string
          status?: string
        }
        Update: {
          area?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          inspection_date?: string
          inspection_number?: string
          inspection_time?: string
          inspector_id?: string
          model_id?: string | null
          part_id?: string | null
          remarks?: string
          report_url?: string | null
          shift?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_results: {
        Row: {
          actual: number
          created_at: string
          deviation: number
          expected: number
          id: string
          inspection_id: string
          parameter: string
          status: string
          tolerance: number
          unit: string
        }
        Insert: {
          actual: number
          created_at?: string
          deviation?: number
          expected: number
          id?: string
          inspection_id: string
          parameter: string
          status?: string
          tolerance?: number
          unit?: string
        }
        Update: {
          actual?: number
          created_at?: string
          deviation?: number
          expected?: number
          id?: string
          inspection_id?: string
          parameter?: string
          status?: string
          tolerance?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          id: string
          model_name: string
          model_path: string
          model_type: string
          part_id: string | null
          status: string
          uploaded_at: string
          version: string
        }
        Insert: {
          id?: string
          model_name: string
          model_path?: string
          model_type?: string
          part_id?: string | null
          status?: string
          uploaded_at?: string
          version?: string
        }
        Update: {
          id?: string
          model_name?: string
          model_path?: string
          model_type?: string
          part_id?: string | null
          status?: string
          uploaded_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          created_at: string
          description: string
          geometry_image: string | null
          id: string
          part_name: string
          reference_image: string | null
          surface_reference: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          geometry_image?: string | null
          id?: string
          part_name: string
          reference_image?: string | null
          surface_reference?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          geometry_image?: string | null
          id?: string
          part_name?: string
          reference_image?: string | null
          surface_reference?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          name?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      specifications: {
        Row: {
          created_at: string
          expected_value: number
          id: string
          notes: string
          parameter: string
          part_id: string
          tolerance: number
          unit: string
        }
        Insert: {
          created_at?: string
          expected_value: number
          id?: string
          notes?: string
          parameter: string
          part_id: string
          tolerance?: number
          unit?: string
        }
        Update: {
          created_at?: string
          expected_value?: number
          id?: string
          notes?: string
          parameter?: string
          part_id?: string
          tolerance?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "specifications_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: never; Returns: boolean }
      owns_inspection: { Args: { _id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "inspection_manager" | "inspector"
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
      app_role: ["inspection_manager", "inspector"],
    },
  },
} as const
