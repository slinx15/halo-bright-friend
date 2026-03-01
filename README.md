# Halo Bright Friend — RRCollections Stock Management

A modern, mobile-first inventory management system built for **RRCollections**, a textile products business. Manage products, track stock movements, perform stock opname, analyze sales trends, and leverage AI-powered business insights — all from a single Progressive Web App.

## Features

- **Dashboard** — Real-time overview of stock levels, recent activity, and AI-generated business insights
- **Product Management** — Add, edit, and bulk-import products with pricing tiers (modal, normal, grosir)
- **Stock In / Stock Out** — Record incoming and outgoing inventory with per-transaction details (store, price type, notes)
- **Stock Opname** — Bulk reconciliation of physical vs. system stock with variance tracking
- **Sales Analysis** — 30-day sales trend charts, top products, and revenue breakdowns
- **AI Chat** — Conversational assistant with memory for querying inventory data and getting recommendations
- **AI Insights** — Automated business intelligence summaries powered by LLM
- **OCR Nota** — Upload receipt images for automatic data extraction
- **Import History** — Bulk import sales history from Excel/CSV files
- **User Management** — Role-based access control (admin / karyawan)
- **PWA Support** — Installable on mobile devices with offline-capable service worker

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| State | TanStack React Query |
| Routing | React Router v6 |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions, RLS) |
| AI | Lovable AI (Gemini / GPT models via Edge Functions) |
| Charts | Recharts |
| PWA | vite-plugin-pwa |

## Installation

```bash
git clone https://github.com/slinx15/halo-bright-friend.git
cd halo-bright-friend
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

> **Note:** Never commit `.env` to version control. The anon key is a publishable key safe for client-side use — all data security is enforced through Row Level Security (RLS) policies on the database.

## Running the Project

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server starts at `http://localhost:8080`.

## Project Structure

```
├── public/                  # Static assets & PWA icons
├── src/
│   ├── assets/              # Images and media
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── analisa/         # Sales analysis components
│   │   ├── keluar/          # Stock-out components
│   │   ├── opname/          # Stock opname components
│   │   └── produk/          # Product management components
│   ├── hooks/               # Custom React hooks (auth, products, sales)
│   ├── integrations/        # Supabase client & auto-generated types
│   ├── lib/                 # Utilities, parsers, analytics engine
│   ├── pages/               # Route-level page components
│   └── test/                # Test setup and specs
├── supabase/
│   └── functions/           # Edge Functions (AI chat, OCR, imports)
└── index.html
```

## Future Improvements

- Offline-first data sync with background queue
- Barcode / QR code scanning for faster stock entry
- Export reports to PDF
- Multi-warehouse support
- Push notifications for low-stock alerts
- Dashboard customization and widgets

## License

This project is proprietary software for RRCollections.
