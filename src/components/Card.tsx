import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { IconArrowUpRight } from '~/assets/icons/IconArrowUpRight';

type SiteCardProps = {
    name: string;
    isWarehouse: boolean;
    url: string;
};

type SiteCardSkeletonProps = {
    maxWidthClass?: string; // optional escape hatch, default matches original
};

export const SiteCard: Component<SiteCardProps> = (props) => {
    return (
        <A
            href={props.url}
            class="
        group relative flex items-center justify-between
        p-5 rounded-2xl
        bg-white border border-black/10
        hover:border-black/20 hover:bg-zinc-50
        transition-all duration-300 ease-out
        cursor-pointer w-full max-w-sm
      "
        >
            <div class="flex items-center gap-4">
                <div
                    class="
            w-12 h-12 rounded-xl bg-black/5
            flex items-center justify-center
            text-2xl border border-black/10
            group-hover:scale-110 group-hover:bg-black/10
            transition-all duration-300
          "
                >
                    {props.isWarehouse ? '📦' : '🏗️'}
                </div>

                <div class="flex flex-col">
                    <span class="text-black font-semibold text-lg tracking-tight group-hover:text-black transition-colors">
                        {props.name}
                    </span>
                    <span class="text-zinc-600 text-xs font-medium uppercase tracking-wider group-hover:text-zinc-700">
                        Open {props.isWarehouse ? 'Godown' : 'Site'}
                    </span>
                </div>
            </div>

            <div
                class="
          text-zinc-500
          group-hover:text-black
          group-hover:translate-x-1 group-hover:-translate-y-1
          transition-all duration-300
        "
            >
                <IconArrowUpRight class="w-6 h-6" />
            </div>
        </A>
    );
};

export const SiteCardSkeleton: Component<SiteCardSkeletonProps> = (props) => {
    return (
        <div
            aria-busy="true"
            class="
        relative flex items-center justify-between
        p-5 rounded-2xl
        bg-white border border-black/10
        transition-all duration-300 ease-out
        w-full max-w-sm
      "
            classList={{
                [props.maxWidthClass ?? '']: !!props.maxWidthClass,
            }}
        >
            <div class="flex items-center gap-4">
                <div
                    class="
            w-12 h-12 rounded-xl bg-black/5
            flex items-center justify-center
            border border-black/10
          "
                >
                    <div class="h-6 w-6 rounded-md bg-black/10 animate-pulse" />
                </div>

                <div class="flex flex-col">
                    <div class="space-y-2">
                        <div class="h-4 w-32 rounded bg-black/10 animate-pulse" />
                        <div class="h-3 w-16 rounded bg-black/10 animate-pulse" />
                    </div>
                </div>
            </div>

            <div class="text-zinc-500">
                <div class="h-6 w-6 rounded bg-black/10 animate-pulse" />
            </div>
        </div>
    );
};
