import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

export default function Breadcrumb(props: BreadcrumbProps) {
    return (
        <nav class="flex" aria-label="Breadcrumb">
            <ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse">
                <For each={props.items}>
                    {(item, index) => (
                        <li class="inline-flex items-center">
                            <Show
                                when={item.href && index() !== props.items.length - 1}
                                fallback={
                                    <span class="ms-1 text-sm font-medium text-zinc-500 md:ms-2">
                                        {item.label}
                                    </span>
                                }
                            >
                                <A
                                    href={item.href!}
                                    class="inline-flex items-center text-sm font-medium text-zinc-700 hover:text-blue-600"
                                >
                                    {item.label}
                                </A>
                            </Show>
                            <Show when={index() !== props.items.length - 1}>
                                <svg
                                    class="rtl:rotate-180 w-3 h-3 text-zinc-400 mx-1"
                                    aria-hidden="true"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 6 10"
                                >
                                    <path
                                        stroke="currentColor"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="m1 9 4-4-4-4"
                                    />
                                </svg>
                            </Show>
                        </li>
                    )}
                </For>
            </ol>
        </nav>
    );
}
