import { auth } from '~/lib/auth';
import { createMiddleware } from '@solidjs/start/middleware';
import { redirect } from '@solidjs/router';

// --- Config ---
const PUBLIC_ROUTES = ['/login', '/signup'];
const DEFAULT_REDIRECT = '/asd';

type Role = 'admin' | 'warehouse-user' | 'expense-user';

// Each route prefix → which roles can access it
// Admin is handled separately (gets access to everything)
const ROUTE_ACCESS: Record<string, Role[]> = {
    '/expenses': ['expense-user'],
    '/sites': ['expense-user'],
    '/dashboard': ['warehouse-user'],
    '/items': ['warehouse-user'],
    '/destination': ['warehouse-user', 'expense-user'],
};

// --- Helpers ---
function matchesPath(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(prefix + '/');
}

function isPublic(pathname: string) {
    return PUBLIC_ROUTES.some((p) => matchesPath(pathname, p));
}

function isAllowed(pathname: string, role: Role): boolean {
    if (role === 'admin') return true;

    for (const [prefix, allowedRoles] of Object.entries(ROUTE_ACCESS)) {
        if (matchesPath(pathname, prefix)) {
            return allowedRoles.includes(role);
        }
    }

    // No rule matched → allow any logged-in user
    return true;
}

function isHtmlNavigation(req: Request) {
    return req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html');
}

// --- Middleware ---
export default createMiddleware({
    onRequest: async (event) => {
        const { pathname } = new URL(event.request.url);

        // Skip non-page requests
        if (
            pathname.startsWith('/_server') ||
            pathname.startsWith('/api') ||
            pathname.startsWith('/assets') ||
            pathname === '/favicon.ico' ||
            !isHtmlNavigation(event.request)
        )
            return;

        const session = await auth.api.getSession({ headers: event.request.headers });
        const isLoggedIn = !!session?.user;

        if (isPublic(pathname)) {
            return isLoggedIn ? redirect(DEFAULT_REDIRECT, 302) : undefined;
        }

        if (!isLoggedIn) {
            return redirect(`/login?next=${encodeURIComponent(pathname)}`, 302);
        }

        if (!isAllowed(pathname, session!.user.role as Role)) {
            return redirect(DEFAULT_REDIRECT, 302);
        }
    },
});
