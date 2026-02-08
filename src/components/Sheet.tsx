import { JSX, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
};

export default function Sheet(props: SheetProps) {
  // Close on Escape key
  createEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  // Prevent body scroll when open
  createEffect(() => {
    if (props.open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    onCleanup(() => { document.body.style.overflow = ''; });
  });

  return (
    <Portal>
      {/* Backdrop — visible but does NOT close on click */}
      <div
        class="fixed inset-0 z-40 bg-black/30 transition-opacity duration-300"
        classList={{
          'opacity-100 pointer-events-auto': props.open,
          'opacity-0 pointer-events-none': !props.open,
        }}
      />

      {/* Sheet panel */}
      <div
        class="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out"
        classList={{
          'translate-x-0': props.open,
          'translate-x-full': !props.open,
        }}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 class="text-lg font-semibold text-black">{props.title}</h2>
          <button
            onClick={() => props.onClose()}
            class="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div class="flex-1 overflow-y-auto px-5 py-4">
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
