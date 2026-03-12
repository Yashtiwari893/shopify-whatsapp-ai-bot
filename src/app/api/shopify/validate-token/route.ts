import { NextResponse } from "next/server";
import { ShopifyAPIClient } from "@/lib/shopifyClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { store_domain, access_token } = body;

    if (!store_domain || !access_token) {
      throw new Error("store_domain and access_token are required");
    }

    if (!store_domain.endsWith('.myshopify.com')) {
      throw new Error("Invalid Shopify store domain. Must end with '.myshopify.com'");
    }

    const client = new ShopifyAPIClient(store_domain, access_token);

    const storeInfo = await client.getStoreInfo();

    return NextResponse.json({
      valid: true,
      store_name: storeInfo.name
    });

  } catch (error: any) {
    return NextResponse.json({
      valid: false,
      error: error.message || "Failed to validate access token"
    }, { status: 400 });
  }
}