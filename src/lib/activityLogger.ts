import { supabase } from "@/integrations/supabase/client";

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
  metadata?: Record<string, any>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from("activity_log" as any).insert({
      user_id: user.id,
      action,
      detail,
      metadata: metadata || {},
    } as any);
  } catch {
    // Silent fail - logging should never block main operations
  }
}
