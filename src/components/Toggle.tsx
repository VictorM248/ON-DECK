import { useState, useEffect } from "react";

type Role = "Sales" | "Admin";

type ToggleProps = {
  onChange: (role: Role) => void;
};

export default function Toggle({ onChange }: ToggleProps) {
  const [active, setActive] = useState<Role>(
    () => (localStorage.getItem("role") as Role) ?? "Sales"
  );

  // initial sync from localStorage → App
  useEffect(() => {
    onChange(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const handleClick = (role: Role) => {
    setActive(role);
    onChange(role);
    localStorage.setItem("role", role);
  };

  const base =
    "px-4 py-2 text-sm font-medium rounded-full border transition-colors";
  const activeCls = "bg-blue-600 text-white border-blue-500 shadow-md";
  const inactiveCls =
    "bg-slate-900 text-slate-200 border-transparent hover:bg-slate-800";

  return (
    <div className="inline-flex rounded-full bg-slate-800 border border-slate-700 p-1 shadow-inner">
      <button
        type="button"
        onClick={() => handleClick("Sales")}
        className={`${base} ${active === "Sales" ? activeCls : inactiveCls}`}
      >
        Sales
      </button>
      <button
        type="button"
        onClick={() => handleClick("Admin")}
        className={`${base} ${active === "Admin" ? activeCls : inactiveCls}`}
      >
        Admin
      </button>
    </div>
  );
}
