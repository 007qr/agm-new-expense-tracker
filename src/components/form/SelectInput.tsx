import { type JSX } from 'solid-js';

type SelectInputProps = {
	name: string;
	label: string;
	children: JSX.Element;
	required?: boolean;
	onChange?: JSX.EventHandlerUnion<HTMLSelectElement, Event>;
};

export function SelectInput(props: SelectInputProps) {
	return (
		<div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all">
			<label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
				{props.label}
			</label>
			<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</div>
			<select
				name={props.name}
				required={props.required}
				onChange={props.onChange}
				class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer"
			>
				{props.children}
			</select>
		</div>
	);
}
