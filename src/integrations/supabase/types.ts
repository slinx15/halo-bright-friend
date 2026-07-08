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
      activity_log: {
        Row: {
          action: string
          created_at: string
          detail: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_memories: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          source_conversation_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          source_conversation_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          source_conversation_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ivory_debt_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          debt_ids: Json
          id: string
          note: string
          paid_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          debt_ids?: Json
          id?: string
          note?: string
          paid_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          debt_ids?: Json
          id?: string
          note?: string
          paid_at?: string
        }
        Relationships: []
      }
      ivory_debt_settings: {
        Row: {
          debt_limit: number
          id: number
          updated_at: string
        }
        Insert: {
          debt_limit?: number
          id?: number
          updated_at?: string
        }
        Update: {
          debt_limit?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      ivory_debt_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          label: string
          source_image: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          label?: string
          source_image?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          label?: string
          source_image?: string | null
        }
        Relationships: []
      }
      ivory_debts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string
          invoice_number: string
          note: string
          paid_amount: number
          paid_at: string | null
          source_image: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          note?: string
          paid_amount?: number
          paid_at?: string | null
          source_image?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          note?: string
          paid_amount?: number
          paid_at?: string | null
          source_image?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_restock: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          ordered_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          ordered_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          ordered_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_restock_items: {
        Row: {
          created_at: string
          id: string
          kode: string
          product_id: string | null
          qty: number
          restock_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kode: string
          product_id?: string | null
          qty?: number
          restock_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kode?: string
          product_id?: string | null
          qty?: number
          restock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_restock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_restock_items_restock_id_fkey"
            columns: ["restock_id"]
            isOneToOne: false
            referencedRelation: "pending_restock"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          harga_grosir: number
          harga_grosir2: number
          harga_modal: number
          harga_normal: number
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          harga_grosir?: number
          harga_grosir2?: number
          harga_modal?: number
          harga_normal?: number
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          harga_grosir?: number
          harga_grosir2?: number
          harga_modal?: number
          harga_normal?: number
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kategori: string | null
          kode: string
          nama: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kategori?: string | null
          kode: string
          nama?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kategori?: string | null
          kode?: string
          nama?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      restock_plans: {
        Row: {
          coverage_days: number
          created_at: string
          id: string
          start_date: string
          status: string
          total_budget: number
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coverage_days?: number
          created_at?: string
          id?: string
          start_date?: string
          status?: string
          total_budget: number
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coverage_days?: number
          created_at?: string
          id?: string
          start_date?: string
          status?: string
          total_budget?: number
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock: {
        Row: {
          id: string
          jumlah: number
          product_id: string
          tumpukan: string | null
          tumpukan_detail: Json | null
          updated_at: string
        }
        Insert: {
          id?: string
          jumlah?: number
          product_id: string
          tumpukan?: string | null
          tumpukan_detail?: Json | null
          updated_at?: string
        }
        Update: {
          id?: string
          jumlah?: number
          product_id?: string
          tumpukan?: string | null
          tumpukan_detail?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_jumlah: number | null
          new_tumpukan_detail: Json | null
          old_jumlah: number | null
          old_tumpukan_detail: Json | null
          operation: string
          product_id: string | null
          stock_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_jumlah?: number | null
          new_tumpukan_detail?: Json | null
          old_jumlah?: number | null
          old_tumpukan_detail?: Json | null
          operation: string
          product_id?: string | null
          stock_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_jumlah?: number | null
          new_tumpukan_detail?: Json | null
          old_jumlah?: number | null
          old_tumpukan_detail?: Json | null
          operation?: string
          product_id?: string | null
          stock_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_in: {
        Row: {
          catatan: string | null
          created_at: string
          id: string
          product_id: string
          qty: number
          tumpukan: string | null
          user_id: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          id?: string
          product_id: string
          qty: number
          tumpukan?: string | null
          user_id: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          tumpukan?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_in_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_log: {
        Row: {
          catatan: string | null
          created_at: string
          id: string
          product_id: string
          selisih: number
          status: string
          stok_fisik: number
          stok_sistem: number
          user_id: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          id?: string
          product_id: string
          selisih?: number
          status?: string
          stok_fisik?: number
          stok_sistem?: number
          user_id: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          id?: string
          product_id?: string
          selisih?: number
          status?: string
          stok_fisik?: number
          stok_sistem?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out: {
        Row: {
          catatan: string | null
          created_at: string
          harga_satuan: number
          harga_type: string
          id: string
          product_id: string
          qty_kirim: number
          qty_pesan: number
          stock_jumlah_before: number | null
          stock_tumpukan_before: Json | null
          toko: string | null
          total_harga: number
          user_id: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          harga_satuan?: number
          harga_type?: string
          id?: string
          product_id: string
          qty_kirim?: number
          qty_pesan?: number
          stock_jumlah_before?: number | null
          stock_tumpukan_before?: Json | null
          toko?: string | null
          total_harga?: number
          user_id: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          harga_satuan?: number
          harga_type?: string
          id?: string
          product_id?: string
          qty_kirim?: number
          qty_pesan?: number
          stock_jumlah_before?: number | null
          stock_tumpukan_before?: Json | null
          toko?: string | null
          total_harga?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      build_default_tumpukan_detail: {
        Args: { p_kode: string; p_qty: number }
        Returns: Json
      }
      bulk_upsert_products: { Args: { p_rows: Json }; Returns: Json }
      deduct_int_jsonb_stacks: {
        Args: { _qty: number; _stacks: Json }
        Returns: Json
      }
      delete_stock_in_transaction: {
        Args: { p_stock_in_id: string }
        Returns: Json
      }
      delete_stock_out_transaction: {
        Args: { p_stock_out_id: string }
        Returns: Json
      }
      has_inventory_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      jsonb_int_array_sum: { Args: { _arr: Json }; Returns: number }
      jsonb_stack_text: { Args: { _stacks: Json }; Returns: string }
      register_stock_in: {
        Args: {
          p_catatan?: string
          p_created_at?: string
          p_product_id: string
          p_qty: number
          p_tumpukan_detail?: Json
        }
        Returns: Json
      }
      register_stock_opname: {
        Args: {
          p_catatan?: string
          p_product_id: string
          p_stok_fisik: number
          p_tumpukan_detail?: Json
        }
        Returns: Json
      }
      register_stock_out: {
        Args: {
          p_catatan?: string
          p_created_at?: string
          p_harga_satuan: number
          p_harga_type: string
          p_product_id: string
          p_qty_kirim: number
          p_qty_pesan: number
          p_toko?: string
        }
        Returns: Json
      }
      sort_int_jsonb_array: { Args: { _arr: Json }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "karyawan"
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
      app_role: ["admin", "karyawan"],
    },
  },
} as const
