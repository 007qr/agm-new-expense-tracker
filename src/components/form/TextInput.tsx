import { type JSX } from 'solid-js';

type TextInputProps = {
	name: string;
	label: string;
	type?: string;
	required?: boolean;
	readOnly?: boolean;
	value?: string | number;
	placeholder?: string;
	step?: string;
	onInput?: JSX.EventHandlerUnion<HTMLInputElement, Event>;
};

export function TextInput(props: TextInputProps) {
	return (
		<div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all">
			<label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
				{props.label}
			</label>
			<input
				type={props.type || 'text'}
				name={props.name}
				required={props.required}
				readOnly={props.readOnly}
				value={props.value}
				placeholder={props.placeholder}
				step={props.step}
				onInput={props.onInput}
				class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 disabled:opacity-50"
				disabled={props.readOnly}
			/>
		</div>
	);
}
