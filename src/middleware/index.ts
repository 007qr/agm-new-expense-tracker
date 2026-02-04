import { auth } from '~/lib/auth';
import { createMiddleware } from '@solidjs/start/middleware';
import { redirect } from '@solidjs/router';

const PUBLIC_ROUTES = ['/login', '/signup'];
const DEFAULT_REDIRECT = '/dashboard';

// New Role Constants
const ADMIN_ROLE = 'admin';
const WAREHOUSE_USER_ROLE = 'warehouse-user';
const EXPENSE_USER_ROLE = 'expense-user';

// New Route Groupings
const EXPENSE_SPECIFIC_ROUTES = ['/expenses']; // includes /expenses/[id], /expenses/[id]/new
const WAREHOUSE_SPECIFIC_ROUTES = ['/dashboard', '/items']; // includes /items/[id], /items/[id]/edit, /items/new
const DESTINATION_COMMON_ROUTES = ['/destination']; // includes /destination/[id], /destination/[id]/ledger, etc.

function isPublicPath(pathname: string) {
    return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// New helper for checking if a path belongs to a group
function isPathInGroup(pathname: string, group: string[]) {
    return group.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isHtmlNavigation(req: Request) {
    if (req.method !== 'GET') return false;
    const accept = req.headers.get('accept') ?? '';
    return accept.includes('text/html');
}

export default createMiddleware({
    onRequest: async (event) => {
        const url = new URL(event.request.url);
        const pathname = url.pathname;

        if (pathname.startsWith('/_server')) return;
        if (pathname.startsWith('/api')) return;
        if (pathname.startsWith('/assets') || pathname === '/favicon.ico') return;
        if (!isHtmlNavigation(event.request)) return;

        const session = await auth.api.getSession({ headers: event.request.headers });
        const userRole = session?.user?.role;
        const isLoggedIn = !!session?.user;

        const publicRoute = isPublicPath(pathname);

        // Allow public routes without authentication
        if (publicRoute) {
            // Redirect logged-in users away from public routes like login/signup
            if (isLoggedIn) {
                return redirect(DEFAULT_REDIRECT, 302);
            }
            return;
        }

        // If not logged in and not a public route, redirect to login
        if (!isLoggedIn) {
            const next = encodeURIComponent(url.pathname + url.search);
            return redirect(`/login?next=${next}`, 302);
        }

        // --- Role-Based Access Control for logged-in users ---

        // Expense specific routes
        if (isPathInGroup(pathname, EXPENSE_SPECIFIC_ROUTES)) {
            if (userRole === ADMIN_ROLE || userRole === EXPENSE_USER_ROLE) {
                return; // Allowed
            } else {
                return redirect(DEFAULT_REDIRECT, 302); // Unauthorized for this role
            }
        }

        // Warehouse specific routes
        if (isPathInGroup(pathname, WAREHOUSE_SPECIFIC_ROUTES)) {
            if (userRole === ADMIN_ROLE || userRole === WAREHOUSE_USER_ROLE) {
                return; // Allowed
            } else {
                return redirect(DEFAULT_REDIRECT, 302); // Unauthorized for this role
            }
        }

        // Destination common routes (accessible by warehouse and expense users)
        if (isPathInGroup(pathname, DESTINATION_COMMON_ROUTES)) {
            if (userRole === ADMIN_ROLE || userRole === WAREHOUSE_USER_ROLE || userRole === EXPENSE_USER_ROLE) {
                return; // Allowed
            } else {
                return redirect(DEFAULT_REDIRECT, 302); // Unauthorized for this role
            }
        }

        // Fallback: If none of the above specific routes match, but user is logged in, allow access.
        // This implies any other non-public route is accessible by any logged-in user by default.
        return;
    },
});
