import { json, ActionFunctionArgs, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { extractPdfText } from "../../lib/pdf";
import { chunkText } from "../../lib/chunk";
import { embedText } from "../../lib/embeddings";
import { supabase } from "../../lib/supabaseClient";
import { Mistral } from '@mistralai/mistralai';

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    let fileId: string | null = null;
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    try {
        const uploadHandler = unstable_createMemoryUploadHandler({
            maxPartSize: 50 * 1024 * 1024,
        });
        const form = await unstable_parseMultipartFormData(request, uploadHandler);

        const file = form.get("file") as any; // Custom handling for file buffer in Remix
        const phoneNumber = form.get("phone_number") as string | null;
        const intent = form.get("intent") as string | null;
        const authToken = form.get("auth_token") as string | null;
        const origin = form.get("origin") as string | null;
        const devMode = form.get("dev_mode") === "true";
        const processingMode = form.get("processing_mode") as "ocr" | "transcribe";

        if (!file || !phoneNumber || !authToken || !origin) {
            return json({ error: "Missing required fields" }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const fileName = file.name;
        const fileType = file.type;

        let extractedText = "";
        let detectedFileType = "pdf";

        if (fileType === "application/pdf") {
            detectedFileType = "pdf";
            extractedText = await extractPdfText(buffer);
        } else if (fileType.startsWith("image/")) {
            detectedFileType = "image";
            if (!mistralApiKey) throw new Error("Mistral API key missing");

            const base64Image = Buffer.from(buffer).toString('base64');
            const dataUrl = `data:${fileType};base64,${base64Image}`;

            if (processingMode === "ocr") {
                const client = new Mistral({ apiKey: mistralApiKey });
                const ocrResponse = await client.ocr.process({
                    model: "mistral-ocr-latest",
                    document: { type: "image_url", imageUrl: dataUrl },
                });
                extractedText = (ocrResponse as any).pages?.[0]?.markdown || (ocrResponse as any).text || "";
            } else {
                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${mistralApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "pixtral-12b-2409",
                        messages: [{ role: "user", content: [{ type: "text", text: "Extract text" }, { type: "image_url", image_url: { url: dataUrl } }] }]
                    })
                });
                const res = await response.json();
                extractedText = res.choices[0].message.content || "";
            }
        }

        const { data: fileRow, error: fileError } = await supabase
            .from("rag_files")
            .insert({ name: fileName, file_type: detectedFileType, auth_token: authToken, origin: origin })
            .select().single();

        if (fileError) throw fileError;
        fileId = fileRow.id;

        const chunks = chunkText(extractedText, 1500).filter(c => c.trim().length > 0);
        const rows = [];

        for (const chunk of chunks) {
            const embedding = await embedText(chunk);
            rows.push({ file_id: fileId!, pdf_name: fileName, chunk, embedding });
        }

        await supabase.from("rag_chunks").insert(rows);

        await supabase.from("phone_document_mapping").upsert({
            phone_number: phoneNumber,
            file_id: fileId!,
            intent: intent || null,
            auth_token: authToken,
            origin: origin,
        }, { onConflict: 'phone_number,file_id' });

        return json({ success: true, chunks: chunks.length, file_id: fileId });

    } catch (err: any) {
        console.error("PROCESS_FILE_ERROR:", err.message);
        if (fileId) void supabase.from("rag_files").delete().eq("id", fileId);
        return json({ error: err.message }, { status: 500 });
    }
}
