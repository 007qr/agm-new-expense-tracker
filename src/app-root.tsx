import { createMemo, JSX, Show, Suspense } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { ComponentProps } from 'solid-js';
import Sidebar, { SidebarItem } from './components/Sidebar';
import { authClient } from '~/lib/auth-client';

const PUBLIC_ROUTES = new Set(['/login', '/signup']);

// Define role-specific navigation items
const WAREHOUSE_NAV_ITEMS: SidebarItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: IconGrid },
    { label: 'Items', href: '/items', icon: IconGrid },
    { label: 'New transaction', href: '/new-transaction', icon: IconGrid },
    { label: 'Destinations', href: '/destination', icon: IconGrid },
];

const EXPENSE_NAV_ITEMS: SidebarItem[] = [
    { label: 'Sites', href: '/sites', icon: IconGrid },
    { label: 'New Expense', href: '/expenses/new', icon: IconGrid },
];

const ADMIN_NAV_ITEMS: SidebarItem[] = [
    { label: 'Godown Dashboard', href: '/dashboard', icon: IconGrid },
    { label: 'Godown Items', href: '/items', icon: IconGrid },
    { label: 'Godown New Transaction', href: '/new-transaction', icon: IconGrid },
    { label: 'Site All Sites', href: '/sites', icon: IconGrid },
    { label: 'Site Expenses', href: '/sites', icon: IconGrid },
    { label: 'Site New Expense', href: '/expenses/new', icon: IconGrid },
    { label: 'Destinations', href: '/destination', icon: IconGrid },
];

export default function AppRoot(props: { children: JSX.Element }) {
    const location = useLocation();
    const session = authClient.useSession()();
    const userRole = () => session.data?.user.role;

    const isPublicRoute = createMemo(() => PUBLIC_ROUTES.has(location.pathname));
    const showSidebar = createMemo(() => !isPublicRoute());

    const navigationItems = createMemo(() => {
        const role = userRole();
        if (role === 'admin') {
            return ADMIN_NAV_ITEMS;
        }
        if (role === 'warehouse-user') {
            return WAREHOUSE_NAV_ITEMS;
        }
        if (role === 'expense-user') {
            return EXPENSE_NAV_ITEMS;
        }
        return []; // Default to no items if no role or while loading
    });

    return (
        <div class="flex h-screen bg-brand text-secondary">
            <Show when={showSidebar()}>
                <Sidebar items={navigationItems()} />
            </Show>

            <Suspense fallback={<div class="p-8">Loading content...</div>}>
                <main class="flex-1 overflow-y-auto p-8">
                    <div class="mx-auto max-w-7xl">{props.children}</div>
                </main>
            </Suspense>
        </div>
    );
}

// 5. Properly typed Icon component
function IconGrid(props: ComponentProps<'svg'>) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            {...props}
        >
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
    );
}
