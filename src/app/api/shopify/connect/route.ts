import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { ShopifyAPIClient } from "@/lib/shopifyClient";
import { createShopifyMapping } from "@/lib/phoneMapping";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            phone_number, 
            store_domain, 
            access_token, 
            website_url, 
            auth_token, 
            origin 
        } = body;

        // 1. Basic Validation
        if (!phone_number || !store_domain || !auth_token || !origin) {
            return NextResponse.json(
                { error: "Missing required fields: phone_number, store_domain, auth_token, or origin" },
                { status: 400 }
            );
        }

        // 2. Format Domain - Strip protocols and trailing slashes
        let shop = store_domain.trim().toLowerCase()
            .replace(/^https?:\/\//, '') // Remove http:// or https://
            .replace(/\/$/, '');         // Remove trailing slash

        if (!shop.includes(".")) {
            shop += ".myshopify.com";
        }

        // 3. Get or Verify Access Token
        let finalAccessToken = access_token;

        // If token not provided, try to find it in the database (for OAuth installs)
        if (!finalAccessToken) {
            console.log(`[DEBUG] No token in body, searching DB for domain: "${shop}"`);
            const { data: existingStore, error: findError } = await supabase
                .from('shopify_stores')
                .select('access_token, id')
                .eq('store_domain', shop)
                .single();
            
            if (findError) {
                console.error("[DEBUG] DB Search Error:", findError);
            }

            if (existingStore?.access_token) {
                finalAccessToken = existingStore.access_token;
                console.log(`[DEBUG] Found existing token. Length: ${finalAccessToken.length}`);
            } else {
                return NextResponse.json(
                    { error: "No access token provided and no existing installation found for this store domain. Please provide an Admin API token or install the app first." },
                    { status: 400 }
                );
            }
        }

        console.log(`Verifying Shopify store: ${shop}`);

        // Verify the token
        const shopifyClient = new ShopifyAPIClient(shop, finalAccessToken);
        let storeInfo;
        try {
            storeInfo = await shopifyClient.getStoreInfo();
            console.log(`Successfully verified store: ${storeInfo.name}`);
        } catch (shopifyErr: any) {
            console.error("Shopify verification failed:", shopifyErr);
            return NextResponse.json(
                { error: `Shopify verification failed: ${shopifyErr.message}. Make sure the token is an Admin API token (shpat_...)` },
                { status: 401 }
            );
        }

        // 4. Save/Update Shopify Store in shopify_stores table
        const { data: store, error: storeError } = await supabase
            .from('shopify_stores')
            .upsert({
                store_domain: shop,
                access_token: finalAccessToken,
                phone_number: phone_number,
                website_url: website_url || `https://${shop}`,
                store_name: storeInfo.name,
                installed_at: new Date().toISOString()
            }, {
                onConflict: 'store_domain'
            })
            .select()
            .single();

        if (storeError) {
            console.error("Database error (shopify_stores):", storeError);
            throw storeError;
        }

        // 5. Create/Update Phone Mapping in phone_document_mapping table
        // This connects the WhatsApp number to this Shopify store
        await createShopifyMapping(
            phone_number,
            store.id,
            "Sales and Support Assistant", // default intent
            "", // default system prompt (will be combined with base rules)
            auth_token,
            origin
        );

        return NextResponse.json({
            success: true,
            message: "Successfully connected Shopify store via Admin API",
            store: {
                id: store.id,
                name: store.store_name,
                domain: store.store_domain
            }
        });

    } catch (err: any) {
        console.error("Connection error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to connect Shopify store" },
            { status: 500 }
        );
    }
}
