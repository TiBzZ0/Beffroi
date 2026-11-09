import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion · Beffroi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  return <LoginForm linkError={erreur === "lien"} />;
}
