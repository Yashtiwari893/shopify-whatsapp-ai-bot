import { json, ActionFunctionArgs } from "@remix-run/node";
import Groq from "groq-sdk";
import { supabase } from "../lib/supabaseClient";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    try {
        const { intent, phone_number } = await request.json();
        if (!intent || !phone_number) return json({ error: "Missing intent or phone_number" }, { status: 400 });

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "Professional AI system prompt generator." },
                { role: "user", content: `Create a system prompt for WhatsApp: "${intent}"` }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const systemPrompt = completion.choices[0]?.message?.content || "";
        await supabase.from("phone_document_mapping").upsert({
            phone_number,
            intent,
            system_prompt: systemPrompt,
        }, { onConflict: "phone_number" });

        return json({ success: true, system_prompt: systemPrompt, intent });

    } catch (err: any) {
        console.error("GEN_PROMPT_ERROR:", err.message);
        return json({ error: err.message }, { status: 500 });
    }
}
