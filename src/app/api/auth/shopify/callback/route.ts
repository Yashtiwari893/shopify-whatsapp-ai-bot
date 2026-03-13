import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const hmac = searchParams.get("hmac");

    // 1. Basic Validation
    if (!shop || !code || !state || !hmac) {
        return NextResponse.json({ error: "Missing required auth parameters" }, { status: 400 });
    }

    // 2. Validate cookies
    const cookies = req.headers.get("cookie") || "";
    const getCookie = (name: string) => cookies.split("; ").find(c => c.startsWith(`${name}=`))?.split("=")[1];

    const stateCookie = getCookie("shopify_state");
    const phoneNumber = getCookie("setup_phone_number");
    const websiteUrl = getCookie("setup_website_url");
    const authToken = getCookie("setup_auth_token");
    const origin = getCookie("setup_origin");

    if (state !== stateCookie) {
        console.warn("[OAUTH DEBUG] State mismatch or cookie missing");
    }

    // Normalize shop domain - Strip protocols if any (Shopify usually sends just hostname but let's be safe)
    const formattedShop = (shop || "").trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

    console.log(`[OAUTH DEBUG] Exchanging code for token for shop: ${formattedShop}`);

    try {
        // 3. Exchange code for access token
        const accessTokenResponse = await fetch(`https://${formattedShop}/admin/oauth/access_token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.SHOPIFY_CLIENT_ID,
                client_secret: process.env.SHOPIFY_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await accessTokenResponse.json();

        if (!accessTokenResponse.ok || !tokenData.access_token) {
            console.error("[OAUTH DEBUG] Shopify token exchange failed:", tokenData);
            return NextResponse.json({ error: "Failed to exchange token", details: tokenData }, { status: 500 });
        }

        const accessToken = tokenData.access_token;
        console.log(`[OAUTH DEBUG] Token received successfully for ${formattedShop}`);

        // 4. Update or Insert store details in Supabase
        console.log(`[OAUTH DEBUG] Attempting DB upsert for ${formattedShop}`);
        const { data: store, error: dbError } = await supabase
            .from("shopify_stores")
            .upsert({
                store_domain: formattedShop,
                access_token: accessToken,
                phone_number: phoneNumber || null,
                website_url: websiteUrl || `https://${formattedShop}`,
                installed_at: new Date().toISOString(),
            }, {
                onConflict: "store_domain"
            })
            .select()
            .single();

        if (dbError || !store) {
            console.error("[OAUTH DEBUG] Database save error details:", JSON.stringify(dbError, null, 2));
            return NextResponse.json({ error: "Failed to save store credentials", details: dbError }, { status: 500 });
        }

        console.log(`[OAUTH DEBUG] DB save successful. Store ID: ${store.id}`);

        // 5. Create phone mapping if we have the phone number
        const dashboardUrl = `${process.env.APP_URL || ''}/shopify`;
        
        if (phoneNumber) {
            const { createShopifyMapping } = await import("@/lib/phoneMapping");
            await createShopifyMapping(phoneNumber, store.id, "Sales and Support Assistant", "", authToken, origin);
            
            const { processShopifyStore } = await import("@/lib/shopifyProcessor");
            processShopifyStore(store.id).catch(err => console.error("Initial sync background error:", err));
            
            return NextResponse.redirect(`${dashboardUrl}?shop=${formattedShop}&success=true`);
        } else {
            console.log(`[OAUTH DEBUG] No phoneNumber found in cookies, redirecting to setup`);
            return NextResponse.redirect(`${dashboardUrl}?shop=${formattedShop}&setup_needed=true`);
        }

    } catch (err: any) {
        console.error("OAuth callback error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
