import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    const phoneNumber = searchParams.get("phone_number");
    const websiteUrl = searchParams.get("website_url");
    const authToken = searchParams.get("auth_token");
    const origin = searchParams.get("origin");

    if (!shop) {
        return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const scopes = process.env.SHOPIFY_SCOPES || "read_products,read_content,read_collections,read_orders";
    const redirectUri = `${process.env.APP_URL}/api/auth/shopify/callback`;
    const state = crypto.randomBytes(16).toString("hex");

    // Construct the Shopify OAuth URL
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

    // Create response and set state cookie for validation in callback
    const response = NextResponse.redirect(installUrl);
    
    // Helper to set cookie
    const setCookie = (name: string, value: string | null) => {
        if (value) {
            response.cookies.set(name, value, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                maxAge: 3600 // 1 hour
            });
        }
    };

    setCookie("shopify_state", state);
    setCookie("setup_phone_number", phoneNumber);
    setCookie("setup_website_url", websiteUrl);
    setCookie("setup_auth_token", authToken);
    setCookie("setup_origin", origin);

    return response;
}
