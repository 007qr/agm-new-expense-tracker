import { Component } from 'solid-js';

type PaginationProps = {
    page: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
};

export const Pagination: Component<PaginationProps> = (props) => {
    const totalPages = () => Math.max(1, Math.ceil(props.totalCount / props.pageSize));
    const startIndex = () => (props.totalCount === 0 ? 0 : (props.page - 1) * props.pageSize + 1);
    const endIndex = () => Math.min(props.page * props.pageSize, props.totalCount);

    return (
        <div class="flex flex-col gap-3 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
                <span class="text-xs uppercase tracking-wider text-zinc-500">Rows</span>
                <select
                    value={props.pageSize}
                    onChange={(e) => props.onPageSizeChange(Number(e.currentTarget.value))}
                    class="bg-white border border-zinc-200 text-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
                <span class="text-xs text-zinc-500">
                    Showing {startIndex()}-{endIndex()} of {props.totalCount}
                </span>
            </div>

            <div class="flex items-center gap-2 sm:gap-3">
                <button
                    class="inline-flex items-center gap-2 rounded-lg border border-black bg-black px-3 py-2 text-sm text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={props.page <= 1}
                    onClick={() => props.onPageChange(props.page - 1)}
                >
                    Prev
                </button>

                <span class="text-xs text-zinc-500">
                    Page <span class="text-zinc-800">{props.page}</span> of{' '}
                    <span class="text-zinc-800">{totalPages()}</span>
                </span>

                <button
                    class="inline-flex items-center gap-2 rounded-lg border border-black bg-black px-3 py-2 text-sm text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={props.page >= totalPages()}
                    onClick={() => props.onPageChange(props.page + 1)}
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export const PaginationSkeleton: Component = () => (
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-pulse">
        <div class="flex items-center gap-3">
            <div class="h-3 w-10 bg-zinc-200 rounded"></div>
            <div class="h-8 w-20 bg-zinc-200 rounded-lg"></div>
            <div class="h-3 w-40 bg-zinc-200 rounded"></div>
        </div>
        <div class="flex items-center gap-3">
            <div class="h-8 w-16 bg-zinc-200 rounded-lg"></div>
            <div class="h-3 w-20 bg-zinc-200 rounded"></div>
            <div class="h-8 w-16 bg-zinc-200 rounded-lg"></div>
        </div>
    </div>
);
