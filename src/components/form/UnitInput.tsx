import { For } from 'solid-js';
import { SelectInput } from './SelectInput';

type UnitInputProps = {
	name: string;
	label?: string;
	required?: boolean;
	value?: string;
};

const UNITS = ['kg', 'ton', 'pcs', 'm', 'sqm', 'cft', 'ltr', 'bag'] as const;

export function UnitInput(props: UnitInputProps) {
	return (
		<SelectInput
			name={props.name}
			label={props.label ?? "Unit"}
			required={props.required}
		>
			<option value="" disabled selected>Select unit...</option>
			<For each={UNITS}>
				{(unit) => <option value={unit} selected={props.value === unit}>{unit}</option>}
			</For>
		</SelectInput>
	);
}
