# Seu Claude - Brand & Technical Context

> **For AI Assistants (Copilot/Cursor/Claude):** This document defines the technical standards, visual identity, and brand guidelines for the Seu Claude project.

---

## 1. Project Overview

**Seu Claude** is a Premium Local RAG (Semantic Memory) plugin for Claude Code.

| Attribute          | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Concept**        | A wise, technological "senior grandpa" (vovô sênior)               |
| **Differentiator** | Ultra-efficient (< 400MB RAM) vs Python/ChromaDB solutions (35GB+) |
| **Philosophy**     | Local-first, privacy-preserving, zero-dependency                   |

---

## 2. Technical Stack (Mandatory)

| Layer               | Technology                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| **Runtime**         | Node.js (TypeScript, ESM)                                              |
| **Vector Database** | LanceDB (native disk persistence)                                      |
| **Indexing**        | web-tree-sitter for AST-based chunking (cAST)                          |
| **Embeddings**      | `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` (100% local) |
| **UI Framework**    | React + Tailwind CSS (for Landing Page/Dashboard)                      |

---

## 3. Visual Identity & Design System

### Color Palette (Dracula Pro)

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0b10; /* Deep Charcoal */
  --bg-card: #24283b; /* Card/Fractal base */
  --bg-sticker: #161b22; /* Dark Indigo (mascot base) */

  /* Accents (Dracula Pro) */
  --pink: #ff79c6; /* Primary actions, mustache */
  --cyan: #7dcfff; /* Data, visor */
  --purple: #bd93f9; /* Fractal structure */
  --green: #50fa7b; /* Status, prompt */
  --orange: #ffb86c; /* Warnings */

  /* Text */
  --fg-primary: #c0caf5; /* Main text */
  --fg-white: #ffffff; /* High contrast */
}
```

### Design Principles

| Principle         | Implementation                                                    |
| ----------------- | ----------------------------------------------------------------- |
| **Minimalism**    | Maximum negative space, light fonts (Inter/JetBrains Mono)        |
| **High Contrast** | Sharp contrast between dark background and neon Dracula accents   |
| **Premium Feel**  | Ultra-thin borders (0.5px), subtle radial gradients, deep shadows |

---

## 4. The Mascot (Fractal Logo)

The mascot is composed of **faceted fractal geometry** (no beret).

| Element      | Description                                       |
| ------------ | ------------------------------------------------- |
| **Eyes**     | Technical visor with terminal symbols `> _`       |
| **Mustache** | Code braces `{ }` shape in premium monoline style |
| **Face**     | Faceted (triangles/fractals) in `#24283b`         |
| **Base**     | Circle in `#161b22` (Dark Indigo)                 |

---

## 5. Logo SVG (Canonical Version)

```svg
<svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer glow ring -->
  <circle cx="100" cy="100" r="98" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-width="0.5" />

  <!-- Background circle -->
  <circle cx="100" cy="100" r="92" fill="#161b22" />

  <!-- Fractal face structure -->
  <g opacity="1">
    <!-- Right diamond half -->
    <path d="M100 40 L160 110 L100 175 Z" fill="#24283b" stroke="#ffffff" stroke-opacity="0.1" />
    <!-- Left diamond half -->
    <path d="M100 40 L40 110 L100 175 Z" fill="#24283b" fill-opacity="0.85" stroke="#ffffff" stroke-opacity="0.1" />
    <!-- Purple accent (bottom left) -->
    <path d="M40 110 L100 110 L70 150 Z" fill="#bd93f9" fill-opacity="0.15" />
    <!-- Cyan accent (bottom right) -->
    <path d="M160 110 L100 110 L130 150 Z" fill="#7dcfff" fill-opacity="0.1" />
    <!-- Top highlight -->
    <path d="M100 40 L70 80 L130 80 Z" fill="#ffffff" fill-opacity="0.03" />
  </g>

  <!-- Terminal visor (eyes) -->
  <g>
    <rect x="62" y="98" width="76" height="30" rx="4" fill="#0a0b10" stroke="#7dcfff" stroke-width="1.5" />
    <line x1="100" y1="98" x2="100" y2="128" stroke="#ffffff" stroke-opacity="0.1" />
    <g stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M72 107L78 113L72 119" stroke="#50fa7b" />
      <line x1="114" y1="119" x2="124" y2="119" stroke="#ff79c6" />
    </g>

    <!-- Mustache (code braces style) -->
    <g stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M75 145C75 132 88 130 95 138" />
      <path d="M125 145C125 132 112 130 105 138" />
    </g>

    <!-- Nose accent -->
    <circle cx="100" cy="138" r="3" fill="#ff79c6" />
  </g>

  <!-- Status indicator (top right) -->
  <circle cx="165" cy="65" r="4" fill="#50fa7b" />
</svg>
```

---

## 6. Voice & Tone

| Context              | Tone                                       |
| -------------------- | ------------------------------------------ |
| **System Messages**  | Senior, sophisticated, wise                |
| **Error Messages**   | Calm, reassuring, solution-oriented        |
| **Success Messages** | Confident, proud, efficient                |
| **Marketing**        | Premium, exclusive, technically impressive |

### Example Phrases

- ✅ "Eu rastreei as mudanças. Você otimizou os parsers às 16:45 de ontem."
- ✅ "Memória Fractal Sincronizada"
- ✅ "O sênior que conhece sua codebase melhor que o próprio Git"
- ❌ Avoid: Casual, overly playful, or unprofessional language

---

## 7. AI Implementation Guidelines

When generating code for Seu Claude:

1. **Prioritize local efficiency** - No external API calls for core functionality
2. **Maintain the senior, sophisticated voice** in system messages
3. **Follow the Dracula Pro color scheme** in all UI components
4. **Use TypeScript** with strict type checking
5. **Prefer disk-based storage** over in-memory solutions
6. **Keep RAM usage under 400MB** for the core indexing process

---

## 8. Key Links

| Resource    | URL                                                       |
| ----------- | --------------------------------------------------------- |
| **GitHub**  | https://github.com/jardhel/seu-claude                     |
| **npm**     | https://www.npmjs.com/package/seu-claude                  |
| **Release** | https://github.com/jardhel/seu-claude/releases/tag/v1.0.0 |

---

_Last updated: January 15, 2026 - v1.0.0 Launch_
