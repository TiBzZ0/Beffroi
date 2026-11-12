import Link from "next/link";
import { ASK_ADMIN } from "@/components/ask-admin";
import { PASSWORD_RESET_ENABLED } from "@/lib/env";
import { ResetRequestForm } from "./reset-request-form";

export const metadata = { title: "Mot de passe oublié · Beffroi" };

export default function ForgotPasswordPage() {
  if (PASSWORD_RESET_ENABLED) return <ResetRequestForm />;
  // Pas de serveur d'e-mail : aucun lien ne pourrait être envoyé.
  return (
    <>
      <p className="auth-switch">Le royaume n&apos;envoie pas d&apos;e-mails. {ASK_ADMIN}</p>
      <p className="auth-switch">
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </>
  );
}
