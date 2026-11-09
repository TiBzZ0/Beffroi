export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">🔔 Beffroi</h1>
        <p className="auth-sub">Taillez la pierre, bâtissez ensemble le grand beffroi.</p>
        {children}
      </div>
    </main>
  );
}
