import React, { createContext, useContext } from "react";

type SidebarCtx = {
  expanded: boolean;
};

const SidebarContext = createContext<SidebarCtx | null>(null);

export type SidebarProps = {
  expanded: boolean;
  onToggle: () => void;
  top?: React.ReactNode;     // logo area
  children: React.ReactNode; // items + dividers
  bottom?: React.ReactNode;  // optional footer
  className?: string;
};

export function Sidebar({
  expanded,
  onToggle,
  top,
  children,
  bottom,
  className = "",
}: SidebarProps) {
  return (
    <aside
        className={[
            "hidden md:flex shrink-0 border-r border-slate-800 bg-slate-950/60 backdrop-blur min-h-screen transition-[width] duration-200",
            expanded ? "w-72" : "w-16",
            className,
        ].join(" ")}
>

      <nav className="h-full w-full flex flex-col">
        {/* TOP */}
        <div className="px-4 pt-4 pb-3 min-h-[104px] flex items-start">
          <button
            type="button"
            onClick={onToggle}
            className="h-11 w-11 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center hover:bg-slate-800 transition"
            title={expanded ? "Collapse" : "Expand"}
          >
            {top}
          </button>
        </div>

        <div className="h-px bg-slate-800/80 w-full" />

        <SidebarContext.Provider value={{ expanded }}>
          <ul className="p-3 flex-1 flex flex-col gap-2">


            {children}
          </ul>
        </SidebarContext.Provider>

        {bottom ? (
          <>
            <div className="h-px bg-slate-800/80 w-full" />
            <div className={expanded ? "p-4" : "p-2"}>{bottom}</div>
          </>
        ) : null}
      </nav>
    </aside>
  );
}

export type SidebarItemProps = {
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
};

export function SidebarItem({
  icon,
  text,
  active,
  count,
  onClick,
  disabled,
}: SidebarItemProps) {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("SidebarItem must be used inside <Sidebar />");
  const { expanded } = ctx;

  const base =
  "relative w-full rounded-xl border transition flex items-center group overflow-hidden";
    const openCls = "h-11 px-3 gap-3 justify-start";     
    const closedCls = "h-11 w-11 mx-auto justify-center"; 
 
  const stateCls = disabled
    ? "opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500"
    : active
    ? "bg-blue-600/20 border-blue-500/40 text-slate-100"
    : "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800";

  return (
    <li>
      <button
        type="button"
        title={text}
        onClick={disabled ? undefined : onClick}
        className={[base, expanded ? openCls : closedCls, stateCls].join(" ")}
      >
        <span className="text-base w-6 text-center">{icon}</span>

        {expanded && (
          <>
            <span className="text-sm font-medium">{text}</span>

            {typeof count === "number" ? (
              <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200 border border-slate-700">
                {count}
              </span>
            ) : null}
          </>
        )}

        {/* collapsed dot */}
        {!expanded && typeof count === "number" && count > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
        ) : null}

        {/* collapsed tooltip */}
        {!expanded && (
          <span
            className={[
              "absolute left-full ml-3 px-2 py-1 rounded-md border border-slate-700 bg-slate-900 text-slate-100 text-xs",
              "invisible opacity-0 -translate-x-2 transition-[opacity,transform] duration-150",
              "group-hover:visible group-hover:opacity-100 group-hover:translate-x-0",

            ].join(" ")}
          >
            {text}
          </span>
        )}
      </button>
    </li>
  );
}
