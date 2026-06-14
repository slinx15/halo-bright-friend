import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ActivityLogInsert, JsonObject } from "@/lib/supabaseRows";

export type ActivityAction = 
  | "stock_in" 
  | "stock_out" 
  | "stock_out_delete"
  | "stock_reset"
  | "opname" 
  | "product_edit" 
  | "price_edit"
  | "product_create"
  | "product_delete";

export async function logActivity(
  action: ActivityAction,
  detail: string,
  metadata?: JsonObject
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload: ActivityLogInsert = {
      user_id: user.id,
      action,
      detail,
      metadata: (metadata ?? {}) as Json,
    };

    await supabase.from("activity_log").insert(payload);
  } catch {
    // Silent fail - logging should never block main operations
  }
}
