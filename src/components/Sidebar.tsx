import { A } from "@solidjs/router";
import { createSignal, For, Show, type Component } from "solid-js";
import { action, useSubmission } from "@solidjs/router";

export type SidebarItem = {
  label: string;
  href: string;
  icon: (props: { class?: string }) => any;
};

type SidebarProps = {
  items: SidebarItem[];
};

const logoutAction = action(async () => {
  "use server";
  console.log("Logging out on server...");
});

const IconLogOut = (p: any) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

const IconPanelLeft = (p: any) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

const Sidebar: Component<SidebarProps> = (props) => {
  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const loggingOut = useSubmission(logoutAction);

  return (
    <aside
      class="flex flex-col h-screen bg-brand border-r border-black/10 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      classList={{
        "w-20": isCollapsed(),
        "w-84": !isCollapsed(),
      }}
    >
      <div class="h-16 flex items-center justify-between px-5 border-b border-black/10 shrink-0">
        <div
          class="flex items-center gap-3 overflow-hidden"
          classList={{
            "w-0 opacity-0": isCollapsed(),
          }}
        >
          <div class="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-xs">
            AG
          </div>

          <div class="flex flex-col transition-opacity duration-200">
            <span class="font-bold text-black text-base leading-tight truncate">
              AGM Construction
            </span>
          </div>
        </div>

        <button
          classList={{
            "mr-4": isCollapsed(),
          }}
          onClick={() => setIsCollapsed(!isCollapsed())}
          class="text-zinc-600 hover:text-black rounded-md hover:bg-black/5 transition-colors"
          title={isCollapsed() ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <IconPanelLeft class="w-5 h-5 transition-transform duration-300" />
        </button>
      </div>

      <nav class="flex-1 py-6 px-3 space-y-1 overflow-y-auto scrollbar-hide">
        <For each={props.items}>
          {(item) => (
            <A
              href={item.href}
              end={item.href === "/dashboard"}
              activeClass="bg-black text-white shadow-sm"
              inactiveClass="text-zinc-600 hover:bg-black/5 hover:text-black"
              class="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 overflow-hidden whitespace-nowrap"
            >
              <item.icon class="w-5 h-5 shrink-0" />

              <span
                class="font-medium transition-all duration-300"
                classList={{
                  "opacity-0 translate-x-2": isCollapsed(),
                  "opacity-100 translate-x-0": !isCollapsed(),
                }}
              >
                {item.label}
              </span>
              <Show when={isCollapsed()}>
                <div class="absolute left-16 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              </Show>
            </A>
          )}
        </For>
      </nav>

      {/* --- Footer / User / Logout --- */}
      <div class="p-3 border-t border-black/10 shrink-0">
        <form action={logoutAction} method="post">
          <button
            type="submit"
            disabled={loggingOut.pending}
            class="group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 overflow-hidden whitespace-nowrap"
          >
            <IconLogOut
              class={`w-5 h-5 shrink-0 ${loggingOut.pending ? "animate-pulse" : ""}`}
            />

            <span
              class={`font-medium transition-all duration-300 ${
                isCollapsed()
                  ? "opacity-0 translate-x-2"
                  : "opacity-100 translate-x-0"
              }`}
            >
              {loggingOut.pending ? "Signing out..." : "Sign Out"}
            </span>

            <Show when={isCollapsed()}>
              <div class="absolute left-16 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                Sign Out
              </div>
            </Show>
          </button>
        </form>
      </div>
    </aside>
  );
};

export default Sidebar;
