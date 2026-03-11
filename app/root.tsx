import { json, LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
} from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import shopify from "./shopify.server";
import tailwindStyles from "./tailwind.css?url";

export const links: LinksFunction = () => [
    { rel: "stylesheet", href: tailwindStyles },
];

export async function loader({ request }: LoaderFunctionArgs) {
    await shopify.authenticate.admin(request);

    return json({
        apiKey: process.env.SHOPIFY_API_KEY || "",
    });
}

export default function App() {
    const { apiKey } = useLoaderData<typeof loader>();

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width,initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <AppProvider apiKey={apiKey} isEmbeddedApp>
                    <Outlet />
                </AppProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}
