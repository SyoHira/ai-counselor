import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one, query } from '@/lib/engine/db.mjs';
import { SEGMENTS } from '@/lib/engine/config.mjs';
import { CRISIS_MESSAGE } from '@/lib/engine/crisis.mjs';

export const dynamic = 'force-dynamic';

async function loadGuide(slug) {
  return one(`select * from guides where slug = $1 and status = 'published'`, [slug]);
}

export async function generateMetadata({ params }) {
  const guide = await loadGuide(params.slug);
  if (!guide) return {};
  return { title: `${guide.title} | Andon`, description: guide.description };
}

function linkFor(product, slug) {
  // Amazon はリダイレクトを挟まず直接リンク（トラッキングIDで計測）
  return product.network === 'amazon' ? product.url : `/go/p/${product.id}?g=${slug}`;
}

export default async function GuidePage({ params }) {
  const guide = await loadGuide(params.slug);
  if (!guide) notFound();
  const body = guide.body;
  const ids = body.picks.map((p) => p.productId);
  const products = ids.length
    ? await query(`select id, network, name, url from products where id = any($1) and status = 'active' and channels like '%guide%'`, [ids])
    : [];
  const picks = body.picks.map((p) => ({ ...p, product: products.find((x) => x.id === p.productId) })).filter((p) => p.product);
  const hasAmazon = picks.some((p) => p.product.network === 'amazon');
  query('update guides set views = views + 1 where slug = $1', [guide.slug]).catch(() => {});

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: body.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <main className="max-w-2xl mx-auto px-5 pb-20 text-charcoal">
      <header className="pt-10 pb-6">
        <Link href="/" className="text-xs text-charcoal/50">Andon</Link>
        <h1 className="text-2xl font-semibold leading-snug mt-2">{body.title}</h1>
        <p className="text-sm text-charcoal/60 mt-2">{body.description}</p>
        {picks.length > 0 && (
          <p className="text-[11px] text-charcoal/50 mt-3 bg-warm rounded-lg px-3 py-2">
            このページは広告（アフィリエイト）を含みます。紹介した商品・サービスの購入や申込で、Andon に報酬が支払われることがあります。
          </p>
        )}
      </header>

      <p className="text-[15px] leading-relaxed">{body.intro}</p>

      {guide.segment === 'mind' && (
        <aside className="mt-6 rounded-xl border border-stone p-4 text-xs leading-relaxed whitespace-pre-line text-charcoal/80">{CRISIS_MESSAGE}</aside>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">セルフチェック</h2>
        <p className="text-[11px] text-charcoal/50 mb-2">診断ではありません。いまの状態を整理する目安です。</p>
        <ul className="space-y-1.5 text-sm">
          {body.selfCheck.map((c) => <li key={c}>☐ {c}</li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">よくある背景</h2>
        {body.causes.map((c) => (
          <div key={c.heading} className="mb-4">
            <h3 className="font-medium">{c.heading}</h3>
            <p className="text-sm leading-relaxed text-charcoal/80 mt-1">{c.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">今日からできること</h2>
        {body.tips.map((t) => (
          <div key={t.heading} className="mb-4">
            <h3 className="font-medium">{t.heading}</h3>
            <p className="text-sm leading-relaxed text-charcoal/80 mt-1">{t.body}</p>
          </div>
        ))}
      </section>

      {picks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-1">頼れるもの <span className="text-xs font-normal text-charcoal/50">PR</span></h2>
          {picks.map((p) => (
            <div key={p.productId} className="mt-3 rounded-xl border border-stone/70 bg-white p-4">
              <h3 className="font-medium">{p.heading}</h3>
              <p className="text-[11px] text-charcoal/50 mt-0.5">{p.product.name}</p>
              <p className="text-sm leading-relaxed mt-2">{p.reason}</p>
              <p className="text-xs text-charcoal/60 mt-1">こんな人に: {p.fitFor}</p>
              <a href={linkFor(p.product, guide.slug)} rel="sponsored nofollow noopener" target="_blank" className="inline-block mt-3 text-sm px-4 py-2 rounded-xl bg-charcoal text-cream">
                詳しく見る（PR）
              </a>
            </div>
          ))}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">よくある質問</h2>
        {body.faq.map((f) => (
          <details key={f.q} className="mb-2 rounded-lg bg-warm px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer">{f.q}</summary>
            <p className="text-sm text-charcoal/80 mt-2 leading-relaxed">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="mt-10 rounded-xl bg-charcoal text-cream p-5">
        <p className="text-sm">ひとりで考えるのがしんどいときは、Andon に話してみてください。</p>
        <Link href="/chat" className="inline-block mt-3 text-sm underline">AI に相談する</Link>
      </section>

      <footer className="mt-10 text-[11px] text-charcoal/40 space-y-1">
        <p>このページは一般的な情報で、医療上の助言ではありません。つらさが続くときは医療機関に相談してください。</p>
        {hasAmazon && <p>Amazonのアソシエイトとして、Andon は適格販売により収入を得ています。</p>}
        <p>
          ほかの悩み: {SEGMENTS.filter((s) => s.id !== guide.segment).map((s) => (
            <Link key={s.id} href={`/guide/${s.id}`} className="underline mr-2">{s.label}</Link>
          ))}
        </p>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }} />
    </main>
  );
}
