"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Store, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

type ShopifyStore = {
    id: string;
    phone_number: string;
    store_name: string | null;
    store_domain: string;
    website_url: string;
    last_synced_at: string | null;
    created_at: string;
};

export default function ShopifyPage() {
    const [stores, setStores] = useState<ShopifyStore[]>([]);
    const [loading, setLoading] = useState(true);
    const [settingUp, setSettingUp] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'alert' | 'error'; text: string } | null>(null);
    const [storeDomainFromUrl, setStoreDomainFromUrl] = useState(false);

    // Setup form state
    const [phoneNumber, setPhoneNumber] = useState("");
    const [storeDomain, setStoreDomain] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [shopifyAccessToken, setShopifyAccessToken] = useState(""); 
    const [authToken, setAuthToken] = useState("");
    const [origin, setOrigin] = useState("");

    const loadStores = useCallback(async () => {
        try {
            const res = await fetch("/api/shopify/stores");
            const data = await res.json();
            setStores(data.stores || []);
        } catch (error) {
            console.error("Failed to load stores:", error);
            setMessage({ type: 'error', text: 'Failed to load Shopify stores' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStores();
        
        // Handle URL parameters for success/setup
        const params = new URLSearchParams(window.location.search);
        const shop = params.get('shop');
        const setupNeeded = params.get('setup_needed');
        const success = params.get('success');

        if (shop) {
            setStoreDomain(shop);
            setStoreDomainFromUrl(true);
        }
        
        if (setupNeeded === 'true') {
            setMessage({ 
                type: 'alert', 
                text: `App installed for ${shop}! Now please provide the WhatsApp credentials below to complete the setup.` 
            });
        } else if (success === 'true') {
            setMessage({ 
                type: 'success', 
                text: `Successfully connected ${shop}!` 
            });
        }
    }, [loadStores]);

    const handleSetup = async (e: React.FormEvent) => {
        // ... (rest of the logic stays similar, I'll provide the full component structure)
        e.preventDefault();
        setSettingUp(true);
        setMessage(null);

        try {
            if (!phoneNumber || !storeDomain || !authToken || !origin) {
                setMessage({ type: 'error', text: 'All required fields must be filled' });
                setSettingUp(false);
                return;
            }

            let shop = storeDomain.trim().toLowerCase();
            if (!shop.includes(".")) {
                shop += ".myshopify.com";
            }

            const res = await fetch("/api/shopify/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: phoneNumber,
                    store_domain: shop,
                    access_token: shopifyAccessToken,
                    website_url: websiteUrl,
                    auth_token: authToken,
                    origin: origin
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: 'Meta-data updated and store connected successfully!' });
                setPhoneNumber("");
                setStoreDomain("");
                setWebsiteUrl("");
                setShopifyAccessToken("");
                setAuthToken("");
                setOrigin("");
                loadStores();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to connect store' });
            }

        } catch (error) {
            console.error("Setup error:", error);
            setMessage({ type: 'error', text: 'An unexpected error occurred' });
        } finally {
            setSettingUp(false);
        }
    };

    const handleSync = async (phoneNumber: string) => {
        setSyncing(phoneNumber);
        setMessage(null);

        try {
            const res = await fetch("/api/shopify/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone_number: phoneNumber }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Store data synced with AI successfully!' });
                loadStores();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to sync store' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error occurred' });
        } finally {
            setSyncing(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Shopify Store Management</h1>
                <p className="text-gray-600">
                    Finish your installation or connect new stores via Admin API
                </p>
            </div>

            {message && (
                <div className={`mb-6 p-4 rounded-lg border ${
                    message.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : message.type === 'alert'
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-green-200 bg-green-50 text-green-800'
                }`}>
                    <div className="flex items-center gap-2">
                        {message.type === 'error' ? (
                            <AlertCircle className="h-4 w-4" />
                        ) : message.type === 'alert' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle className="h-4 w-4" />
                        )}
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Store className="h-5 w-5" />
                        Connect Shopify Store (Admin API)
                    </CardTitle>
                    <CardDescription>
                        Enter your Shopify Admin API Access Token and WhatsApp credentials to connect your store directly.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSetup} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    WhatsApp Business Number *
                                </label>
                                <Input
                                    type="tel"
                                    placeholder="+1234567890"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    The phone number connected to your WhatsApp Business API
                                </p>
                            </div>

                            {!storeDomainFromUrl && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            Shopify Store Domain *
                                        </label>
                                        <Input
                                            type="text"
                                            placeholder="yourstore.myshopify.com"
                                            value={storeDomain}
                                            onChange={(e) => setStoreDomain(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Your Shopify store domain (e.g. your-store.myshopify.com)
                                        </p>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium mb-1">
                                            Shopify Admin API Access Token (Required for manual setup)
                                        </label>
                                        <Input
                                            type="password"
                                            placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxx"
                                            value={shopifyAccessToken}
                                            onChange={(e) => setShopifyAccessToken(e.target.value)}
                                            autoComplete="off"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Provide the token from Develop apps &gt; Admin API integration in your Shopify admin.
                                        </p>
                                    </div>
                                </>
                            )}

                            {!storeDomainFromUrl && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            Website URL (Optional)
                                        </label>
                                        <Input
                                            type="url"
                                            placeholder="https://yourstore.com"
                                            value={websiteUrl}
                                            onChange={(e) => setWebsiteUrl(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Your store's main website URL
                                        </p>
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    11za Auth Token *
                                </label>
                                <Input
                                    type="password"
                                    placeholder="Enter your 11za auth token"
                                    value={authToken}
                                    onChange={(e) => setAuthToken(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    WhatsApp API authentication token from 11za
                                </p>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium mb-1">
                                    11za Origin Website *
                                </label>
                                <Input
                                    type="url"
                                    placeholder="https://yourwebsite.com"
                                    value={origin}
                                    onChange={(e) => setOrigin(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    The origin website URL registered with 11za
                                </p>
                            </div>
                        </div>

                        <Button type="submit" disabled={settingUp} className="w-full md:w-auto">
                            {settingUp ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Verifying & Connecting...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Connect Store
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}