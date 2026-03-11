import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { supabase } from "../lib/supabaseClient";

export async function loader() {
    const { data, error } = await supabase
        .from("rag_files")
        .select("id, name, created_at, rag_chunks(count)")
        .order("created_at", { ascending: false });

    if (error) return json({ error: error.message }, { status: 500 });

    const files = data?.map((file: any) => ({
        id: file.id,
        name: file.name,
        created_at: file.created_at,
        chunk_count: file.rag_chunks?.[0]?.count ?? 0,
    })) || [];

    return json({ files });
}

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) return json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase.from("rag_files").delete().eq("id", id);
    if (error) return json({ error: error.message }, { status: 500 });

    return json({ success: true });
}
