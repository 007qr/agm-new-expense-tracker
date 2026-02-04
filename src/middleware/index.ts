import { auth } from '~/lib/auth';
import { createMiddleware } from '@solidjs/start/middleware';
import { redirect } from '@solidjs/router';

const PUBLIC_ROUTES = ['/login', '/signup'];
const DEFAULT_REDIRECT = '/dashboard';

function isPublicPath(pathname: string) {
    return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isHtmlNavigation(req: Request) {
    if (req.method !== 'GET') return false;
    const accept = req.headers.get('accept') ?? '';
    // Only treat as navigation if the client is requesting HTML
    return accept.includes('text/html');
}

export default createMiddleware({
    onRequest: async (event) => {
        const url = new URL(event.request.url);
        const pathname = url.pathname;

        // Never auth-redirect server functions or API routes, or you will break actions/queries
        if (pathname.startsWith('/_server')) return;
        if (pathname.startsWith('/api')) return; // includes /api/auth/*
        // Optional: skip static assets
        if (pathname.startsWith('/assets') || pathname === '/favicon.ico') return;

        // Only redirect on real document navigations, not fetches/form RPC
        if (!isHtmlNavigation(event.request)) return;

        const session = await auth.api.getSession({ headers: event.request.headers });

        const publicRoute = isPublicPath(pathname);

        if (!session?.user && !publicRoute) {
            const next = encodeURIComponent(url.pathname + url.search);
            return redirect(`/login?next=${next}`, 302);
        }

        if (session?.user && publicRoute) {
            return redirect(DEFAULT_REDIRECT, 302);
        }
    },
});
