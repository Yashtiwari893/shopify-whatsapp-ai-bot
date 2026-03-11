import { json, ActionFunctionArgs } from "@remix-run/node";
import { supabase } from "../lib/supabaseClient";
import { generateAutoResponse } from "../lib/autoResponder";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const payload = await request.json();
        console.log("Received WhatsApp webhook:", payload);

        if (!payload.messageId || !payload.from || !payload.to) {
            return json({ error: "Missing required fields" }, { status: 400 });
        }

        // Insert into database
        const { data, error } = await supabase
            .from("whatsapp_messages")
            .insert([
                {
                    message_id: payload.messageId,
                    channel: payload.channel,
                    from_number: payload.from,
                    to_number: payload.to,
                    received_at: payload.receivedAt,
                    content_type: payload.content?.contentType,
                    content_text: payload.content?.text || payload.UserResponse,
                    sender_name: payload.whatsapp?.senderName,
                    event_type: payload.event,
                    is_in_24_window: payload.isin24window || false,
                    is_responded: payload.isResponded || false,
                    raw_payload: payload,
                },
            ])
            .select();

        if (error) {
            if (error.code === "23505") {
                return json({ success: true, message: "Already processed" }, { status: 200 });
            }
            throw error;
        }

        const messageText = payload.content?.text || payload.UserResponse;
        if (messageText && payload.event === "MoMessage") {
            await generateAutoResponse(
                payload.from,
                payload.to,
                messageText,
                payload.messageId
            );
        }

        return json({ success: true, data: data?.[0] });
    } catch (err: any) {
        console.error("WEBHOOK_ERROR:", err.message);
        return json({ error: err.message }, { status: 500 });
    }
}

// Verification for some WhatsApp API providers (GET request)
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "your_verify_token";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
    }

    return json({ error: "Forbidden" }, { status: 403 });
}
