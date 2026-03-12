"use client";

import { useState } from "react";
import { Card, Button, TextField, Page, Layout, Text, BlockStack, Box, AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/styles.css";

export default function InstallPage() {
    const [shop, setShop] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleInstall = () => {
        if (!shop) {
            setError("Store domain is required");
            return;
        }

        // Basic validation for .myshopify.com
        let formattedShop = shop.trim().toLowerCase();
        if (!formattedShop.includes(".")) {
            formattedShop += ".myshopify.com";
        }

        setIsLoading(true);
        setError("");

        // Redirect to our install API
        window.location.href = `/api/auth/shopify/install?shop=${formattedShop}`;
    };

    return (
        <AppProvider i18n={enTranslations}>
            <Page narrowWidth>
                <Layout>
                    <Layout.Section>
                        <Box paddingBlockStart="1000">
                            <Card padding="500">
                                <BlockStack gap="500">
                                    <BlockStack gap="200">
                                        <Text variant="headingLg" as="h1">
                                            Install WhatsApp AI Bot
                                        </Text>
                                        <Text variant="bodyMd" as="p" tone="subdued">
                                            Enter your Shopify store domain to connect your store and start using AI-powered WhatsApp support.
                                        </Text>
                                    </BlockStack>

                                    <TextField
                                        label="Shopify Store Domain"
                                        value={shop}
                                        onChange={(value) => setShop(value)}
                                        placeholder="example.myshopify.com"
                                        error={error}
                                        autoComplete="off"
                                        helpText="e.g. your-store.myshopify.com"
                                    />

                                    <Button 
                                        variant="primary" 
                                        size="large" 
                                        onClick={handleInstall} 
                                        loading={isLoading}
                                        fullWidth
                                    >
                                        Install App
                                    </Button>
                                </BlockStack>
                            </Card>
                        </Box>
                    </Layout.Section>
                </Layout>
            </Page>
        </AppProvider>
    );
}
