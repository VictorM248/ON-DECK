type Role = "Rep" | "Manager";
export default function Actions({ role }: { role: Role }) {
  const rep = ["Check In Guest", "Mark Service Done"];
  const mgr = ["View Reports", "Override Queue", "Send Announcement"];
  const actions = role === "Rep" ? rep : mgr;

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {actions.map((label) => (
        <button key={label} className="bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 px-4 rounded-xl shadow-sm transition">
          {label}
        </button>
      ))}
    </div>
  );
}
