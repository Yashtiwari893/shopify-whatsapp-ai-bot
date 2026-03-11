import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, Button, InlineGrid } from "@shopify/polaris";
import shopify from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await shopify.authenticate.admin(request);
    return json({ shop: session.shop });
}

export default function Index() {
    const { shop } = useLoaderData<typeof loader>();

    return (
        <Page title="AI WhatsApp Chatbot">
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                Welcome, {shop}!
                            </Text>
                            <Text as="p" variant="bodyMd">
                                Apne Shopify store ko AI Chatbot se connect karne ke liye settings customize karein.
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <InlineGrid columns={1} gap="400">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Configurations</Text>
                                <Link to="/files">
                                    <Button fullWidth>Manage PDF Files</Button>
                                </Link>
                                <Link to="/shopify-config">
                                    <Button fullWidth>Shopify Sync Settings</Button>
                                </Link>
                                <Link to="/chat">
                                    <Button fullWidth>Test Chatbot</Button>
                                </Link>
                            </BlockStack>
                        </Card>
                    </InlineGrid>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
