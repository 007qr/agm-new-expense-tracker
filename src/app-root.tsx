import { JSX, Suspense } from 'solid-js';
import Sidebar, { SidebarItem } from './components/Sidebar';
import { useLocation } from '@solidjs/router';
import { } from './lib/auth-client';

// Define your icons here or import them
const IconGrid = (p: any) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
);
const IconUsers = (p: any) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

export default function AppRoot(props: { children: JSX.Element }) {
    const navigationItems: SidebarItem[] = [
        { label: 'Dashboard', href: '/dashboard', icon: IconGrid },
        { label: 'Items', href: '/items', icon: IconGrid },
        { label: 'New transaction', href: '/new-transaction', icon: IconGrid },
    ];
    return (
        <>
            <div class="flex h-screen bg-brand">
                <Sidebar items={navigationItems} />
                <Suspense>
                    <main class="flex-1 overflow-y-auto bg-brand p-8 text-secondary">
                        <div class="max-w-7xl mx-auto">{props.children}</div>
                    </main>
                </Suspense>
            </div>
        </>
    );
}
