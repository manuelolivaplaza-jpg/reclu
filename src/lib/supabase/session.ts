import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * d63 (P3): una sola verificación de auth por request.
 * React.cache deduplica dentro del mismo render de servidor (layout + page + componentes).
 */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
