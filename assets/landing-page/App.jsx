import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Database,
  Cpu,
  Github,
  Code,
  Shield,
  Zap,
  ExternalLink,
  Menu,
  X,
  ChevronRight,
  Layers,
} from 'lucide-react';

/**
 * Design System: Seu Claude Premium (V10 - Launch Edition)
 * Estética: Minimalismo Fractal, Dracula Pro Palette, High Contrast.
 */
const Theme = {
  bg: '#0a0b10',
  card: '#24283b',
  stickerBg: '#161b22',
  fg: '#c0caf5',
  white: '#ffffff',
  pink: '#ff79c6',
  cyan: '#7dcfff',
  purple: '#bd93f9',
  green: '#50fa7b',
  orange: '#ffb86c',
};

// --- COMPONENTE DO LOGOTIPO (SVG VETORIAL) ---
const SeuClaudeLogo = ({ size = 280, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`drop-shadow-[0_25px_50px_rgba(0,0,0,0.8)] ${className}`}
  >
    <circle
      cx="100"
      cy="100"
      r="98"
      fill={Theme.white}
      fillOpacity="0.05"
      stroke={Theme.white}
      strokeWidth="0.5"
    />
    <circle cx="100" cy="100" r="92" fill={Theme.stickerBg} />

    <g opacity="1">
      <path
        d="M100 40 L160 110 L100 175 Z"
        fill={Theme.card}
        stroke={Theme.white}
        strokeOpacity="0.1"
      />
      <path
        d="M100 40 L40 110 L100 175 Z"
        fill={Theme.card}
        fillOpacity="0.85"
        stroke={Theme.white}
        strokeOpacity="0.1"
      />
      <path d="M40 110 L100 110 L70 150 Z" fill={Theme.purple} fillOpacity="0.15" />
      <path d="M160 110 L100 110 L130 150 Z" fill={Theme.cyan} fillOpacity="0.1" />
      <path d="M100 40 L70 80 L130 80 Z" fill={Theme.white} fillOpacity="0.03" />
    </g>

    <g>
      <rect
        x="62"
        y="98"
        width="76"
        height="30"
        rx="4"
        fill={Theme.bg}
        stroke={Theme.cyan}
        strokeWidth="1.5"
      />
      <line x1="100" y1="98" x2="100" y2="128" stroke={Theme.white} strokeOpacity="0.1" />
      <g strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M72 107L78 113L72 119" stroke={Theme.green} />
        <line x1="114" y1="119" x2="124" y2="119" stroke={Theme.pink} className="animate-pulse" />
      </g>
      <g stroke={Theme.white} strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M75 145C75 132 88 130 95 138" />
        <path d="M125 145C125 132 112 130 105 138" />
      </g>
      <circle cx="100" cy="138" r="3" fill={Theme.pink} />
    </g>
    <circle cx="165" cy="65" r="4" fill={Theme.green} className="animate-pulse" />
  </svg>
);

const App = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className="min-h-screen font-sans antialiased text-slate-100"
      style={{ backgroundColor: Theme.bg }}
    >
      {/* Navbar Minimalista */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 px-6 py-4 ${scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'}`}
      >
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <SeuClaudeLogo size={40} className="drop-shadow-none" />
            <span className="font-black text-xl tracking-tighter uppercase italic">Seu Claude</span>
          </div>
          <div className="hidden md:flex gap-10 text-[10px] font-black uppercase tracking-[0.3em] opacity-50">
            <a href="#features" className="hover:opacity-100 transition-opacity">
              Recursos
            </a>
            <a href="#demo" className="hover:opacity-100 transition-opacity">
              Terminal
            </a>
            <a
              href="https://github.com/jardhel/seu-claude"
              className="hover:opacity-100 transition-opacity flex items-center gap-2 font-bold"
            >
              <Github size={14} /> Github
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-40 px-6 overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20"
          style={{
            background: `radial-gradient(circle at 50% 20%, ${Theme.purple}, transparent 70%)`,
          }}
        />

        <div className="max-w-6xl mx-auto text-center">
          <div className="relative inline-block mb-12">
            <SeuClaudeLogo
              size={320}
              className="hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-2 rounded-full text-[10px] font-black tracking-[0.5em] uppercase shadow-2xl">
              Local RAG • Platinum Edition
            </div>
          </div>

          <h1 className="text-7xl md:text-9xl font-black tracking-tighter uppercase leading-[0.85] mb-8">
            Memória{' '}
            <span
              className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400"
              style={{ WebkitTextStroke: `1.5px ${Theme.pink}` }}
            >
              Eterna
            </span>
          </h1>

          <p className="text-lg md:text-2xl font-light tracking-[0.2em] uppercase opacity-40 max-w-3xl mx-auto mb-16 leading-relaxed">
            O sênior que conhece a sua codebase melhor do que o próprio Git. Contexto local, sem
            crashes, sem latência.
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            <button
              className="px-14 py-6 rounded-full font-black text-xs uppercase tracking-[0.3em] transition-all hover:shadow-[0_0_50px_rgba(255,121,198,0.3)] active:scale-95 flex items-center gap-3"
              style={{ backgroundColor: Theme.pink, color: Theme.bg }}
            >
              <Zap size={18} fill="currentColor" /> Instalar Plugin
            </button>
            <button className="px-14 py-6 rounded-full border-2 border-white/10 font-black text-xs uppercase tracking-[0.3em] transition-all hover:bg-white/5">
              Documentação
            </button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-32 grid md:grid-cols-3 gap-8">
        <div className="p-10 rounded-[3.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <Zap className="mb-6 text-pink-400" size={32} />
          <h3 className="text-2xl font-black uppercase tracking-tight mb-4 text-pink-400">
            RAM &lt; 400MB
          </h3>
          <p className="text-slate-400 leading-relaxed font-medium">
            Esqueça os 35GB de RAM do claude-mem. O Seu Claude utiliza persistência nativa LanceDB,
            rodando invisível em segundo plano.
          </p>
        </div>
        <div className="p-10 rounded-[3.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <Database className="mb-6 text-cyan-400" size={32} />
          <h3 className="text-2xl font-black uppercase tracking-tight mb-4 text-cyan-400">
            LanceDB Native
          </h3>
          <p className="text-slate-400 leading-relaxed font-medium">
            Busca vetorial ultra-eficiente com armazenamento em disco. A sua memória semântica
            permanece intacta, sessão após sessão.
          </p>
        </div>
        <div className="p-10 rounded-[3.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <Layers className="mb-6 text-green-400" size={32} />
          <h3 className="text-2xl font-black uppercase tracking-tight mb-4 text-green-400">
            Indexação cAST
          </h3>
          <p className="text-slate-400 leading-relaxed font-medium">
            Análise baseada em Abstract Syntax Trees. O vovô entende a hierarquia real do código,
            não apenas palavras soltas.
          </p>
        </div>
      </section>

      {/* Terminal View */}
      <section id="demo" className="max-w-5xl mx-auto px-6 py-32">
        <div className="rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_60px_120px_rgba(0,0,0,0.8)] bg-[#1e1f29]">
          <div className="px-8 py-5 flex items-center justify-between border-b border-white/5 bg-[#24283b]">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/20" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
              <div className="w-3 h-3 rounded-full bg-green-500/20" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] opacity-30">
              seu-claude-cli-v1.0.0
            </span>
          </div>
          <div className="p-12 font-mono text-sm md:text-lg space-y-10">
            <div className="flex gap-4">
              <span className="text-green-500 font-bold">➜</span>
              <span className="opacity-80">
                seu-claude --ask "Onde alterámos a lógica de auth ontem?"
              </span>
            </div>
            <div className="flex gap-10 p-10 rounded-[2.5rem] border border-white/5 bg-white/[0.02]">
              <div className="text-5xl grayscale opacity-40 select-none hidden md:block">👴</div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                  <p
                    className="font-black uppercase tracking-[0.2em] text-[10px]"
                    style={{ color: Theme.green }}
                  >
                    Memória Fractal Sincronizada
                  </p>
                </div>
                <p className="text-base md:text-xl leading-relaxed italic opacity-90">
                  "Eu rastreei as mudanças. Você otimizou os parsers em{' '}
                  <span style={{ color: Theme.pink }}>src/lib/rag.ts</span> para suportar o LanceDB
                  nativo às 16:45 de ontem."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-40 pb-20 px-6 text-center border-t border-white/5 pt-20">
        <p className="text-[10px] font-black uppercase tracking-[2em] mb-12 opacity-20 text-center">
          Seu Claude : Wisdom through local context
        </p>
        <div className="flex justify-center gap-12 text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">
          <span>MIT License</span>
          <span>Local Privacy First</span>
          <a href="https://github.com/jardhel/seu-claude">GitHub</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
