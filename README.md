# 📦 RRCollections — Intelligent Stock Management

> A modern, mobile-first inventory management platform purpose-built for **RRCollections**, a growing textile business in Indonesia. Designed to replace manual stock tracking with real-time data, AI-powered insights, and seamless multi-user collaboration.

[![Built with Lovable](https://img.shields.io/badge/Built%20with-Lovable-ff69b4)](https://lovable.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5a0fc8)](#)

---

## The Problem

Small-to-medium textile businesses often rely on handwritten notes, spreadsheets, or WhatsApp messages to track inventory. This leads to stock discrepancies, lost sales data, and zero visibility into business performance. **RRCollections** needed a purpose-built tool that works on any device, understands their workflow, and grows with the business.

## The Solution

A full-stack Progressive Web App that handles the entire inventory lifecycle — from product registration and pricing, through stock movements and reconciliation, to AI-driven sales analysis and business recommendations.

---

## Features

| Category | Capability |
|----------|-----------|
| 📊 **Dashboard** | Real-time stock overview, activity feed, and AI-generated business insights |
| 🏷️ **Product Management** | Products with multi-tier pricing (modal, normal, grosir), categories, aliases, and bulk import |
| 📥 **Stock In** | Record incoming inventory with notes and tumpukan (stack) tracking |
| 📤 **Stock Out** | Outgoing stock with store attribution, price type selection, and order vs. shipment quantities |
| 🔍 **Stock Opname** | Bulk physical-vs-system reconciliation with variance detection and adjustment logging |
| 📈 **Sales Analysis** | 30-day trend charts, top products by volume and revenue, store-level breakdowns |
| 🤖 **AI Chat** | Conversational assistant with persistent memory — ask questions about your inventory in natural language |
| 💡 **AI Insights** | Automated business intelligence summaries refreshed on demand |
| 📷 **OCR Nota** | Upload receipt photos for automatic product and quantity extraction |
| 📁 **Import History** | Bulk import sales records from Excel / CSV files |
| 👥 **User Management** | Role-based access control (admin / karyawan) with secure authentication |
| 📱 **PWA** | Installable on mobile, works offline-capable with automatic updates |

---

## Tech Stack

```
┌─────────────────────────────────────────────────┐
│  Frontend                                       │
│  React 18 · TypeScript · Vite · Tailwind CSS    │
│  shadcn/ui · TanStack Query · React Router v6   │
│  Recharts · vite-plugin-pwa                     │
├─────────────────────────────────────────────────┤
│  Backend (Lovable Cloud)                        │
│  PostgreSQL · Row Level Security · Auth          │
│  Edge Functions (Deno) · AI Models              │
├─────────────────────────────────────────────────┤
│  AI Layer                                       │
│  Gemini / GPT models via serverless functions   │
│  OCR · Natural language queries · Auto-insights │
└─────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 18+ ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- npm or bun

### Installation

```bash
git clone https://github.com/slinx15/halo-bright-friend.git
cd halo-bright-friend
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

> **Security:** The publishable key is safe for the browser, but the real `.env` file must stay local. Never commit `.env` to version control.

### Run

```bash
npm run dev        # → http://localhost:8080
npm run build      # Production build
npm run preview    # Preview production build
```

---

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/              #   shadcn/ui primitives
│   ├── analisa/         #   Sales analysis widgets
│   ├── keluar/          #   Stock-out input components
│   ├── opname/          #   Opname bulk input
│   └── produk/          #   Product management dialogs
├── hooks/               # Data fetching & auth hooks
├── integrations/        # Backend client & generated types
├── lib/                 # Utilities, parsers, analytics engine
├── pages/               # Route-level views
└── test/                # Test infrastructure

supabase/
└── functions/           # Serverless edge functions
    ├── ai-chat/         #   Conversational AI
    ├── ai-insights/     #   Business intelligence
    ├── ocr-nota/        #   Receipt OCR
    ├── bulk-import/     #   Product bulk import
    ├── import-sales-history/
    └── manage-users/    #   Admin user management
```

---

## Roadmap

- [ ] Offline-first data sync with background queue
- [ ] Barcode / QR code scanning for stock entry
- [ ] PDF report export
- [ ] Multi-warehouse support
- [ ] Push notifications for low-stock alerts
- [ ] Customizable dashboard widgets

---

## License

Proprietary software for RRCollections. All rights reserved.
