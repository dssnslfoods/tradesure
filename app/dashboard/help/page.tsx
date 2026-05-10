import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import HelpClient from "./HelpClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Help",
};

export default async function HelpPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/dashboard/help");
  return <HelpClient />;
}
