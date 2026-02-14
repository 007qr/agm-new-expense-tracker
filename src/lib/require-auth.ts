import { redirect } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import { auth } from './auth';

type Role = 'admin' | 'warehouse-user' | 'expense-user';

/**
 * Call at the top of any `'use server'` function to enforce authentication
 * and (optionally) role-based access.
 *
 * Throws a redirect to `/login` if not authenticated, or to `/` if the
 * user's role is not in the allowed list.
 */
export async function requireAuth(allowedRoles?: Role[]) {
    const event = getRequestEvent();
    if (!event) throw redirect('/login');

    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session?.user) throw redirect('/login');

    if (allowedRoles) {
        const role = session.user.role as Role;
        if (role !== 'admin' && !allowedRoles.includes(role)) {
            throw redirect('/');
        }
    }

    return session;
}
