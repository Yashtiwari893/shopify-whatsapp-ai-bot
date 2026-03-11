import { json, ActionFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";
import { processShopifyStore } from "../lib/shopifyProcessor";
import { supabase } from "../lib/supabaseClient";

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await shopify.authenticate.admin(request);
    const { shop, accessToken } = session;

    try {
        // 1. Get store settings from Supabase
        const { data: store } = await supabase
            .from("shopify_stores")
            .select("phone_number")
            .eq("store_domain", shop)
            .single();

        if (!store?.phone_number) {
            return json({ error: "Please configure phone number in settings first" }, { status: 400 });
        }

        // 2. Trigger sync using Partner App session token
        // Note: If you want to use Admin API, processShopifyStore should be updated to use accessToken
        console.log(`Starting sync for ${shop}...`);

        // Yahan hum processing function call karenge
        await processShopifyStore(store.phone_number);

        return json({ success: true, message: "Sync started successfully" });
    } catch (err: any) {
        console.error("SYNC_ERROR:", err.message);
        return json({ error: err.message }, { status: 500 });
    }
}
