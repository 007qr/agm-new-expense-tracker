import { createVirtualizer } from '@tanstack/solid-virtual';
import { createSignal, For, Show, type JSX, createEffect, onCleanup, createMemo } from 'solid-js';

export type ComboboxOption = {
	id: string;
	name: string;
	unit?: string;
};

type VirtualizedComboboxProps = {
	name: string;
	label: string;
	placeholder?: string;
	required?: boolean;
	options: ComboboxOption[];
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	renderOption?: (option: ComboboxOption) => JSX.Element;
};

export function VirtualizedCombobox(props: VirtualizedComboboxProps) {
	const [searchTerm, setSearchTerm] = createSignal('');
	const [selectedValue, setSelectedValue] = createSignal(props.defaultValue ?? '');
	const [inputValue, setInputValue] = createSignal('');
	const [isOpen, setIsOpen] = createSignal(false);
	const [highlightedIndex, setHighlightedIndex] = createSignal(0);

	// Filter options locally based on search term
	const filteredOptions = createMemo(() => {
		const term = searchTerm().toLowerCase().trim();
		const allOptions = props.options || [];

		if (!term) {
			return allOptions;
		}

		return allOptions.filter((option) =>
			option.name.toLowerCase().includes(term)
		);
	});

	let scrollParentRef: HTMLDivElement | undefined;
	let inputRef: HTMLInputElement | undefined;

	// Create virtualizer
	const virtualizer = createVirtualizer({
		get count() {
			return filteredOptions().length;
		},
		getScrollElement: () => scrollParentRef ?? null,
		estimateSize: () => 40,
		overscan: 5,
	});

	// Handle input change
	const handleInputChange = (value: string) => {
		setInputValue(value);
		setSearchTerm(value);
		if (!isOpen()) {
			setIsOpen(true);
		}
		setHighlightedIndex(0);
	};

	// Handle opening dropdown
	const handleOpen = () => {
		setIsOpen(true);
		setHighlightedIndex(0);
		inputRef?.focus();
	};

	// Handle option selection
	const handleSelect = (option: ComboboxOption) => {
		setSelectedValue(option.id);
		setInputValue(option.name);
		setIsOpen(false);
		props.onValueChange?.(option.id);
		inputRef?.blur();
	};

	// Keyboard navigation
	const handleKeyDown = (e: KeyboardEvent) => {
		const opts = filteredOptions();
		if (opts.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlightedIndex((prev) => Math.min(prev + 1, opts.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlightedIndex((prev) => Math.max(prev - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const highlighted = opts[highlightedIndex()];
			if (highlighted) {
				handleSelect(highlighted);
			}
		} else if (e.key === 'Escape') {
			setIsOpen(false);
			inputRef?.blur();
		}
	};

	// Initialize input value if defaultValue is provided
	createEffect(() => {
		if (props.defaultValue && !inputValue()) {
			const selected = props.options.find((opt) => opt.id === props.defaultValue);
			if (selected) {
				setInputValue(selected.name);
			}
		}
	});

	// Decide whether to use virtualization (only for lists > 50 items)
	const useVirtualization = createMemo(() => filteredOptions().length > 50);

	return (
		<div class="relative">
			<div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all">
				<label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
					{props.label}
				</label>
				<div class="relative">
					<input
						ref={inputRef}
						type="text"
						value={inputValue()}
						onInput={(e) => handleInputChange(e.currentTarget.value)}
						onFocus={handleOpen}
						onKeyDown={handleKeyDown}
						placeholder={props.placeholder ?? 'Search...'}
						class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
						autocomplete="off"
					/>
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							if (isOpen()) {
								setIsOpen(false);
							} else {
								handleOpen();
							}
						}}
						class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 transition-transform"
							classList={{ 'rotate-180': isOpen() }}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					<input type="hidden" name={props.name} value={selectedValue()} required={props.required} />
				</div>
			</div>

			<Show when={isOpen()}>
				<div
					class="absolute z-[60] w-full mt-2 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden"
					style={{ 'max-height': '300px' }}
					onClick={(e) => e.stopPropagation()}
				>
					<Show
						when={filteredOptions().length > 0}
						fallback={
							<div class="px-3 py-8 text-center text-sm text-zinc-500">
								{props.options.length === 0 ? 'No data available' : 'No results found'}
							</div>
						}
					>
						<Show
							when={useVirtualization()}
							fallback={
								<div class="max-h-[300px] overflow-auto">
									<For each={filteredOptions()}>
										{(option, index) => (
											<button
												type="button"
												onClick={() => handleSelect(option)}
												class="w-full px-3 py-2 text-left cursor-pointer hover:bg-zinc-100 outline-none text-sm transition-colors"
												classList={{
													'bg-zinc-100': highlightedIndex() === index(),
												}}
											>
												{props.renderOption ? props.renderOption(option) : option.name}
											</button>
										)}
									</For>
								</div>
							}
						>
							{/* Virtualized list for large datasets */}
							<div ref={scrollParentRef} class="overflow-auto" style={{ 'max-height': '300px' }}>
								<div
									style={{
										height: `${virtualizer.getTotalSize()}px`,
										width: '100%',
										position: 'relative',
									}}
								>
									<For each={virtualizer.getVirtualItems()}>
										{(virtualItem) => {
											const option = filteredOptions()[virtualItem.index];
											return (
												<div
													data-index={virtualItem.index}
													style={{
														position: 'absolute',
														top: 0,
														left: 0,
														width: '100%',
														height: `${virtualItem.size}px`,
														transform: `translateY(${virtualItem.start}px)`,
													}}
												>
													<button
														type="button"
														onClick={() => handleSelect(option)}
														class="w-full px-3 py-2 text-left cursor-pointer hover:bg-zinc-100 outline-none text-sm transition-colors"
														classList={{
															'bg-zinc-100': highlightedIndex() === virtualItem.index,
														}}
													>
														{props.renderOption ? props.renderOption(option) : option.name}
													</button>
												</div>
											);
										}}
									</For>
								</div>
							</div>
						</Show>
					</Show>
				</div>
			</Show>

			{/* Click outside to close */}
			<Show when={isOpen()}>
				<div class="fixed inset-0 z-[50]" onClick={() => setIsOpen(false)} />
			</Show>
		</div>
	);
}
