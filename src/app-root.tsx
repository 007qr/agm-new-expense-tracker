import { createMemo, createSignal, JSX, Show, Suspense } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { ComponentProps } from 'solid-js';
import Sidebar, { SidebarItem } from './components/Sidebar';
import { authClient } from '~/lib/auth-client';
import QuickEntryDialog, { type QuickEntryFormData } from './components/QuickEntryDialog';
import { loadFormData } from '~/routes/expenses/new/index';

const PUBLIC_ROUTES = new Set(['/login', '/signup']);

// Define role-specific navigation items
const WAREHOUSE_NAV_ITEMS: SidebarItem[] = [
    { label: 'All godown', href: '/dashboard', icon: IconGrid },
    { label: 'Items', href: '/items', icon: IconGrid },
    { label: 'New transaction', href: '/new-transaction', icon: IconGrid },
];

const EXPENSE_NAV_ITEMS: SidebarItem[] = [
    { label: 'All sites', href: '/sites', icon: IconGrid },
    { label: 'Site items', href: '/expenses/items', icon: IconGrid },
    { label: 'Expenses', href: '/expenses/new', icon: IconGrid },
];

const ADMIN_NAV_ITEMS: SidebarItem[] = [
    { label: 'All dodown', href: '/dashboard', icon: IconGrid },
    { label: 'Godown Items', href: '/items', icon: IconGrid },
    { label: 'Godown New Transaction', href: '/new-transaction', icon: IconGrid },
    { label: 'All Site', href: '/sites', icon: IconGrid },
    { label: 'New Expense', href: '/expenses/new', icon: IconGrid },
    { label: 'Site items', href: '/expenses/items/new', icon: IconGrid },
];

export default function AppRoot(props: { children: JSX.Element }) {
    const location = useLocation();
    const session = authClient.useSession()();
    const userRole = () => session.data?.user.role;

    const isPublicRoute = createMemo(() => PUBLIC_ROUTES.has(location.pathname));
    const showSidebar = createMemo(() => !isPublicRoute());

    const [quickEntryOpen, setQuickEntryOpen] = createSignal(false);
    const [quickEntryLoading, setQuickEntryLoading] = createSignal(false);
    const [quickEntryData, setQuickEntryData] = createSignal<QuickEntryFormData | null>(null);

    const canQuickEntry = createMemo(() => {
        const role = userRole();
        return role === 'expense-user' || role === 'admin';
    });

    const handleQuickEntry = async () => {
        // Cached: open immediately, background-refresh for next time
        if (quickEntryData()) {
            setQuickEntryOpen(true);
            loadFormData().then(setQuickEntryData);
            return;
        }
        // First load: show spinner on button, fetch, then open
        setQuickEntryLoading(true);
        try {
            const data = await loadFormData();
            setQuickEntryData(data);
            setQuickEntryOpen(true);
        } finally {
            setQuickEntryLoading(false);
        }
    };

    /** Call this to invalidate cached data (e.g. after creating a new item/destination) */
    const invalidateQuickEntryCache = () => setQuickEntryData(null);

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
                <Sidebar
                    items={navigationItems()}
                    onQuickEntry={canQuickEntry() ? handleQuickEntry : undefined}
                    quickEntryLoading={quickEntryLoading()}
                />
            </Show>

            <Suspense fallback={<div class="p-8">Loading content...</div>}>
                <main class="flex-1 overflow-y-auto p-2">
                    <div class="mx-auto px-10">{props.children}</div>
                </main>
            </Suspense>

            <Show when={canQuickEntry() && quickEntryData()}>
                <QuickEntryDialog
                    open={quickEntryOpen()}
                    onOpenChange={setQuickEntryOpen}
                    formData={quickEntryData()!}
                />
            </Show>
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
