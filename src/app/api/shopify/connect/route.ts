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
        if (!phone_number || !store_domain || !access_token || !auth_token || !origin) {
            return NextResponse.json(
                { error: "Missing required fields: phone_number, store_domain, access_token, auth_token, or origin" },
                { status: 400 }
            );
        }

        // 2. Format Domain
        let shop = store_domain.trim().toLowerCase();
        if (!shop.includes(".")) {
            shop += ".myshopify.com";
        }

        console.log(`Verifying Shopify store: ${shop}`);

        // 3. Verify Shopify Access Token & Domain
        const shopifyClient = new ShopifyAPIClient(shop, access_token);
        let storeInfo;
        try {
            storeInfo = await shopifyClient.getStoreInfo();
            console.log(`Successfully verified store: ${storeInfo.name}`);
        } catch (shopifyErr: any) {
            console.error("Shopify verification failed:", shopifyErr);
            return NextResponse.json(
                { error: `Shopify verification failed: ${shopifyErr.message}` },
                { status: 401 }
            );
        }

        // 4. Save/Update Shopify Store in shopify_stores table
        const { data: store, error: storeError } = await supabase
            .from('shopify_stores')
            .upsert({
                store_domain: shop,
                access_token: access_token,
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
