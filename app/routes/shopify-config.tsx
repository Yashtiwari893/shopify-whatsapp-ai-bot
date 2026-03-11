import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, TextField, Button, Box, Banner, FormLayout } from "@shopify/polaris";
import { useState, useCallback } from "react";
import shopify from "../shopify.server";
import { supabase } from "../lib/supabaseClient";

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await shopify.authenticate.admin(request);

    const { data: store } = await supabase
        .from("shopify_stores")
        .select("*")
        .eq("store_domain", session.shop)
        .single();

    return json({ store, shop: session.shop });
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await shopify.authenticate.admin(request);
    const formData = await request.formData();

    const phone_number = formData.get("phone_number") as string;
    const auth_token = formData.get("auth_token") as string;
    const origin = formData.get("origin") as string;
    const website_url = formData.get("website_url") as string;

    const { error } = await supabase
        .from("shopify_stores")
        .upsert({
            store_domain: session.shop,
            phone_number,
            storefront_token: "app_managed",
            website_url,
            store_name: session.shop.split(".")[0],
        }, { onConflict: "store_domain" });

    if (error) return json({ error: error.message, success: false });

    await supabase
        .from("phone_document_mapping")
        .upsert({
            phone_number,
            data_source: "shopify",
            auth_token,
            origin,
        }, { onConflict: "phone_number" });

    return json({ success: true, error: null });
}

export default function ShopifyConfig() {
    const { store, shop } = useLoaderData<typeof loader>();
    const actionData = useActionData<{ success?: boolean, error?: string | null }>();

    const [phone, setPhone] = useState(store?.phone_number || "");
    const [token, setToken] = useState(store?.auth_token || "");
    const [orig, setOrig] = useState(store?.origin || "https://medistudygo.com/");
    const [webUrl, setWebUrl] = useState(store?.website_url || `https://${shop}`);

    return (
        <Page title="Shopify & WhatsApp Integration" backAction={{ content: 'Dashboard', url: '/' }}>
            <Layout>
                <Layout.Section>
                    {actionData?.success && (
                        <Box paddingBlockEnd="400">
                            <Banner tone="success" title="Settings saved successfully!" />
                        </Box>
                    )}
                    {actionData?.error && (
                        <Box paddingBlockEnd="400">
                            <Banner tone="critical" title={actionData.error} />
                        </Box>
                    )}

                    <Card>
                        <Form method="post">
                            <FormLayout>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd">Configure WhatsApp for {shop}</Text>

                                    <TextField
                                        label="WhatsApp Business Number"
                                        name="phone_number"
                                        value={phone}
                                        onChange={(val) => setPhone(val)}
                                        autoComplete="tel"
                                        helpText="Ex: +919876543210"
                                    />

                                    <TextField
                                        label="11za Auth Token"
                                        name="auth_token"
                                        type="password"
                                        value={token}
                                        onChange={(val) => setToken(val)}
                                        autoComplete="off"
                                    />

                                    <TextField
                                        label="11za Origin URL"
                                        name="origin"
                                        value={orig}
                                        onChange={(val) => setOrig(val)}
                                        autoComplete="url"
                                    />

                                    <TextField
                                        label="Website URL"
                                        name="website_url"
                                        value={webUrl}
                                        onChange={(val) => setWebUrl(val)}
                                        autoComplete="url"
                                    />

                                    <Button submit variant="primary">Save Configuration</Button>
                                </BlockStack>
                            </FormLayout>
                        </Form>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
