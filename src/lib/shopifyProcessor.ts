import { chunkText } from "./chunk";
import { embedText } from "./embeddings";
import { supabase } from "./supabaseClient";
import { ShopifyAPIClient, ShopifyProduct, ShopifyPage, ShopifyCollection } from "./shopifyClient";

export interface ShopifyChunkData {
    content_type: 'product' | 'page' | 'collection';
    content_id: string;
    title: string;
    text: string;
    metadata: any;
}

export class ShopifyDataProcessor {
    private client: ShopifyAPIClient;
    private storeId: string;

    constructor(storeDomain: string, storefrontToken: string, storeId: string) {
        this.client = new ShopifyAPIClient(storeDomain, storefrontToken);
        this.storeId = storeId;
    }

    // Convert product to readable text
    private productToText(product: ShopifyProduct): string {
        let text = `Product: ${product.title}\n`;

        if (product.description) {
            // Remove HTML tags and clean up description
            const cleanDescription = product.description.replace(/<[^>]*>/g, '').trim();
            text += `Description: ${cleanDescription}\n`;
        }

        // Add pricing information
        const prices = product.variants.map(v => parseFloat(v.price.amount)).filter(p => !isNaN(p));
        if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const currencyCode = product.variants[0].price.currencyCode;
            if (minPrice === maxPrice) {
                text += `Price: ${currencyCode} ${minPrice.toFixed(2)}\n`;
            } else {
                text += `Price Range: ${currencyCode} ${minPrice.toFixed(2)} - ${currencyCode} ${maxPrice.toFixed(2)}\n`;
            }
        }

        // Add availability
        const availableVariants = product.variants.filter(v => v.availableForSale);
        const totalVariants = product.variants.length;
        text += `Availability: ${availableVariants.length}/${totalVariants} variants available\n`;

        // Add SKUs if available
        const skus = product.variants.map(v => v.sku).filter(Boolean);
        if (skus.length > 0) {
            text += `SKUs: ${skus.join(', ')}\n`;
        }

        // Add image info
        if (product.images.length > 0) {
            text += `Images: ${product.images.length} available\n`;
        }

        return text.trim();
    }

    // Convert page to readable text
    private pageToText(page: ShopifyPage): string {
        let text = `Page: ${page.title}\n`;

        if (page.body) {
            // Remove HTML tags and clean up body
            const cleanBody = page.body.replace(/<[^>]*>/g, '').trim();
            text += `Content: ${cleanBody}\n`;
        }

        return text.trim();
    }

    // Convert collection to readable text
    private collectionToText(collection: ShopifyCollection): string {
        let text = `Collection: ${collection.title}\n`;

        if (collection.description) {
            const cleanDescription = collection.description.replace(/<[^>]*>/g, '').trim();
            text += `Description: ${cleanDescription}\n`;
        }

        return text.trim();
    }

    // Process all data from Shopify store
    async processAllData(): Promise<void> {
        console.log('Starting Shopify data processing...');

        // Clear existing chunks for this store
        await this.clearExistingChunks();

        // Process products
        await this.processProducts();

        // Process pages
        await this.processPages();

        // Process collections
        await this.processCollections();

        console.log('Shopify data processing completed.');
    }

    private async clearExistingChunks(): Promise<void> {
        const { error } = await supabase
            .from('shopify_chunks')
            .delete()
            .eq('store_id', this.storeId);

        if (error) {
            throw new Error(`Failed to clear existing chunks: ${error.message}`);
        }

        console.log(`Cleared existing chunks for store ${this.storeId}`);
    }

    private async processProducts(): Promise<void> {
        console.log('Processing products...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalProducts = 0;

        while (hasNextPage) {
            const { products, hasNextPage: nextPage, endCursor: cursor } = await this.client.getProducts(250, endCursor);

            for (const product of products) {
                await this.processProduct(product);
                totalProducts++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalProducts} products`);
    }

    private async processProduct(product: ShopifyProduct): Promise<void> {
        const text = this.productToText(product);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        const metadata = {
            handle: product.handle,
            variants_count: product.variants.length,
            images_count: product.images.length,
            available_variants: product.variants.filter(v => v.availableForSale).length
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'product',
                content_id: product.id,
                title: product.title,
                text: chunk,
                metadata
            });
        }
    }

    private async processPages(): Promise<void> {
        console.log('Processing pages...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalPages = 0;

        while (hasNextPage) {
            const { pages, hasNextPage: nextPage, endCursor: cursor } = await this.client.getPages(100, endCursor);

            for (const page of pages) {
                await this.processPage(page);
                totalPages++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalPages} pages`);
    }

    private async processPage(page: ShopifyPage): Promise<void> {
        const text = this.pageToText(page);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        const metadata = {
            handle: page.handle
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'page',
                content_id: page.id,
                title: page.title,
                text: chunk,
                metadata
            });
        }
    }

    private async processCollections(): Promise<void> {
        console.log('Processing collections...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalCollections = 0;

        while (hasNextPage) {
            const { collections, hasNextPage: nextPage, endCursor: cursor } = await this.client.getCollections(100, endCursor);

            for (const collection of collections) {
                await this.processCollection(collection);
                totalCollections++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalCollections} collections`);
    }

    private async processCollection(collection: ShopifyCollection): Promise<void> {
        const text = this.collectionToText(collection);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        const metadata = {
            handle: collection.handle
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'collection',
                content_id: collection.id,
                title: collection.title,
                text: chunk,
                metadata
            });
        }
    }

    private async storeChunk(chunkData: ShopifyChunkData): Promise<void> {
        // Generate embedding for the chunk
        const embedding = await embedText(chunkData.text);

        if (!embedding) {
            throw new Error(`Failed to generate embedding for chunk: ${chunkData.title}`);
        }

        // Store in database
        const { error } = await supabase
            .from('shopify_chunks')
            .insert({
                store_id: this.storeId,
                content_type: chunkData.content_type,
                content_id: chunkData.content_id,
                title: chunkData.title,
                chunk_text: chunkData.text,
                embedding,
                metadata: chunkData.metadata
            });

        if (error) {
            // Handle unique constraint violations (skip duplicates)
            if (error.code === '23505') {
                console.log(`Skipping duplicate chunk for ${chunkData.content_type}: ${chunkData.title}`);
                return;
            }
            throw new Error(`Failed to store chunk: ${error.message}`);
        }
    }
}

// Utility function to process a store
export async function processShopifyStore(storeId: string): Promise<void> {
    // Get store details
    const { data: store, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('id', storeId)
        .single();

    if (error || !store) {
        throw new Error(`Store not found: ${storeId}`);
    }

    const processor = new ShopifyDataProcessor(
        store.store_domain,
        store.storefront_token,
        storeId
    );

    await processor.processAllData();

    // Update last synced timestamp
    await supabase
        .from('shopify_stores')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', storeId);
}