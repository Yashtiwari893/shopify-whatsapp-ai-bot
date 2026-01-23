import { supabase } from "@/lib/supabaseClient";

export async function retrieveRelevantChunks(
    queryEmbedding: number[],
    fileId?: string,
    limit = 5
) {
    const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_count: limit,
        target_file: fileId ?? null,
    });

    if (error) {
        console.error("VECTOR SEARCH ERROR:", error);
        throw error;
    }

    return data as { id: string; chunk: string; similarity: number }[];
}

/**
 * Retrieve relevant chunks from multiple files (for phone number mappings)
 */
export async function retrieveRelevantChunksFromFiles(
    queryEmbedding: number[],
    fileIds: string[],
    limit = 5
) {
    if (fileIds.length === 0) {
        return [];
    }

    if (fileIds.length === 1) {
        return retrieveRelevantChunks(queryEmbedding, fileIds[0], limit);
    }

    // For multiple files, we need to search across all of them
    // We'll get results from each file and then merge them
    const allChunks: { id: string; chunk: string; similarity: number; file_id: string }[] = [];

    for (const fileId of fileIds) {
        const chunks = await retrieveRelevantChunks(queryEmbedding, fileId, limit);
        allChunks.push(...chunks.map(c => ({ ...c, file_id: fileId })));
    }

    // Sort by similarity and return top N
    return allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Retrieve relevant Shopify chunks for a store
 */
export async function retrieveRelevantShopifyChunks(
    queryEmbedding: number[],
    storeId: string,
    limit = 5
) {
    const { data, error } = await supabase
        .from('shopify_chunks')
        .select('id, chunk_text, store_id, content_type, title, metadata')
        .eq('store_id', storeId)
        .order('embedding <-> \'[' + queryEmbedding.join(',') + ']\'::vector', { ascending: true })
        .limit(limit);

    if (error) {
        console.error("SHOPIFY VECTOR SEARCH ERROR:", error);
        throw error;
    }

    return data?.map(row => ({
        id: row.id,
        chunk: row.chunk_text,
        similarity: 0, // We could calculate actual similarity if needed
        store_id: row.store_id,
        content_type: row.content_type,
        title: row.title,
        metadata: row.metadata
    })) || [];
}
