import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container section" style={{ minHeight: '70vh', display: 'grid', alignContent: 'center' }}>
      <div className="kicker">404</div>
      <h1 className="display" style={{ fontSize: 'clamp(3rem, 9vw, 7rem)' }}>Nothing here.</h1>
      <p className="lede">The page you are looking for has moved or never existed.</p>
      <div style={{ marginTop: 30 }}><Link className="btn btn--primary" href="/">Return home</Link></div>
    </main>
  );
}
