# Steam Market Tracker

Theo dõi order book (lệnh mua/bán) và biểu đồ giá của nhiều item Steam Market cùng lúc, gần realtime.

## Stack

- **Next.js 14** (App Router, TypeScript) — frontend + API proxy
- **Tailwind CSS** + lightweight-charts
- **Supabase** — Postgres, Auth (GitHub OAuth), Realtime
- **Vercel** — deploy (auto từ GitHub, preview mỗi branch)

## Kiến trúc

```
Browser ──► Next.js API route (proxy + cache) ──► Supabase (cache/DB)
                          │
                          └──► Steam endpoints (throttled, server-only)
```

Browser KHÔNG bao giờ gọi Steam trực tiếp (CORS + rate limit). Server là bên
duy nhất fetch Steam, có throttle, cache vào Supabase, rồi đẩy xuống client
qua Supabase Realtime để UI cập nhật "gần realtime".

## Steam endpoints dùng tới

| Mục đích | Hàm | Ghi chú |
|---|---|---|
| Resolve `item_nameid` | `resolveItemNameId` | Scrape 1 lần từ HTML trang listing, lưu DB |
| Order book mua/bán | `getItemOrders` | Cần `item_nameid` |
| Giá tổng quan | `getPriceOverview` | Nhẹ |
| Chart lịch sử | `getPriceHistory` | **Cần cookie `steamLoginSecure`** (env) |

⚠️ Đây là unofficial API. Steam rate-limit ~20 req/phút/IP → phải cache mạnh
và throttle. Đừng poll thẳng mỗi 1s (sẽ bị ban IP).

## Setup

1. Cài deps:
   ```bash
   npm install
   ```
2. Tạo Supabase project, chạy `supabase/migrations/0001_init.sql` trong SQL editor.
3. Copy env:
   ```bash
   cp .env.local.example .env.local
   ```
   Điền `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. (Chart cần thêm `STEAM_LOGIN_COOKIE`.)
4. Bật GitHub OAuth trong Supabase: Authentication > Providers > GitHub.
5. Chạy dev:
   ```bash
   npm run dev
   ```

## Thử API proxy

```
GET /api/steam/orders?url=<link market listing của item>
```

## Roadmap

- [x] Phase 0 — scaffold, Supabase clients, schema, Steam scraper, API proxy
- [ ] Phase 1 — UI add item + hiển thị order book
- [ ] Phase 2 — watchlist theo user (auth GitHub)
- [ ] Phase 3 — background poller + Realtime push + chart
- [ ] Phase 4 — so sánh nhiều item, polish

## Deploy (Vercel)

Import repo trên Vercel → set env vars → mỗi push branch = Preview Deployment,
merge vào `main` = Production.
