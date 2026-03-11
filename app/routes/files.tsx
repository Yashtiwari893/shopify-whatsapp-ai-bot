import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, TextField, Tabs, Box } from "@shopify/polaris";
import { useState, useEffect, useCallback } from "react";
import shopify from "../shopify.server";
import { FileUpload } from "../components/ui/file-upload";

export async function loader({ request }: LoaderFunctionArgs) {
    await shopify.authenticate.admin(request);
    return json({});
}

export default function Files() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [phoneGroups, setPhoneGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedTab, setSelectedTab] = useState(0);

    const tabs = [
        { id: 'upload', content: 'Upload' },
        { id: 'manage', content: 'Manage Files' }
    ];

    const loadFiles = useCallback(async () => {
        const res = await fetch("/api/phone-groups");
        const data = await res.json();
        if (data.success) setPhoneGroups(data.groups || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const handleUpload = async () => {
        if (!selectedFile) return;
        setUploading(true);
        // ... upload logic (similar to previous)
        setUploading(false);
        loadFiles();
    };

    return (
        <Page title="File Management" backAction={{ content: 'Dashboard', url: '/' }}>
            <Layout>
                <Layout.Section>
                    <Card>
                        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                            <Box padding="400">
                                {selectedTab === 0 ? (
                                    <BlockStack gap="400">
                                        <Text as="h2" variant="headingMd">Upload Knowledge Base (PDF/Images)</Text>
                                        <FileUpload onFileSelect={(file) => setSelectedFile(file)} selectedFile={selectedFile} />
                                        <Button primary onClick={handleUpload} loading={uploading} disabled={!selectedFile}>
                                            Process & Upload
                                        </Button>
                                    </BlockStack>
                                ) : (
                                    <BlockStack gap="400">
                                        <Text as="h2" variant="headingMd">Existing Files</Text>
                                        {phoneGroups.map((group, idx) => (
                                            <Card key={idx}>
                                                <BlockStack gap="200">
                                                    <Text as="p" variant="bodyMd">Phone: {group.phone_number}</Text>
                                                    {group.files.map((f: any, i: number) => (
                                                        <Box key={i} padding="200" background="bg-subdued" borderRadius="100">
                                                            <Text as="p">{f.name} ({f.chunk_count} chunks)</Text>
                                                        </Box>
                                                    ))}
                                                </BlockStack>
                                            </Card>
                                        ))}
                                    </BlockStack>
                                )}
                            </Box>
                        </Tabs>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
