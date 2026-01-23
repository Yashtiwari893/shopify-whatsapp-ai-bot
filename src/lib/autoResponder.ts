import { supabase } from "./supabaseClient";
import { embedText } from "./embeddings";
import { retrieveRelevantChunksFromFiles, retrieveRelevantShopifyChunks } from "./retrieval";
import { getFilesForPhoneNumber, getShopifyStoreForPhoneNumber, getDataSourceForPhone } from "./phoneMapping";
import { sendWhatsAppMessage } from "./whatsappSender";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

/**
 * Generic retry function for Supabase queries
 */
async function retrySupabaseQuery(
    queryFn: () => Promise<{ data: any; error: any }>,
    maxRetries: number = 3
): Promise<{ data: any; error: any }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await queryFn();

        if (!result.error) {
            return result;
        }

        if (attempt < maxRetries) {
            console.log(`Supabase query attempt ${attempt} failed, retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }

    // Return the last result (which will have the error)
    return await queryFn();
}

export type AutoResponseResult = {
    success: boolean;
    response?: string;
    error?: string;
    noDocuments?: boolean;
    sent?: boolean; // Whether message was sent via WhatsApp
};

/**
 * Generate an automatic response for a WhatsApp message
 * @param fromNumber - The sender's phone number (who sent the message)
 * @param toNumber - The business WhatsApp number (where message was received)
 * @param messageText - The text of the message
 * @param messageId - The unique message ID
 */
export async function generateAutoResponse(
    fromNumber: string,
    toNumber: string,
    messageText: string,
    messageId: string
): Promise<AutoResponseResult> {
    try {
        // 1. Determine data source type for this phone number
        const dataSource = await getDataSourceForPhone(toNumber);

        if (!dataSource) {
            console.log(`No data source mapped for business number: ${toNumber}`);
            return {
                success: false,
                noDocuments: true,
                error: "No data source mapped to this business number",
            };
        }

        console.log(`Data source for ${toNumber}: ${dataSource}`);

        let matches: any[] = [];
        let customSystemPrompt: string | undefined;
        let auth_token: string | undefined;
        let origin: string | undefined;

        // 1.5. Fetch phone mapping details including system prompt and credentials
        const { data: phoneMappings, error: mappingError } = await retrySupabaseQuery(async () =>
            await supabase
                .from("phone_document_mapping")
                .select("system_prompt, intent, auth_token, origin")
                .eq("phone_number", toNumber)
        );

        if (mappingError || !phoneMappings || phoneMappings.length === 0) {
            console.error("Error fetching phone mappings:", mappingError);
            return {
                success: false,
                error: "Failed to fetch phone mapping details",
            };
        }

        // Get system prompt and credentials from first mapping (they should all be the same)
        customSystemPrompt = phoneMappings[0].system_prompt;
        auth_token = phoneMappings[0].auth_token;
        origin = phoneMappings[0].origin;

        console.log(`Retrieved ${phoneMappings.length} mappings for phone ${toNumber}`);
        console.log(`Intent: ${phoneMappings[0].intent}`);
        console.log(`Has custom system prompt: ${!!customSystemPrompt}`);
        if (customSystemPrompt) {
            console.log(`Custom system prompt (first 100 chars): ${customSystemPrompt.substring(0, 100)}...`);
        }

        if (!auth_token || !origin) {
            console.error("No credentials found for phone number");
            return {
                success: false,
                error: "No WhatsApp API credentials found. Please set credentials in the Configuration tab.",
            };
        }

        // 2. Embed the user query
        const queryEmbedding = await embedText(messageText);

        if (!queryEmbedding) {
            return {
                success: false,
                error: "Failed to generate embedding for message",
            };
        }

        // 3. Retrieve relevant chunks based on data source
        if (dataSource === 'shopify') {
            const shopifyStoreId = await getShopifyStoreForPhoneNumber(toNumber);
            if (!shopifyStoreId) {
                return {
                    success: false,
                    noDocuments: true,
                    error: "No Shopify store mapped to this business number",
                };
            }

            console.log(`Retrieving chunks from Shopify store: ${shopifyStoreId}`);
            matches = await retrieveRelevantShopifyChunks(queryEmbedding, shopifyStoreId, 5);
        } else {
            // Original file-based logic
            const fileIds = await getFilesForPhoneNumber(toNumber);

            if (fileIds.length === 0) {
                console.log(`No documents mapped for business number: ${toNumber}`);
                return {
                    success: false,
                    noDocuments: true,
                    error: "No documents mapped to this business number",
                };
            }

            console.log(`Found ${fileIds.length} document(s) for business number ${toNumber}`);
            matches = await retrieveRelevantChunksFromFiles(queryEmbedding, fileIds, 5);
        }

        if (matches.length === 0) {
            console.log("No relevant chunks found");
        }

        const contextText = matches.map((m) => m.chunk).join("\n\n");

        // 4. Get conversation history for this phone number
        const { data: historyRows } = await supabase
            .from("whatsapp_messages")
            .select("content_text, event_type, from_number, to_number")
            .or(`from_number.eq.${fromNumber},to_number.eq.${fromNumber}`) // Messages involving this user
            .order("received_at", { ascending: true })
            .limit(20); // Last 20 messages for better context

        // Build conversation history (user messages and AI responses)
        const history = (historyRows || [])
            .filter(m => m.content_text && (m.event_type === "MoMessage" || m.event_type === "MtMessage"))
            .map(m => ({
                role: m.event_type === "MoMessage" ? "user" as const : "assistant" as const,
                content: m.content_text
            }));

        // 5. Generate response using Groq with dynamic system prompt
        const baseRules = dataSource === 'shopify'
            ? `You are a helpful Shopify store assistant. Your ONLY job is to answer customer questions based strictly on the provided store data.

STRICT RULES:
- ONLY answer using information from the CONTEXT below
- Focus on products, pricing, availability, and store information
- If asked about unavailable products, inform customer politely
- Provide pricing in the store's currency format
- If information is not in the context, say you don't have that information but can help with other questions
- Be friendly, helpful, and conversational
- Detect the customer's language and respond in the same language
- Keep responses concise and appropriate for WhatsApp chat
- Format responses with line breaks for readability`
            : `Your ONLY job is to answer questions based strictly on the provided document context.

STRICT RULES:
- ONLY answer questions using information from the CONTEXT below
- If the answer is not in the CONTEXT, say "I don't have that information in the document"
- NEVER use your general knowledge or make assumptions beyond the document
- NEVER offer to do tasks you cannot do (generate files, make calls, etc.)
- Be concise and friendly - keep responses under 300 words
- Use clear, simple language appropriate for WhatsApp chat
- Format responses with line breaks for readability`;

        let systemPrompt: string;
        if (customSystemPrompt) {
            // Combine custom prompt with base rules
            systemPrompt = `${customSystemPrompt}\n\n${baseRules}`;
        } else {
            // Use default prompt with base rules
            systemPrompt = `You are a helpful ${dataSource === 'shopify' ? 'Shopify store' : 'WhatsApp'} assistant.\n\n${baseRules}`;
        }

        const messages = [
            {
                role: "system" as const,
                content: `${systemPrompt}\n\nCONTEXT:\n${contextText || "No relevant context found in the documents."}`
            },
            ...history.slice(-10), // Include last 10 messages (5 pairs) for context
            { role: "user" as const, content: messageText }
        ];

        console.log(`Final system prompt (first 200 chars): ${systemPrompt.substring(0, 200)}...`);
        console.log(`Context text length: ${contextText?.length || 0} characters`);
        console.log(`Conversation history: ${history.length} messages`);

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: 0.2,
            max_tokens: 500, // Keep responses concise for WhatsApp
        });

        const response = completion.choices[0].message.content;

        if (!response) {
            return {
                success: false,
                error: "No response generated from LLM",
            };
        }

        // 6. Send the response via WhatsApp using file-specific credentials
        const sendResult = await sendWhatsAppMessage(fromNumber, response, auth_token, origin);

        if (!sendResult.success) {
            console.error("Failed to send WhatsApp message:", sendResult.error);
            // Still mark as attempted in database
            await supabase
                .from("whatsapp_messages")
                .update({
                    auto_respond_sent: false,
                    response_sent_at: new Date().toISOString(),
                })
                .eq("message_id", messageId);

            return {
                success: false,
                response,
                sent: false,
                error: `Generated response but failed to send: ${sendResult.error}`,
            };
        }

        // 6.5. Store the AI response in the database for conversation history
        const responseMessageId = `auto_${messageId}_${Date.now()}`;
        await supabase
            .from("whatsapp_messages")
            .insert([
                {
                    message_id: responseMessageId,
                    channel: "whatsapp",
                    from_number: toNumber, // Business number (sender)
                    to_number: fromNumber, // Customer number (recipient)
                    received_at: new Date().toISOString(),
                    content_type: "text",
                    content_text: response,
                    sender_name: "AI Assistant",
                    event_type: "MtMessage", // Mobile Terminated (outgoing)
                    is_in_24_window: true,
                    is_responded: false,
                    raw_payload: {
                        messageId: responseMessageId,
                        channel: "whatsapp",
                        from: toNumber,
                        to: fromNumber,
                        content: { contentType: "text", text: response },
                        event: "MtMessage",
                        isAutoResponse: true
                    },
                },
            ]);

        // 7. Mark the message as responded in database
        await supabase
            .from("whatsapp_messages")
            .update({
                auto_respond_sent: true,
                response_sent_at: new Date().toISOString(),
            })
            .eq("message_id", messageId);

        console.log(`✅ Auto-response sent successfully to ${fromNumber}`);

        return {
            success: true,
            response,
            sent: true,
        };
    } catch (error) {
        console.error("Auto-response error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
