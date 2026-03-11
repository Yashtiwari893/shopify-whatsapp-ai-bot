import { json, LoaderFunctionArgs } from "@remix-run/node";
import { supabase } from "../../lib/supabaseClient";

export async function loader({ request }: LoaderFunctionArgs) {
    try {
        const { data: mappings, error: mappingError } = await supabase
            .from("phone_document_mapping")
            .select(`
        phone_number,
        intent,
        system_prompt,
        auth_token,
        origin,
        file_id,
        rag_files (
          id,
          name,
          file_type,
          created_at
        )
      `)
            .order("phone_number", { ascending: true });

        if (mappingError) throw mappingError;

        const { data: chunkCounts, error: chunkError } = await supabase
            .from("rag_chunks")
            .select("file_id");

        if (chunkError) throw chunkError;

        const chunkCountMap: Record<string, number> = {};
        chunkCounts?.forEach((chunk: any) => {
            chunkCountMap[chunk.file_id] = (chunkCountMap[chunk.file_id] || 0) + 1;
        });

        const phoneGroups: Record<string, any> = {};
        mappings?.forEach((mapping: any) => {
            const phone = mapping.phone_number;
            const file = mapping.rag_files;

            if (!phoneGroups[phone]) {
                phoneGroups[phone] = {
                    phone_number: phone,
                    intent: mapping.intent,
                    system_prompt: mapping.system_prompt,
                    auth_token: mapping.auth_token || "",
                    origin: mapping.origin || "",
                    files: [],
                };
            }

            if (file) {
                phoneGroups[phone].files.push({
                    id: file.id,
                    name: file.name,
                    file_type: file.file_type,
                    chunk_count: chunkCountMap[file.id] || 0,
                    created_at: file.created_at,
                });
            }
        });

        return json({ success: true, groups: Object.values(phoneGroups) });
    } catch (error: any) {
        console.error("Error fetching phone groups:", error.message);
        return json({ success: false, error: error.message }, { status: 500 });
    }
}
