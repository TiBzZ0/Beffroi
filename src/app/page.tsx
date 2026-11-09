import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Game } from "@/components/game";
import { SetupNotice } from "@/components/setup-notice";
import { supabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Home() {
  await connection(); // rendu à chaque requête (session, état du joueur)
  if (!supabaseConfigured()) return <SetupNotice />;
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return <Game userId={user.id} />;
}
