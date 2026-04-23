import React, { createContext, useContext } from "react";

type SidebarCtx = {
  expanded: boolean;
  dark: boolean;
};

const SidebarContext = createContext<SidebarCtx | null>(null);

export type SidebarProps = {
  expanded: boolean;
  onToggle: () => void;
  top?: React.ReactNode;
  children: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
  dark?: boolean;
};

export function Sidebar({
  expanded,
  onToggle,
  top,
  children,
  bottom,
  className = "",
  dark = false,
}: SidebarProps) {
  return (
    <aside
      className={[
          "hidden md:flex shrink-0 border-r transition-[width] duration-200 sticky top-0 h-screen overflow-y-auto",
          dark
            ? "border-slate-700 bg-slate-900"
            : "border-slate-800 bg-slate-950/60 backdrop-blur",
          expanded ? "w-72" : "w-16",
          className,
      ].join(" ")}
    >
      <nav className="h-full w-full flex flex-col">
        <div className="px-3 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            className={[
              "h-11 w-11 rounded-xl overflow-hidden flex items-center justify-center transition shrink-0 border",
              dark
                ? "bg-slate-800 border-slate-700 hover:bg-slate-700"
                : "bg-slate-900 border-slate-800 hover:bg-slate-800",
            ].join(" ")}
            title={expanded ? "Collapse" : "Expand"}
          >
            {top}
          </button>
          {expanded && (
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="text-sm font-bold text-slate-100 whitespace-nowrap">Dalton</span>
              <span className="text-xs text-slate-400 font-semibold italic whitespace-nowrap">Passion for you</span>
            </div>
          )}
        </div>
        <div className={["h-px w-full", dark ? "bg-slate-700" : "bg-slate-800/80"].join(" ")} />

        <SidebarContext.Provider value={{ expanded, dark }}>
          <ul className="px-[10px] py-3 flex-1 flex flex-col gap-2">
            {children}
          </ul>
        </SidebarContext.Provider>

        {bottom ? (
          <>
            <div className={["h-px w-full", dark ? "bg-slate-700" : "bg-slate-800/80"].join(" ")} />
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
  const { expanded, dark } = ctx;

  const base =
    "relative w-full rounded-xl border transition flex items-center group overflow-hidden";
  const openCls = "h-11 px-3 gap-3 justify-start";
  const closedCls = "h-11 w-11 mx-auto justify-center shrink-0";

  const stateCls = disabled
    ? dark
      ? "opacity-50 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500"
      : "opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500"
    : active
    ? dark
      ? "bg-blue-600/30 border-blue-500/40 text-white"
      : "bg-blue-600/20 border-blue-500/40 text-slate-100"
    : dark
      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
      : "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800";

  return (
    <li>
      <button
        type="button"
        title={text}
        onClick={disabled ? undefined : onClick}
        className={[base, expanded ? openCls : closedCls, stateCls].join(" ")}
      >
        <span className="text-base flex items-center justify-center">{icon}</span>

        {expanded && (
          <>
            <span className="text-sm font-semibold">{text}</span>

            {typeof count === "number" ? (
              <span className={[
                "ml-auto rounded-full px-2 py-0.5 text-xs border",
                dark
                  ? "bg-slate-700 text-slate-200 border-slate-600"
                  : "bg-slate-800 text-slate-200 border-slate-700",
              ].join(" ")}>
                {count}
              </span>
            ) : null}
          </>
        )}

        {!expanded && typeof count === "number" && count > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
        ) : null}

        {!expanded && (
          <span
            className={[
              "absolute left-full ml-3 px-2 py-1 rounded-md text-xs",
              dark
                ? "border border-slate-600 bg-slate-800 text-slate-100"
                : "border border-slate-700 bg-slate-900 text-slate-100",
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