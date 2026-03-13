import { supabase } from "./supabaseClient";

export interface ShopifyStore {
    id: string;
    phone_number: string;
    store_domain: string;
    access_token: string;
    website_url: string;
    store_name?: string;
    last_synced_at?: string;
    installed_at?: string;
    created_at: string;
    updated_at: string;
}

export interface ShopifyProduct {
    id: string;
    title: string;
    description: string;
    handle: string;
    onlineStoreUrl?: string;
    variants: Array<{
        id: string;
        price: {
            amount: string;
            currencyCode: string;
        };
        compareAtPrice?: {
            amount: string;
            currencyCode: string;
        };
        availableForSale: boolean;
        sku?: string;
    }>;
    images: Array<{
        url: string;
        altText?: string;
    }>;
}

export interface ShopifyPage {
    id: string;
    title: string;
    handle: string;
    body: string;
}

export interface ShopifyCollection {
    id: string;
    title: string;
    description?: string;
    handle: string;
}

export class ShopifyAPIClient {
    private storeDomain: string;
    private accessToken: string;

    constructor(storeDomain: string, accessToken: string) {
        this.storeDomain = storeDomain;
        this.accessToken = accessToken;
    }

    private async makeRequest(query: string, variables?: any): Promise<any> {
        // Updated to use Admin API GraphQL endpoint
        const url = `https://${this.storeDomain}/admin/api/2024-01/graphql.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': this.accessToken, // Updated header for Admin API
            },
            body: JSON.stringify({
                query,
                variables: variables || {}
            })
        });

        if (!response.ok) {
            let details = "";
            try {
                details = await response.text();
                console.error(`[SHOPIFY DEBUG] Status ${response.status} Body:`, details);
            } catch (e) {
                details = "Could not read body";
            }

            let errorMessage = `Shopify API Error (${response.status}): ${details}`;

            if (response.status === 401) {
                errorMessage += " | Hint: Token might be invalid or expired. Check if Client ID matches.";
            } else if (response.status === 403) {
                errorMessage += " | Hint: Missing API Scopes. App needs read_products, read_content, etc.";
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        return data.data;
    }

    async getStoreInfo(): Promise<{ name: string }> {
        const query = `
            query GetStoreInfo {
                shop {
                    name
                }
            }
        `;

        const data = await this.makeRequest(query);
        return {
            name: data.shop.name
        };
    }

    async getProducts(first: number = 250, after?: string): Promise<{
        products: ShopifyProduct[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetProducts($first: Int!, $after: String) {
                products(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            description
                            handle
                            onlineStoreUrl
                            variants(first: 100) {
                                edges {
                                    node {
                                        id
                                        price {
                                            amount
                                            currencyCode
                                        }
                                        compareAtPrice {
                                            amount
                                            currencyCode
                                        }
                                        availableForSale
                                        sku
                                    }
                                }
                            }
                            images(first: 10) {
                                edges {
                                    node {
                                        url
                                        altText
                                    }
                                }
                            }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const products = data.products.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            description: edge.node.description,
            handle: edge.node.handle,
            onlineStoreUrl: edge.node.onlineStoreUrl,
            variants: edge.node.variants.edges.map((vEdge: any) => vEdge.node),
            images: edge.node.images.edges.map((iEdge: any) => iEdge.node)
        }));

        return {
            products,
            hasNextPage: data.products.pageInfo.hasNextPage,
            endCursor: data.products.pageInfo.endCursor
        };
    }

    async getPages(first: number = 100, after?: string): Promise<{
        pages: ShopifyPage[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetPages($first: Int!, $after: String) {
                pages(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            handle
                            body
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const pages = data.pages.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            handle: edge.node.handle,
            body: edge.node.body
        }));

        return {
            pages,
            hasNextPage: data.pages.pageInfo.hasNextPage,
            endCursor: data.pages.pageInfo.endCursor
        };
    }

    async getCollections(first: number = 100, after?: string): Promise<{
        collections: ShopifyCollection[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetCollections($first: Int!, $after: String) {
                collections(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            description
                            handle
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const collections = data.collections.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            description: edge.node.description,
            handle: edge.node.handle
        }));

        return {
            collections,
            hasNextPage: data.collections.pageInfo.hasNextPage,
            endCursor: data.collections.pageInfo.endCursor
        };
    }
}

// Database operations
export async function createShopifyStore(
    phoneNumber: string,
    storeDomain: string,
    accessToken: string,
    websiteUrl: string
): Promise<ShopifyStore> {
    // First validate the credentials
    const client = new ShopifyAPIClient(storeDomain, accessToken);
    const storeInfo = await client.getStoreInfo();

    const { data, error } = await supabase
        .from('shopify_stores')
        .upsert({
            phone_number: phoneNumber,
            store_domain: storeDomain,
            access_token: accessToken,
            website_url: websiteUrl,
            store_name: storeInfo.name,
            installed_at: new Date().toISOString()
        }, {
            onConflict: 'store_domain'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create Shopify store: ${error.message}`);
    }

    return data;
}

export async function getShopifyStoreByPhone(phoneNumber: string): Promise<ShopifyStore | null> {
    const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();

    if (error) {
        if (error.code === 'PGRST116') { // No rows returned
            return null;
        }
        throw new Error(`Failed to get Shopify store: ${error.message}`);
    }

    return data;
}

export async function getAllShopifyStores(): Promise<ShopifyStore[]> {
    const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to get Shopify stores: ${error.message}`);
    }

    return data || [];
}

export async function updateLastSynced(storeId: string): Promise<void> {
    const { error } = await supabase
        .from('shopify_stores')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', storeId);

    if (error) {
        throw new Error(`Failed to update last synced: ${error.message}`);
    }
}