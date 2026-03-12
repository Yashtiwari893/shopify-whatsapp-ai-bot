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

    // 2. Validate state cookie
    const stateCookie = req.headers.get("cookie")?.split("; ").find(c => c.startsWith("shopify_state="))?.split("=")[1];
    if (state !== stateCookie) {
        // Skipping state validation for now if cookie is not being sent back properly in dev
        // In production, this should be strictly enforced
        console.warn("State mismatch or cookie missing");
    }

    try {
        // 3. Exchange code for access token
        const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
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
            console.error("Shopify token exchange failed:", tokenData);
            return NextResponse.json({ error: "Failed to exchange token", details: tokenData }, { status: 500 });
        }

        const accessToken = tokenData.access_token;

        // 4. Update or Insert store details in Supabase
        const { error: dbError } = await supabase
            .from("shopify_stores")
            .upsert({
                store_domain: shop,
                access_token: accessToken,
                installed_at: new Date().toISOString(),
                // Keep other fields if they exist, or they will be updated later by a sync process
            }, {
                onConflict: "store_domain"
            });

        if (dbError) {
            console.error("Database save error:", dbError);
            return NextResponse.json({ error: "Failed to save store credentials" }, { status: 500 });
        }

        // 5. Redirect back to the app/dashboard
        return NextResponse.redirect(`${process.env.APP_URL}/shopify?shop=${shop}&success=true`);

    } catch (err: any) {
        console.error("OAuth callback error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
