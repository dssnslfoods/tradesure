import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const isAdmin = me.is_admin;

  return (
    <div className="relative flex min-h-screen">
      {/* Subtle background mesh */}
      <div className="bg-grid pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      <Sidebar isAdmin={isAdmin} username={me.username} />

      <div className="flex flex-1 flex-col">
        <Topbar username={me.username} isAdmin={isAdmin} />
        <main className="flex-1 px-7 py-7">
          <div className="mx-auto max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
