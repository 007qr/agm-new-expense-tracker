import { getOwner, onCleanup } from 'solid-js';
import { isServer } from 'solid-js/web';

export function debounce<T>(fn: (v: T) => void, ms: number) {
    if (isServer) {
        return Object.assign(((_: T) => void 0) as (v: T) => void, {
            clear: () => void 0,
        });
    }

    let t: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
        if (t !== undefined) clearTimeout(t);
        t = undefined;
    };

    if (getOwner()) onCleanup(clear);

    const debounced = (v: T) => {
        clear();
        t = setTimeout(() => fn(v), ms);
    };

    return Object.assign(debounced, { clear });
}
