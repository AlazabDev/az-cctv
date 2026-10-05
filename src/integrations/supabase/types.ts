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
      agent_design_proposals: {
        Row: {
          cameras: Json
          created_at: string
          decided_at: string | null
          id: string
          iterations: number
          layout_id: string | null
          metrics: Json
          project_id: string
          status: string
          summary: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          cameras?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          iterations?: number
          layout_id?: string | null
          metrics?: Json
          project_id: string
          status?: string
          summary?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Update: {
          cameras?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          iterations?: number
          layout_id?: string | null
          metrics?: Json
          project_id?: string
          status?: string
          summary?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_design_proposals_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "cctv_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_design_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cctv_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_design_proposals_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          agent_name: string | null
          agent_version: string | null
          content: string
          created_at: string
          id: string
          response_id: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string | null
          content: string
          created_at?: string
          id?: string
          response_id?: string | null
          role: string
          thread_id: string
          user_id?: string
        }
        Update: {
          agent_name?: string | null
          agent_version?: string | null
          content?: string
          created_at?: string
          id?: string
          response_id?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_threads: {
        Row: {
          created_at: string
          id: string
          last_response_id: string | null
          layout_id: string | null
          project_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_response_id?: string | null
          layout_id?: string | null
          project_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_response_id?: string | null
          layout_id?: string | null
          project_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_threads_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "cctv_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cctv_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cctv_layout_revisions: {
        Row: {
          ceiling_height_m: number
          created_at: string
          design_data: Json
          geometry: Json
          geometry_status: string
          id: string
          layout_id: string
          project_id: string
          px_per_meter: number | null
          reason: string
          revision_no: number
          user_id: string
        }
        Insert: {
          ceiling_height_m: number
          created_at?: string
          design_data: Json
          geometry: Json
          geometry_status: string
          id?: string
          layout_id: string
          project_id: string
          px_per_meter?: number | null
          reason?: string
          revision_no: number
          user_id?: string
        }
        Update: {
          ceiling_height_m?: number
          created_at?: string
          design_data?: Json
          geometry?: Json
          geometry_status?: string
          id?: string
          layout_id?: string
          project_id?: string
          px_per_meter?: number | null
          reason?: string
          revision_no?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cctv_layout_revisions_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "cctv_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_layout_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cctv_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cctv_layouts: {
        Row: {
          ceiling_height_m: number
          created_at: string
          design_data: Json
          floorplan_path: string | null
          geometry: Json
          geometry_status: string
          id: string
          image_height: number | null
          image_width: number | null
          is_active: boolean
          name: string
          project_id: string
          px_per_meter: number | null
          rendered_plan_path: string | null
          sort_order: number
          source_mime_type: string | null
          source_page: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ceiling_height_m?: number
          created_at?: string
          design_data?: Json
          floorplan_path?: string | null
          geometry?: Json
          geometry_status?: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_active?: boolean
          name: string
          project_id: string
          px_per_meter?: number | null
          rendered_plan_path?: string | null
          sort_order?: number
          source_mime_type?: string | null
          source_page?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          ceiling_height_m?: number
          created_at?: string
          design_data?: Json
          floorplan_path?: string | null
          geometry?: Json
          geometry_status?: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_active?: boolean
          name?: string
          project_id?: string
          px_per_meter?: number | null
          rendered_plan_path?: string | null
          sort_order?: number
          source_mime_type?: string | null
          source_page?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cctv_layouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cctv_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cctv_projects: {
        Row: {
          client_name: string | null
          created_at: string
          currency: string
          data: Json
          floorplan_path: string | null
          id: string
          name: string
          site_address: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          currency?: string
          data?: Json
          floorplan_path?: string | null
          id?: string
          name?: string
          site_address?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          currency?: string
          data?: Json
          floorplan_path?: string | null
          id?: string
          name?: string
          site_address?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string
          id: string
          is_primary: boolean
          product_id: string
          public_url: string | null
          sort_order: number
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name: string
          id?: string
          is_primary?: boolean
          product_id: string
          public_url?: string | null
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          public_url?: string | null
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          checked_at: string
          created_at: string
          currency: string
          id: string
          old_price: number | null
          price: number
          product_id: string
          source_url: string | null
          stock_status: string | null
          supplier: string
        }
        Insert: {
          checked_at?: string
          created_at?: string
          currency?: string
          id?: string
          old_price?: number | null
          price: number
          product_id: string
          source_url?: string | null
          stock_status?: string | null
          supplier: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          currency?: string
          id?: string
          old_price?: number | null
          price?: number
          product_id?: string
          source_url?: string | null
          stock_status?: string | null
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          category_id: string | null
          created_at: string
          currency: string
          current_price: number | null
          description: string | null
          discount_percent: number | null
          form_factor: string | null
          id: string
          image_name: string | null
          image_url: string | null
          is_active: boolean
          model: string
          name_ar: string | null
          name_en: string | null
          old_price: number | null
          power_type: string | null
          product_name: string | null
          product_type: string | null
          sku: string | null
          source: string | null
          source_row: number | null
          source_url: string | null
          specifications: Json
          subcategory: string | null
          technology: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          current_price?: number | null
          description?: string | null
          discount_percent?: number | null
          form_factor?: string | null
          id?: string
          image_name?: string | null
          image_url?: string | null
          is_active?: boolean
          model: string
          name_ar?: string | null
          name_en?: string | null
          old_price?: number | null
          power_type?: string | null
          product_name?: string | null
          product_type?: string | null
          sku?: string | null
          source?: string | null
          source_row?: number | null
          source_url?: string | null
          specifications?: Json
          subcategory?: string | null
          technology?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          current_price?: number | null
          description?: string | null
          discount_percent?: number | null
          form_factor?: string | null
          id?: string
          image_name?: string | null
          image_url?: string | null
          is_active?: boolean
          model?: string
          name_ar?: string | null
          name_en?: string | null
          old_price?: number | null
          power_type?: string | null
          product_name?: string | null
          product_type?: string | null
          sku?: string | null
          source?: string | null
          source_row?: number | null
          source_url?: string | null
          specifications?: Json
          subcategory?: string | null
          technology?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_cctv_layout: {
        Args: { p_layout_id: string }
        Returns: {
          ceiling_height_m: number
          created_at: string
          design_data: Json
          floorplan_path: string | null
          geometry: Json
          geometry_status: string
          id: string
          image_height: number | null
          image_width: number | null
          is_active: boolean
          name: string
          project_id: string
          px_per_meter: number | null
          rendered_plan_path: string | null
          sort_order: number
          source_mime_type: string | null
          source_page: number | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cctv_layouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_cctv_layout_geometry: {
        Args: { p_geometry: Json; p_layout_id: string; p_px_per_meter?: number }
        Returns: string
      }
      assert_layout_ready_for_design: {
        Args: { p_layout_id: string }
        Returns: boolean
      }
      snapshot_cctv_layout: {
        Args: { p_layout_id: string; p_reason?: string }
        Returns: string
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
