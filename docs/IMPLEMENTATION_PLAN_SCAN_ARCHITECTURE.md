# 🏗️ Implementation Plan: Scan Architecture Refactor

## Overview

Refaktorovat scan systém na dvě jasně oddělené větve:

1. **Manuální scany** — běží v prohlížeči, chunked, uživatel musí zůstat online
2. **Plánované scany** — cron jobs na serveru, daily/weekly/monthly, jen pro paid users

---

## 📌 Stav tasků (Task Tracker)

> **⚠️ PRAVIDLO PRO AGENTY:** Každý agent MUSÍ aktualizovat tento tracker:
> 1. **Když ZAČÍNÁ task** → změnit status na `🔄 IN PROGRESS` a zapsat datum
> 2. **Když DOKONČÍ task** → změnit status na `✅ DONE` a zapsat datum
> 3. **Pokud task SELŽE** → změnit status na `❌ BLOCKED` a zapsat důvod
> 4. **NIKDY nepřeskakovat** tento krok!

| Task | Status | Agent/Model | Zahájeno | Dokončeno | Poznámky |
|------|--------|-------------|----------|-----------|----------|
| 1.1 DB migrace | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Migrace 023, nové sloupce + trigger update |
| 1.2 TypeScript typy | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Hotovo spolu s 1.1, InsertProject typ opraven |
| 2.1 Scan engine refaktor | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Browser-based chunked scan |
| 2.2 Chunk API update | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Follow-up support added, completedQueries response |
| 2.3 Warning banner UI | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | AlertTriangle + amber styling, zobrazuje se při isScanning |
| 2.4 Progress queries UI | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Message zobrazuje "Processing query X/Y", % progress |
| 2.5 beforeunload event | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Browser dialog při zavření během running scan |
| 3.1 Cleanup queue system | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | process-queue cron odstraněn, endpoint deprecated |
| 4.1 Scheduling logika | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Pure TS, Intl.DateTimeFormat, DST-safe |
| 4.2 Scheduled-scans cron | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Hourly cron, free-tier skip, TS scheduling |
| 4.3 API schedule save | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | PATCH validace + calculateNextScheduledScan |
| 5.1 Scheduling UI | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Frequency/hour/day selectors, timezone display |
| 5.2 Free user gate | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Lock UI + CTA pro free users, /api/credits fetch |
| 5.3 Project page info | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Schedule display s daily/weekly/monthly + AM/PM format |
| 6.1 Vercel.json update | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | Cron schedule updated: hourly scheduled-scans, 5-min process-scan |
| 6.2 Scheduling testy | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | 19 testů (daily/weekly/monthly, DST, edge cases) |
| 6.3 Dokumentace | ✅ DONE | Sonnet 4.5 | 2026-02-08 | 2026-02-08 | SCALABILITY_ANALYSIS.md rozšířena o novou architekturu |

**Statusy:** ⬚ TODO → 🔄 IN PROGRESS → ✅ DONE | ❌ BLOCKED

**Další task k řešení:** VŠECHNY TASKY DOKONČENY! 🎉

---

## 📊 Aktuální stav (co existuje)

| Systém | Stav | Soubory |
|--------|------|---------|
| Queue-based manual scan | ✅ Existuje | `scan-context.tsx`, `api/projects/[id]/scan/queue/`, `api/cron/process-queue/` |
| Browser chunk endpoint | ✅ Existuje | `api/projects/[id]/scan/chunk/route.ts` |
| Scan start endpoint | ✅ Existuje | `api/projects/[id]/scan/start/route.ts` |
| Scheduled scan cron | ✅ Existuje (jen weekly) | `api/cron/scheduled-scans/route.ts`, `api/cron/process-scan/route.ts` |
| Project settings UI | ✅ Existuje (jen weekly) | `(dashboard)/projects/[id]/settings/page.tsx` |
| User timezone | ✅ Existuje | `(dashboard)/settings/page.tsx`, `api/settings/profile/` |
| DB: projects scheduled columns | ✅ Existuje (jen weekly) | `scheduled_scan_enabled`, `scheduled_scan_day`, `next_scheduled_scan_at` |

---

## 🎯 Cílový stav

### Manuální scany (prohlížeč)
- Uživatel klikne "Run Scan" → scan běží v prohlížeči přes chunked API calls
- Progress se zobrazuje po queries (ne po chunks): `"5/120 dotazů"`
- Zavření prohlížeče = zastavení scanu
- Upozornění v UI: "Nezavírejte okno, zůstaňte připojeni k internetu"
- Follow-up queries fungují stejně jako nyní
- Výsledky se ukládají průběžně

### Plánované scany (cron jobs)
- Frekvence: Daily / Weekly / Monthly
- Nastavitelná hodina (0-23) v timezone uživatele
- Weekly: + den v týdnu (Po-Ne)
- Monthly: + den v měsíci (1-28)
- Běží na serveru, nezávisle na prohlížeči
- Free users: vidí nastavení, ale je locked s CTA na upgrade
- Žádné emaily

---

## 📋 Implementační tasky

### Obtížnost legend
- 🟢 **EASY** — Jednoduché změny, styling, UI tweaks. Model: **Haiku 4.5** / **Gemini Flash**
- 🟡 **MEDIUM** — Nové komponenty, API endpointy, logika. Model: **Sonnet 4.5** / **GPT-5 Mini**
- 🔴 **HARD** — Komplexní logika, scan engine, cron scheduling, DB migrace. Model: **Opus** / **Sonnet 4.5**

---

## FÁZE 1: Databáze a typy (základ)

### Task 1.1 🔴 HARD — Databázová migrace: Rozšíření scheduled scan sloupců
> 📋 **Tracker:** Před začátkem nastav `1.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Rozšířit tabulku `projects` o nové sloupce pro scheduled scans. Stávající sloupce zachovat pro zpětnou kompatibilitu.

**Co udělat:**
1. Vytvořit nový SQL migration soubor v `supabase/migrations/`
2. Přidat do tabulky `projects`:
   - `scheduled_scan_frequency TEXT DEFAULT 'weekly'` — `'daily'`, `'weekly'`, `'monthly'`
   - `scheduled_scan_hour INTEGER DEFAULT 6` — hodina spuštění (0-23)
   - `scheduled_scan_day_of_month INTEGER` — den v měsíci pro monthly (1-28)
3. Existující sloupec `scheduled_scan_day` (0-6) se ponechá a bude sloužit pro weekly
4. Aktualizovat výpočet `next_scheduled_scan_at` v triggeru/funkci

**Soubory:**
- `supabase/migrations/XXXX_scheduled_scan_frequency.sql` (nový)
- `supabase/schema.sql` (aktualizovat reference)

**Kontext:** Přečíst `supabase/schema.sql` a `lib/db/schema.ts` pro pochopení stávající struktury.

**Ověření:** Migrace musí jít spustit v Supabase SQL editoru bez chyb.

---

### Task 1.2 🟡 MEDIUM — Aktualizace TypeScript typů
> 📋 **Tracker:** Před začátkem nastav `1.2` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat TypeScript typy v `lib/db/schema.ts` tak, aby odpovídaly nové DB struktuře.

**Co udělat:**
1. V interface `Project` přidat:
   ```typescript
   scheduled_scan_frequency: 'daily' | 'weekly' | 'monthly'
   scheduled_scan_hour: number  // 0-23
   scheduled_scan_day_of_month: number | null  // 1-28 for monthly
   ```
2. Ověřit, že `ScheduledScanHistory` interface je stále aktuální

**Soubory:**
- `lib/db/schema.ts`

**Ověření:** `npm run build` musí projít (pokud type errory, opravit v navazujících souborech).

---

## FÁZE 2: Manuální scany — Browser-based chunked scan

### Task 2.1 🔴 HARD — Nový scan engine pro prohlížeč (scan-context refaktor)
> 📋 **Tracker:** Před začátkem nastav `2.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Přepsat `lib/scan/scan-context.tsx` tak, aby manuální scany běžely přímo v prohlížeči přes chunked API calls místo server-side queue.

**Klíčové principy:**
- Scan se NEODESÍLÁ do queue na serveru
- Místo toho prohlížeč sám volá `/api/projects/[id]/scan/chunk` endpoint opakovaně
- Každý chunk zpracuje N queries × M models (tak aby se vešel do ~25s edge timeout)
- Progress se počítá po QUERIES, ne po chunks (uživatel vidí "5/120 dotazů")
- Follow-up queries se zahrnují do chunks
- Pokud uživatel zavře okno, scan se zastaví (žádná serverová queue)

**Co udělat:**
1. Přepsat `startScan()` funkci:
   - Zavolá `/api/projects/[id]/scan/start` pro vytvoření scan záznamu (to už existuje)
   - Spočítá chunky: rozdělí queries do skupin tak, aby se chunk stihl za <25s
   - Chunk size: `Math.max(1, Math.floor(25 / (selectedModels.length * avgTimePerOperation)))`
   - Jednodušší fallback: 1-3 queries per chunk v závislosti na počtu modelů
   - Postupně volá `/api/projects/[id]/scan/chunk` pro každý chunk
   - Mezi chunky aktualizuje progress
2. Progress tracking:
   - `progress.current` = počet zpracovaných QUERIES (ne operací)
   - `progress.total` = celkový počet queries
   - `progress.message` = `"Processing query 5/20..."`
3. Zrušení: uživatel může kdykoli zrušit, cancel stopne aktuální fetch
4. Error handling: pokud chunk selže, retry 1x, pak pokračovat dalším chunkem
5. Po dokončení všech chunků zavolat `/api/projects/[id]/scan/[scanId]/complete`

**Soubory:**
- `lib/scan/scan-context.tsx` (hlavní refaktor)

**Kontext:** Přečíst aktuální `scan-context.tsx`, `scan/chunk/route.ts`, `scan/start/route.ts`.

**Ověření:**
- Build projde
- Manuální test: spustit scan v prohlížeči, vidět progress po queries
- Zavření okna zastaví scan

---

### Task 2.2 🟡 MEDIUM — Aktualizace chunk API endpointu
> 📋 **Tracker:** Před začátkem nastav `2.2` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat `/api/projects/[id]/scan/chunk/route.ts` aby podporoval follow-up queries a vracel informace o zpracovaných queries.

**Co udělat:**
1. Přidat podporu pro follow-up queries v chunk endpointu:
   - Přijmout `followUpEnabled` a `followUpDepth` z requestu
   - Pro každou query zpracovat initial + follow-up dotazy
   - Vrátit `completedQueries` (počet zpracovaných queries, ne operací)
2. Vrátit v response:
   ```json
   {
     "completedQueries": 3,
     "totalOperations": 12,
     "results": [...],
     "totalCostCents": 150
   }
   ```
3. Chunk musí zpracovat follow-ups pro každou query před přechodem na další query

**Soubory:**
- `app/api/projects/[id]/scan/chunk/route.ts`

**Kontext:** Přečíst aktuální `chunk/route.ts` a `cron/process-queue/route.ts` (kde jsou follow-ups implementovány).

**Ověření:** Chunk endpoint vrací follow-up výsledky správně.

---

### Task 2.3 🟢 EASY — UI: Warning banner "Nezavírejte okno"
> 📋 **Tracker:** Před začátkem nastav `2.3` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Přidat do project page UI banner, který se zobrazí při běžícím scanu a upozorní uživatele, aby nezavíral okno.

**Co udělat:**
1. V `app/(dashboard)/dashboard/projects/[id]/page.tsx` najít sekci `{/* Scan Progress */}`
2. Přidat do Card s progressem upozornění:
   ```
   ⚠️ Please don't close this window. The scan requires an active internet 
   connection. If you close the window, the scan will stop and you'll need 
   to start it again.
   ```
3. Styling: `bg-amber-500/10 border-amber-500/20 text-amber-400` (konzistentní s existujícím designem)
4. Zobrazit jen když `isScanning === true`

**Soubory:**
- `app/(dashboard)/dashboard/projects/[id]/page.tsx`

**Ověření:** Vizuální kontrola v prohlížeči.

---

### Task 2.4 🟢 EASY — UI: Progress bar zobrazuje queries místo operací
> 📋 **Tracker:** Před začátkem nastav `2.4` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Upravit progress bar na project page, aby zobrazoval počet zpracovaných QUERIES místo celkových operací.

**Co udělat:**
1. V `app/(dashboard)/dashboard/projects/[id]/page.tsx` najít progress sekci
2. Změnit text z `"{current}/{total}"` na `"Processing query {current}/{total}..."`
3. Zajistit, že `progress.current` a `progress.total` reflektují queries (toto závisí na Task 2.1)

**Soubory:**
- `app/(dashboard)/dashboard/projects/[id]/page.tsx`

**Ověření:** Vizuální kontrola — progress ukazuje "Processing query 5/20..."

---

### Task 2.5 🟡 MEDIUM — Přidat `beforeunload` event listener
> 📋 **Tracker:** Před začátkem nastav `2.5` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Přidat ochranu proti náhodnému zavření okna když běží scan.

**Co udělat:**
1. V `scan-context.tsx` přidat `useEffect` s `beforeunload` eventom:
   - Pokud existuje aktivní scan (status === 'running'), zabránit zavření
   - Browser zobrazí standardní dialog "Are you sure you want to leave?"
2. Cleanup: odebrat listener když žádný scan neběží
3. Při skutečném zavření (uživatel potvrdí): zavolat cleanup endpoint pokud možno

**Soubory:**
- `lib/scan/scan-context.tsx`

**Ověření:** Při zavření okna se zobrazí potvrzovací dialog.

---

## FÁZE 3: Cleanup starého queue systému

### Task 3.1 🟡 MEDIUM — Zrušit server-side queue pro manuální scany
> 📋 **Tracker:** Před začátkem nastav `3.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Po úspěšné implementaci browser-based chunked scanů, vyčistit starý queue systém pro manuální scany. **POZOR:** Server-side processing pro scheduled scany (process-scan) MUSÍ zůstat!

**Co udělat:**
1. Z `vercel.json` ODEBRAT cron pro `process-queue`:
   ```json
   { "path": "/api/cron/process-queue", "schedule": "* * * * *" }
   ```
2. Soubor `app/api/cron/process-queue/route.ts` označit jako deprecated nebo smazat
3. Endpointy `scan/queue/` mohou zůstat pro zpětnou kompatibilitu ale nebudou primárně používány
4. `scan_queue` tabulka může zůstat (nemazat data), ale nové scany do ní nebudou přidávány manuálně

**Soubory:**
- `vercel.json`
- `app/api/cron/process-queue/route.ts` (deprecated/smazat)

**Kontext:** Přečíst `vercel.json`. Ujistit se, že `process-scan` cron zůstává (pro scheduled scany).

**Ověření:** `vercel.json` nemá `process-queue` cron. Build projde. Scheduled scany stále fungují.

---

## FÁZE 4: Plánované scany — Nový scheduling systém

### Task 4.1 🔴 HARD — Nová logika pro výpočet next_scheduled_scan_at
> 📋 **Tracker:** Před začátkem nastav `4.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Implementovat funkci, která na základě frekvence, hodiny, dne a timezone uživatele vypočítá, kdy má příští scan proběhnout.

**Co udělat:**
1. Vytvořit helper funkci `calculateNextScheduledScan()` v `lib/scan/scheduling.ts` (nový soubor):
   ```typescript
   function calculateNextScheduledScan(params: {
     frequency: 'daily' | 'weekly' | 'monthly'
     hour: number            // 0-23 v user timezone
     dayOfWeek?: number      // 0-6 pro weekly
     dayOfMonth?: number     // 1-28 pro monthly
     timezone: string        // e.g. 'Europe/Prague'
     lastScanAt?: string     // ISO string
   }): string  // vrací ISO string v UTC
   ```
2. Logika:
   - **Daily**: Každý den v `hour` hodin v user timezone → převést na UTC
   - **Weekly**: Každý `dayOfWeek` v `hour` hodin → převést na UTC
   - **Monthly**: Každý `dayOfMonth` v `hour` hodin → převést na UTC
3. Pokud vypočtený čas je v minulosti, posunout na další periodu
4. Timezone konverze: Použít `Intl.DateTimeFormat` nebo malou helper funkci (bez externích knihoven)

**Soubory:**
- `lib/scan/scheduling.ts` (nový)

**Kontext:** Přečíst jak se timezone ukládá (`api/settings/profile/`).

**Ověření:** Unit testy pro různé kombinace (daily Prague 6:00 → UTC, weekly Monday 8:00 Tokyo → UTC, etc.)

---

### Task 4.2 🔴 HARD — Přepsat scheduled-scans cron endpoint
> 📋 **Tracker:** Před začátkem nastav `4.2` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Přepsat `api/cron/scheduled-scans/route.ts` aby podporoval daily/weekly/monthly scheduling s timezone.

**Co udělat:**
1. Změnit cron schedule z jednoho denního běhu (`0 6 * * *`) na **každou hodinu** (`0 * * * *`):
   - Každou hodinu zkontroluje, které projekty mají `next_scheduled_scan_at <= NOW()`
   - Tím se pokryje jakákoli hodina v jakékoli timezone
2. Při nalezení projektů:
   - Ověřit, že uživatel je paid tier (ne free)
   - Vytvořit záznam v `scheduled_scan_history`
   - Spustit workers (existující logika)
   - Vypočítat nový `next_scheduled_scan_at` pomocí `calculateNextScheduledScan()`
   - Potřebuje načíst timezone uživatele z `user_profiles` tabulky
3. Free user projekty přeskočit (nelogovat chybu, jen skip)

**Soubory:**
- `app/api/cron/scheduled-scans/route.ts`
- `vercel.json` (změnit schedule)

**Kontext:** Přečíst aktuální `scheduled-scans/route.ts` a `lib/scan/scheduling.ts` (z Task 4.1).

**Ověření:** 
- Build projde
- Cron manuálně otestovat s různými frekvencemi
- Free user projekty jsou přeskočeny

---

### Task 4.3 🟡 MEDIUM — API endpoint pro ukládání schedule nastavení
> 📋 **Tracker:** Před začátkem nastav `4.3` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat PATCH endpoint pro projekty, aby přijímal nové scheduling parametry a správně počítal `next_scheduled_scan_at`.

**Co udělat:**
1. V `app/api/projects/[id]/route.ts` PATCH handleru:
   - Přijmout nové parametry: `scheduled_scan_frequency`, `scheduled_scan_hour`, `scheduled_scan_day_of_month`
   - Při změně scheduling parametrů přepočítat `next_scheduled_scan_at`
   - Načíst timezone z user profile
   - Použít `calculateNextScheduledScan()` z Task 4.1
2. Validace:
   - `frequency`: musí být 'daily', 'weekly', nebo 'monthly'
   - `hour`: 0-23
   - `day_of_month`: 1-28
   - `scheduled_scan_day`: 0-6 (pro weekly)

**Soubory:**
- `app/api/projects/[id]/route.ts`

**Kontext:** Přečíst aktuální PATCH handler v tomto souboru.

**Ověření:** PATCH request s novými parametry vrací správný `next_scheduled_scan_at`.

---

## FÁZE 5: UI — Plánované scany nastavení

### Task 5.1 🟡 MEDIUM — Nové scheduling UI v project settings
> 📋 **Tracker:** Před začátkem nastav `5.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Kompletně přepsat sekci "Scheduled Scans" v project settings pro podporu daily/weekly/monthly s hodinami.

**Co udělat:**
1. V `app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`:
   - Přidat state proměnné:
     ```typescript
     const [scheduledFrequency, setScheduledFrequency] = useState<'daily'|'weekly'|'monthly'>('weekly')
     const [scheduledHour, setScheduledHour] = useState(6)
     const [scheduledDayOfMonth, setScheduledDayOfMonth] = useState(1)
     ```
   - Nahradit sekci "Scheduled Scans" novým UI:
     - Frequency selector: 3 karty (Daily / Weekly / Monthly) — stejný styl jako follow-up depth
     - Hour selector: Select s 24 hodinami, formátovat jako "6:00 AM", "2:00 PM" etc.
     - Pro Weekly: zobrazit day of week selector (již existuje)
     - Pro Monthly: zobrazit day of month selector (1-28)
   - Zobrazit user timezone a odkaz na Settings kde ji může změnit
   - Zobrazit "Next scan: Monday, Feb 10, 2026 at 6:00 AM CET"
2. Aktualizovat `saveSettings()` aby posílal nové parametry
3. Aktualizovat `loadProject()` aby načítal nové parametry

**Soubory:**
- `app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`

**Kontext:** Přečíst aktuální settings page, zejména sekci Scheduled Scans (řádky 793-871).

**Ověření:** Vizuální kontrola, formulář se správně zobrazuje a ukládá.

---

### Task 5.2 🟡 MEDIUM — Free user gate na scheduled scans
> 📋 **Tracker:** Před začátkem nastav `5.2` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Přidat gate pro free users — vidí scheduling UI ale je locked s CTA pro upgrade.

**Co udělat:**
1. Potřebujeme znát tier uživatele v project settings. Přidat fetch na `/api/credits` pro získání tier info.
2. Pokud `tier === 'free'`:
   - Scheduled scan toggle je disabled
   - Místo scheduling UI zobrazit card:
     ```
     🔒 Scheduled Scans — Pro Feature
     Automatically run scans on a schedule to track your brand visibility over time.
     [Upgrade to Pro →]
     ```
   - CTA tlačítko odkazuje na `/dashboard/costs` (nebo upgrade page)
3. Styling: Overlay s opacity, zámek ikona, konzistentní s existujícím designem
4. Pokud `tier !== 'free'`: normální UI

**Soubory:**
- `app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`

**Kontext:** Podívat se jak se tier zobrazuje v sidebar (`components/dashboard/sidebar.tsx`).

**Ověření:** Free user vidí locked UI. Paid user vidí normální UI.

---

### Task 5.3 🟢 EASY — Aktualizovat project info na project page
> 📋 **Tracker:** Před začátkem nastav `5.3` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat zobrazení schedule info na hlavní project page.

**Co udělat:**
1. V `app/(dashboard)/dashboard/projects/[id]/page.tsx` řádek ~330:
   - Aktuální text: `Scheduled: {DAYS[project.scheduled_scan_day || 0]}`
   - Nový text podle frekvence:
     - Daily: `"Scheduled: Daily at 6:00 AM"`
     - Weekly: `"Scheduled: Every Monday at 8:00 AM"`
     - Monthly: `"Scheduled: 15th of every month at 10:00 AM"`
   - Hodinu formátovat v 12h formátu (AM/PM) nebo 24h podle locale
   - Pokud disabled: `"No schedule"`

**Soubory:**
- `app/(dashboard)/dashboard/projects/[id]/page.tsx`

**Ověření:** Vizuální kontrola — správný text pro daily/weekly/monthly.

---

## FÁZE 6: Vercel konfigurace a finalizace

### Task 6.1 🟢 EASY — Aktualizovat vercel.json cron schedule
> 📋 **Tracker:** Před začátkem nastav `6.1` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat cron konfiguraci v `vercel.json`.

**Co udělat:**
1. Změnit `scheduled-scans` cron z `"0 6 * * *"` (jednou denně) na `"0 * * * *"` (každou hodinu)
2. Ponechat `process-scan` cron: `"*/5 * * * *"` (každých 5 minut, pro zpracování queue)
3. ODEBRAT `process-queue` cron (viz Task 3.1)

**Finální vercel.json crons:**
```json
{
  "crons": [
    {
      "path": "/api/cron/scheduled-scans",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/process-scan",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Soubory:**
- `vercel.json`

**Ověření:** JSON je validní, Vercel deployment projde.

---

### Task 6.2 🟡 MEDIUM — Testy pro scheduling logiku
> 📋 **Tracker:** Před začátkem nastav `6.2` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Napsat unit testy pro `calculateNextScheduledScan()` funkci.

**Co udělat:**
1. Vytvořit `tests/scheduling.test.ts`
2. Testovat:
   - Daily: Prague timezone, hodina 6 → správný UTC čas
   - Daily: New York timezone, hodina 14 → správný UTC čas
   - Weekly: Monday 8:00 Tokyo → správný UTC
   - Monthly: 15th 10:00 UTC → correct
   - Edge case: když vypočtený čas je v minulosti → posunout na další periodu
   - Edge case: monthly day 28 v únoru → funguje
   - DST přechod: léto/zima → správný UTC

**Soubory:**
- `tests/scheduling.test.ts` (nový)

**Ověření:** `npm run test:run` projde se všemi novými testy.

---

### Task 6.3 🟢 EASY — Aktualizovat SCALABILITY_ANALYSIS.md
> 📋 **Tracker:** Před začátkem nastav `6.3` na `🔄 IN PROGRESS`. Po dokončení na `✅ DONE`.

**Agent instrukce:**
Aktualizovat dokumentaci s novou architekturou.

**Co udělat:**
1. Přidat do `docs/SCALABILITY_ANALYSIS.md` sekci o nové architektuře
2. Popsat:
   - Browser-based chunked scans
   - Hourly cron pro scheduled scans
   - Timezone handling
   - Scaling to 1000 users

**Soubory:**
- `docs/SCALABILITY_ANALYSIS.md`

**Ověření:** Dokument je čitelný a odpovídá implementaci.

---

## 📊 Shrnutí tasků

| Task | Fáze | Obtížnost | Status | Doporučený model | Odhadovaný čas |
|------|------|-----------|--------|-------------------|----------------|
| 1.1 DB migrace | 1 | 🔴 HARD | ✅ DONE | Opus | 30 min |
| 1.2 TypeScript typy | 1 | 🟡 MEDIUM | ✅ DONE | Opus | 15 min |
| 2.1 Scan engine refaktor | 2 | 🔴 HARD | ✅ DONE | Opus | 90 min |
| 2.2 Chunk API update | 2 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 45 min |
| 2.3 Warning banner UI | 2 | 🟢 EASY | ✅ DONE | Sonnet 4.5 | 10 min |
| 2.4 Progress queries UI | 2 | 🟢 EASY | ✅ DONE | Sonnet 4.5 | 10 min |
| 2.5 beforeunload event | 2 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 20 min |
| 3.1 Cleanup queue system | 3 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 20 min |
| 4.1 Scheduling logika | 4 | 🔴 HARD | ✅ DONE | Opus | 60 min |
| 4.2 Scheduled-scans cron | 4 | 🔴 HARD | ✅ DONE | Opus | 60 min |
| 4.3 API schedule save | 4 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 30 min |
| 5.1 Scheduling UI | 5 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 60 min |
| 5.2 Free user gate | 5 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 30 min |
| 5.3 Project page info | 5 | 🟢 EASY | ✅ DONE | Sonnet 4.5 | 15 min |
| 6.1 Vercel.json update | 6 | 🟢 EASY | ✅ DONE | Sonnet 4.5 | 5 min |
| 6.2 Scheduling testy | 6 | 🟡 MEDIUM | ✅ DONE | Sonnet 4.5 | 30 min |
| 6.3 Dokumentace | 6 | 🟢 EASY | ✅ DONE | Sonnet 4.5 | 15 min |

**Celkem:** ~9 hodin práce  
**Náklady na modely (odhad):** 🔴 HARD tasks na Opus, zbytek na levnějších modelech
**Hotovo:** 16/16 tasků (100%) — VŠECHNY FÁZE DOKONČENY ✅✅✅

---

## 🔄 Závislosti mezi tasky

```
Fáze 1 (základ):
  1.1 DB migrace ─────────────┐
  1.2 TypeScript typy ────────┤
                              │
Fáze 2 (manuální scany):     │
  2.1 Scan engine refaktor ◄──┤ (závisí na 1.2)
  2.2 Chunk API update ◄──────┤ (závisí na 1.2)
  2.3 Warning banner ─────────┤ (nezávislý)
  2.4 Progress queries UI ◄───┤ (závisí na 2.1)
  2.5 beforeunload event ◄────┤ (závisí na 2.1)
                              │
Fáze 3 (cleanup):             │
  3.1 Cleanup queue ◄─────────┤ (závisí na 2.1, 2.2)
                              │
Fáze 4 (scheduled scany):    │
  4.1 Scheduling logika ◄─────┤ (závisí na 1.1, 1.2)
  4.2 Cron endpoint ◄─────────┤ (závisí na 4.1)
  4.3 API schedule save ◄─────┤ (závisí na 4.1)
                              │
Fáze 5 (UI):                 │
  5.1 Scheduling UI ◄─────────┤ (závisí na 1.2, 4.3)
  5.2 Free user gate ◄────────┤ (závisí na 5.1)
  5.3 Project page info ◄─────┤ (závisí na 1.2)
                              │
Fáze 6 (finalizace):         │
  6.1 Vercel.json ◄───────────┤ (závisí na 3.1, 4.2)
  6.2 Scheduling testy ◄──────┤ (závisí na 4.1)
  6.3 Dokumentace ─────────────┘ (poslední)
```

### Paralelizace:
- **Task 2.3** (warning banner) může běžet kdykoliv paralelně
- **Task 5.3** (project page info) může běžet paralelně s Fází 4
- **Fáze 2** (manuální) a **Fáze 4** (scheduled) mohou běžet paralelně po Fázi 1
- **Task 6.2** (testy) může běžet ihned po 4.1

---

## ⚠️ Důležitá pravidla pro agenty

### 🔴 Task Tracker — POVINNÉ
> **Toto je nejdůležitější pravidlo. MUSÍŠ ho dodržet při KAŽDÉM tasku.**

1. **PŘED začátkem práce na tasku:**
   - Otevři soubor `docs/IMPLEMENTATION_PLAN_SCAN_ARCHITECTURE.md`
   - Najdi svůj task v tabulce "📌 Stav tasků (Task Tracker)"
   - Změň status z `⬚ TODO` na `🔄 IN PROGRESS`
   - Zapiš datum do sloupce "Zahájeno" (formát: `YYYY-MM-DD`)
   - Zapiš model do sloupce "Agent/Model" (např. `Sonnet 4.5`)
   - Aktualizuj řádek **"Další task k řešení"** na následující task dle závislostí

2. **PO dokončení tasku:**
   - Změň status z `🔄 IN PROGRESS` na `✅ DONE`
   - Zapiš datum do sloupce "Dokončeno"
   - Přidej poznámku pokud je relevantní
   - Aktualizuj řádek **"Další task k řešení"** na další task, který nemá blokující závislosti

3. **Pokud task nemůžeš dokončit:**
   - Změň status na `❌ BLOCKED`
   - Do poznámky zapiš důvod blokace
   - Aktualizuj **"Další task k řešení"** na jiný task bez blokací

4. **Kontrola závislostí:**
   - Před začátkem ověř, že všechny závislosti tvého tasku mají status `✅ DONE`
   - Pokud ne, NEZAČÍNEJ task a vyber jiný, který je k dispozici

### Příklad aktualizace trackeru:

**Před:**
```
| 1.1 DB migrace | ⬚ TODO | — | — | — | |
```

**Při zahájení:**
```
| 1.1 DB migrace | 🔄 IN PROGRESS | Opus | 2026-02-08 | — | |
```

**Po dokončení:**
```
| 1.1 DB migrace | ✅ DONE | Opus | 2026-02-08 | 2026-02-08 | Migrace otestována |
```

---

### Obecná pravidla
1. **NIKDY neměnit** `lib/ai/providers.ts`, `lib/llm/types.ts` — modely a pricing
2. **NIKDY neměnit** `lib/credits/index.ts` — kreditní logika (pokud to není task)
3. **Jazyk UI:** Vše v angličtině
4. **Kód:** Vše v angličtině
5. **Po každém tasku:** `npm run build` musí projít
6. **Styl UI:** Zachovat konzistentní dark theme (zinc-800, zinc-900, etc.)
7. **Vercel Pro:** maxDuration = 300 pro serverové routes, maxDuration = 25 pro edge
8. **Supabase:** Vždy používat RLS, admin operace přes `createAdminClient()`

### 🏗️ OOP & Best Practices — POVINNÉ

Veškerý kód MUSÍ dodržovat best practices objektově orientovaného programování:

1. **Single Responsibility Principle (SRP)**
   - Každá funkce/třída/modul dělá JEDNU věc a dělá ji dobře
   - Netvořit "god functions" se stovkami řádků — rozdělit na menší, pojmenované helper funkce
   - API route handlery by měly být tenké — delegovat logiku do servisních vrstev (`lib/`)

2. **DRY (Don't Repeat Yourself)**
   - Sdílená logika patří do `lib/` — NIKDY nekopírovat stejný kód do více souborů
   - Pokud se kód opakuje 2×, extrahovat do helperu
   - Společné typy v `lib/db/schema.ts`, společné utility v příslušných `lib/` modulech

3. **Čisté rozhraní (Interface Segregation)**
   - Funkce přijímají jen parametry, které skutečně potřebují
   - TypeScript typy: preferovat specifické typy před `any` — NIKDY nepoužívat `any`
   - Exportovat jasné, dobře pojmenované funkce s JSDoc komentáři

4. **Error Handling**
   - Vždy ošetřit chybové stavy — žádný `catch() {}` bez logování
   - Používat typované errory kde to dává smysl
   - API endpointy vracejí konzistentní error response: `{ error: string, details?: string }`

5. **Separation of Concerns**
   - UI komponenty (`components/`, `app/`) — ŽÁDNÁ business logika
   - Business logika — v `lib/` (scan engine, scheduling, credits)
   - Data access — přes Supabase client, izolovaný v API routes nebo dedikovaných service funkcích
   - Konfigurace — v environment variables nebo konstantách

6. **Naming Conventions**
   - Funkce: `camelCase`, popisné názvy (`calculateNextScheduledScan`, ne `calcNext`)
   - Typy/Interfaces: `PascalCase` (`ScanChunkResult`, `ScheduleConfig`)
   - Konstanty: `UPPER_SNAKE_CASE` (`MAX_CHUNK_DURATION_MS`)
   - Soubory: `kebab-case` (`scan-context.tsx`, `scheduling.ts`)

7. **Immutability & Pure Functions**
   - Preferovat pure funkce bez side-effects kde to jde (zejména helper/utility funkce)
   - Nemutuovat vstupní parametry — vytvořit nový objekt
   - State management: používat React state/context správně, ne globální proměnné

8. **Code Documentation**
   - Každá exportovaná funkce: JSDoc s `@param` a `@returns`
   - Komplexní logika: inline komentáře vysvětlující PROČ (ne CO)
   - Žádné zakomentované bloky kódu — smazat nepoužívaný kód
