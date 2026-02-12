type Role = "Sales" | "Admin";

type ToggleProps = {
  activeRole: Role;
  onSetRole: (role: Role) => void;
  onRequestAdmin: () => void;
};

export default function Toggle({
  activeRole,
  onSetRole,
  onRequestAdmin,
}: ToggleProps) {
  const base =
    "px-4 py-2 text-sm font-medium rounded-full border transition-colors";
  const activeCls = "bg-blue-600 text-white border-blue-500 shadow-md";
  const inactiveCls =
    "bg-slate-900 text-slate-200 border-transparent hover:bg-slate-800";

  return (
    <div className="inline-flex rounded-full bg-slate-800 border border-slate-700 p-1 shadow-inner">
      <button
        type="button"
        onClick={() => onSetRole("Sales")}
        className={`${base} ${
          activeRole === "Sales" ? activeCls : inactiveCls
        }`}
      >
        Sales
      </button>

      <button
        type="button"
        onClick={onRequestAdmin}
        className={`${base} ${
          activeRole === "Admin" ? activeCls : inactiveCls
        }`}
      >
        Admin
      </button>
    </div>
  );
}
