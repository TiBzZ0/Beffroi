export function SetupNotice() {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">🔔 Beffroi</h1>
        <p className="auth-sub">Le royaume n&apos;est pas encore relié à sa base.</p>
        <p>
          Renseigne les variables <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> et{" "}
          <code>SUPABASE_SECRET_KEY</code> (voir le README, section « Mise en ligne »), puis redéploie.
        </p>
      </div>
    </main>
  );
}
