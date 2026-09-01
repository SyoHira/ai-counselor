import 'katex/dist/katex.min.css';
import PhysicsNav from '@/components/physics/PhysicsNav';

export const metadata = {
  title: 'Quantum Physics Lab — 物理学習アプリ',
  description: '高校の基礎から博士レベルまで、物理学を体系的に学ぶ。量子系の理解と活用に重点を置いた学習環境。',
};

export default function PhysicsLayout({ children }) {
  return (
    <div className="min-h-[100dvh] bg-vacuum text-qink antialiased phys-dark">
      <PhysicsNav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 pt-5">{children}</main>
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 text-[11px] text-qmute/60 leading-relaxed">
        数値シミュレーションは教育目的の近似計算です。研究用途では収束性・境界条件・単位系をご自身で検証してください。
      </footer>
    </div>
  );
}
