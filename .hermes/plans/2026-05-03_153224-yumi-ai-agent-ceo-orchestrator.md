# Plan: Transformasi yumi-ai-bot → yumi-ai-agent (CEO Orchestrator)

**Date**: 2026-05-03
**Author**: Yumi AI Agent Team
**Status**: Draft — menunggu persetujuan sebelum implementasi

---

## 1. Goal

Mengubah **yumi-ai-bot** (saat ini bot asisten general) menjadi **yumi-ai-agent** — CEO Digital / Orchestrator yang mengatur seluruh ekosistem AI agent bot di Djiwa Tentram Coffee.

### Visi Akhir

```
User ──> yumi-ai-agent (CEO / Orchestrator)
         @YummeAIbot
              │
              ├── handle sendiri: KPI, briefing, laporan, marketlist, chat umum
              │
              ├── delegate ──► yumi-finance-agent
              │                @YummeFinanceAIbot
              │                Finance + Inventory
              │
              ├── delegate ──► (future) yumi-operation-agent
              │                Shift, Staff, Schedule
              │
              └── delegate ──► (future) yumi-report-agent
                               Advanced analytics
```

---

## 2. Current Context

### Existing Bot

| Bot | Directory | Service | AI Backend | Grup |
|-----|-----------|---------|------------|------|
| **yumi-ai-bot** (@YummeAIbot) | `yumi-ai-bot/` | `yumi-ai-bot.service` | Supabase Edge Function `yumi-ai` | Marketlist, Bar, Transaksi, Report |
| **yumi-finance-agent** (@YummeFinanceAIbot) | `yumi-finance-agent/` | `yumi-finance-agent.service` | SumoPod langsung (kimi-k2.6 / gpt-4o-mini) | Finance |

### Problem Statement

1. **Duplikasi AI backend** — yumi-ai-bot pakai Edge Function, yumi-finance-agent pakai SumoPod langsung. Tidak konsisten.
2. **Tidak ada routing cerdas** — yumi-ai-bot tidak tahu keberadaan yumi-finance-agent. User finance harus langsung ke grup Finance.
3. **Context silo** — Masing-masing bot punya konteks sendiri. CEO tidak punya holistic view.
4. **Nama misleading** — `yumi-ai-bot` terdengar generic padahal bisa jadi lebih dari sekadar bot.

---

## 3. Proposed Architecture

### 3a. Naming & Identity

| Item | Lama | Baru | Alasan |
|------|------|------|--------|
| Directory | `yumi-ai-bot/` | `yumi-ai-agent/` | Role clarity |
| Systemd service | `yumi-ai-bot.service` | `yumi-ai-agent.service` | Ikut rename dir |
| Logger | `yumi-ai-bot` | `yumi-ai-agent` | Konsisten |
| Bot username | `@YummeAIbot` | **Tetap** | Breaking jika ganti |
| Bot display name | Yumi AI | Yumi AI Agent | Minor update di BotFather |

### 3b. Komponen Baru

**File baru di `yumi-ai-agent/`**:

| File | Fungsi |
|------|--------|
| `router.py` | Intent detection engine — klasifikasi input user |
| `delegator.py` | Kirim task ke specialist agents via HTTP internal |
| `ceo_prompt.py` | System prompt untuk persona CEO Digital |
| `agent_registry.py` | Registry semua agent yang dikenal + status |

**Tambahan di `app.py` existing**:

| Area | Enhancement |
|------|-------------|
| `on_text()` | Tambah routing layer sebelum fallback ke AI |
| `_ask_yumi_ai()` | Ganti backend dari Edge Function ke SumoPod |
| `_gather_context()` | Perluas dengan data finance + inventory |
| Commands | Tambah `/agent status`, `/agent restart <nama>` |

### 3c. Diagram Alur Routing

```
                    User Message
                         │
                         ▼
              ┌─────────────────────┐
              │    router.py        │
              │  Intent Detection   │
              └────────┬────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Finance  │ │ Internal │ │  AI      │
   │ Intent   │ │ Command  │ │  Chat    │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │
        ▼            ▼            ▼
   delegate via  handle via   _ask_yumi_ai()
   HTTP to       existing     SumoPod kimi-k2.6
   finance-agent handler      + CEO persona
```

---

## 4. Tahapan Implementasi

### Tahap 1: Rename (Estimasi: 15 menit)

**Langkah:**

1. Stop service:
   ```bash
   sudo systemctl stop yumi-ai-bot.service
   ```

2. Rename directory:
   ```bash
   mv /opt/djiwatentramapp/yumi-ai-bot /opt/djiwatentramapp/yumi-ai-agent
   ```

3. Update systemd service:
   - File: `/etc/systemd/system/yumi-ai-bot.service` → rename jadi `yumi-ai-agent.service`
   - Update `WorkingDirectory` → `/opt/djiwatentramapp/yumi-ai-agent`
   - Update `ExecStart` → path baru
   - Update `Description` → `"Yumi AI Agent — CEO Orchestrator"`
   - Update `StandardOutput` / `StandardError` path (jika ada)

4. Update logger name di `app.py`:
   - `logger = logging.getLogger("yumi-ai-agent")`
   - `logger.propagate = False` (jika ada, update label)

5. Enable & start service baru:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable yumi-ai-agent.service
   sudo systemctl start yumi-ai-agent.service
   sudo systemctl disable yumi-ai-bot.service   # (jika masih ada)
   sudo rm /etc/systemd/system/yumi-ai-bot.service  # cleanup
   ```

6. Update `.gitignore`:
   - Ganti `yumi-ai-bot/.venv/` → `yumi-ai-agent/.venv/`
   - Ganti `yumi-ai-bot/__pycache__/` → `yumi-ai-agent/__pycache__/`

**Files changed**: systemd service file, `app.py` (logger line), `.gitignore`

**Verifikasi**:
- `sudo systemctl status yumi-ai-agent.service` → active running
- `ps aux | grep yumi-ai-agent` → PID baru
- Log: `sudo journalctl -u yumi-ai-agent.service -n 10` → no errors
- Bot reply di grup: `/start` → response OK

---

### Tahap 2: Router Layer (Estimasi: 2 jam)

**File baru**: `yumi-ai-agent/router.py`

```python
"""
router.py — Intent Detection Engine untuk Yumi AI Agent.

Mengklasifikasikan input user ke dalam intent domain,
sehingga CEO Agent bisa routing ke specialist agent yang tepat.
"""

import re
import logging

logger = logging.getLogger("yumi-ai-agent.router")

INTENT_PATTERNS = {
    "finance": {
        "keywords": [
            "pemasukan", "pendapatan", "income",
            "pengeluaran", "biaya", "expense",
            "saldo", "keuangan", "laba", "rugi",
            "modal", "cashflow", "arus kas",
        ],
        "regex": re.compile(
            r"^(pemasukan|pendapatan|income|pengeluaran|biaya|expense|"
            r"saldo|cek saldo|keuangan|laba|rugi)\b",
            re.IGNORECASE,
        ),
    },
    "inventory": {
        "keywords": [
            "stok", "inventory", "inventori", "barang",
            "bahan baku", "restok", "restock", "restok",
            "barang habis", "barang masuk",
        ],
        "regex": re.compile(
            r"^(cek stok|stok|restok|restock|barang|inventory|inventori)\b",
            re.IGNORECASE,
        ),
    },
    "operations": {
        "keywords": [
            "shift", "absensi", "attendance", "clock",
            "jadwal", "karyawan", "staff", "pegawai",
        ],
        "regex": re.compile(
            r"^(shift|absensi|attendance|clock|jadwal)\b",
            re.IGNORECASE,
        ),
    },
    "report": {
        "keywords": [
            "kpi", "omzet", "top produk", "best seller",
            "terlaris", "briefing", "laporan", "ringkasan",
            "insight",
        ],
        "regex": None,  # handled by AI
    },
    "marketlist": {
        "keywords": [
            "belanja", "marketlist", "shopping",
            "daftar belanja", "belanja harian",
        ],
        "regex": None,  # handled by command
    },
    "help": {
        "keywords": ["help", "bantuan", "tolong", "menu", "fitur"],
        "regex": re.compile(r"^/(help|start|bantuan)\b", re.IGNORECASE),
    },
}


def detect_intent(text: str) -> tuple[str, float]:
    """
    Detect intent dari input user.
    Returns (intent_name, confidence_score 0.0-1.0).
    """
    text_lower = text.strip().lower()

    for intent, config in INTENT_PATTERNS.items():
        # Regex match (higher confidence)
        if config["regex"] and config["regex"].search(text_lower):
            return intent, 0.95

        # Keyword match
        if any(kw in text_lower for kw in config["keywords"]):
            return intent, 0.80

    return "general", 0.0
```

**Modifikasi di `app.py` — `on_text()`**:

```python
async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # ... existing auth check ...

    text = (update.message.text or "").strip()

    # Step 1: Intent detection
    intent, confidence = detect_intent(text)

    # Step 2: Route based on intent
    if intent == "finance" and confidence >= 0.8:
        await delegate_to_finance_agent(update, context, text)
        return
    elif intent == "inventory" and confidence >= 0.8:
        await delegate_to_finance_agent(update, context, text)
        return

    # Step 3: Fallback ke keyword routing (existing)
    # ... existing keyword_map logic ...

    # Step 4: Free-text AI (existing but with CEO persona)
    # ... _ask_yumi_ai with CEO persona ...
```

**Files changed**: `yumi-ai-agent/router.py` (new), `yumi-ai-agent/app.py` (modify `on_text()`)

**Verifikasi**:
- Input `"cek saldo"` → detect intent finance (0.95)
- Input `"restok gula 2kg"` → detect intent inventory (0.95)
- Input `"omzet hari ini"` → detect intent report (0.80)
- Input `"kopi enak"` → general chat (fallback ke AI)
- Integration: bot reply sesuai intent

---

### Tahap 3: Delegasi ke Finance Agent via HTTP Internal (Estimasi: 2 jam)

**File baru**: `yumi-ai-agent/delegator.py`

**Architecture**: yumi-finance-agent expose HTTP endpoint di localhost (port 8082). yumi-ai-agent call endpoint ini.

**Modifikasi di yumi-finance-agent**: Tambah HTTP API endpoint di `app.py`:

```python
# Di ujung app.py, setelah Application.run_polling()
async def _start_http_api(bot_app, port=8082):
    """HTTP API for inter-agent communication."""
    from aiohttp import web

    async def handle_query(request):
        data = await request.json()
        action = data.get("action", "")
        params = data.get("params", {})

        if action == "cek_saldo":
            result = await get_saldo_summary()
            return web.json_response({"ok": True, "result": result})
        elif action == "cek_stok":
            result = await get_inventory_summary()
            return web.json_response({"ok": True, "result": result})
        # ... more actions ...

    app = web.Application()
    app.router.add_post("/api/query", handle_query)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", port)
    await site.start()
    logger.info(f"Agent HTTP API running on 127.0.0.1:{port}")
```

**Delegator di yumi-ai-agent**:

```python
"""
delegator.py — Kirim task ke specialist agents via HTTP internal.
"""

import httpx
import logging

logger = logging.getLogger("yumi-ai-agent.delegator")

AGENTS = {
    "yumi-finance-agent": {
        "host": "127.0.0.1",
        "port": 8082,
        "timeout": 30,
    },
}


async def delegate(
    agent_name: str,
    action: str,
    params: dict = None,
) -> dict:
    """Delegate task ke specialist agent. Return result dict."""
    agent = AGENTS.get(agent_name)
    if not agent:
        return {"ok": False, "error": f"Unknown agent: {agent_name}"}

    url = f"http://{agent['host']}:{agent['port']}/api/query"
    payload = {"action": action, "params": params or {}}

    try:
        async with httpx.AsyncClient(timeout=agent["timeout"]) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.RequestError as e:
        logger.error(f"Delegation to {agent_name} failed: {e}")
        return {"ok": False, "error": str(e)}


# ── High-level wrappers ──

async def cek_saldo() -> dict:
    return await delegate("yumi-finance-agent", "cek_saldo")

async def cek_stok() -> dict:
    return await delegate("yumi-finance-agent", "cek_stok")

async def catat_pemasukan(amount: float, description: str = "") -> dict:
    return await delegate(
        "yumi-finance-agent",
        "catat_pemasukan",
        {"amount": amount, "description": description},
    )

async def catat_pengeluaran(amount: float, description: str = "") -> dict:
    return await delegate(
        "yumi-finance-agent",
        "catat_pengeluaran",
        {"amount": amount, "description": description},
    )
```

**Modifikasi di `app.py` `on_text()`**:

```python
async def on_text(update, context):
    text = (update.message.text or "").strip()
    intent, confidence = detect_intent(text)

    if intent == "finance" and confidence >= 0.8:
        # Kirim typing indicator
        await context.bot.send_chat_action(
            chat_id=update.effective_chat.id, action="typing"
        )
        result = await delegate_with_ai(text)
        await _reply_msg(update, context, result)
        return
    # ... rest of handler
```

**Files changed**:
- `yumi-ai-agent/delegator.py` (new)
- `yumi-ai-agent/app.py` (on_text, imports)
- `yumi-finance-agent/app.py` (HTTP API + import aiohttp)

**Verifikasi**:
- Start yumi-finance-agent dulu, pastikan HTTP API listen di :8082
- `curl http://127.0.0.1:8082/api/query -d '{"action":"cek_saldo"}'` → response JSON
- Kirim `"cek saldo"` ke yumi-ai-agent → reply dengan saldo dari finance agent
- Kirim `"cek stok"` → reply dengan stok dari finance agent
- Error case: matikan finance agent → yumi-ai-agent harus kasih fallback message

---

### Tahap 4: Switch AI Backend ke SumoPod + CEO Persona (Estimasi: 1 jam)

**File baru**: `yumi-ai-agent/ceo_prompt.py`

```python
"""
ceo_prompt.py — System prompt untuk persona CEO Digital Yumi AI Agent.
"""

CEO_SYSTEM_PROMPT = """Kamu adalah Yumi AI Agent — CEO Digital dari Djiwa Tentram Coffee, 
sebuah coffee shop di Indonesia yang menggunakan sistem YumiPOS.

IDENTITAS:
- Nama: Yumi
- Role: CEO Digital / Asisten Manajer
- Bisnis: Djiwa Tentram Coffee
- Platform: YumiPOS (pos.djiwatentram.web.id)
- Bahasa: Indonesia (wajib)

KEPRIBADIAN:
- Profesional, ringkas, dan actionable
- Ramah tapi tegas — seperti CEO yang baik
- Paham detail operasional bisnis (keuangan, stok, shift, karyawan)
- Empati saat ada kompelan/curhatan

TUGAS:
1. Pahami konteks bisnis secara menyeluruh (keuangan, stok, operasional, karyawan)
2. Jika user minta data keuangan atau stok — delegasikan ke finance agent
3. Jika user minta laporan KPI/omzet — buat sendiri dari data yang kamu punya
4. Jika user curhat/komplain — handle dengan empati, catat ke database jika perlu
5. Jika user minta eksekusi (restok, catat transaksi) — delegasikan ke agent terkait
6. Jawab dalam Bahasa Indonesia, ringkas, dan langsung actionable

DATA BISNIS TERKINI:
{context_data}
"""

def build_ceo_prompt(context_data: str) -> str:
    return CEO_SYSTEM_PROMPT.format(context_data=context_data)
```

**Modifikasi `_ask_yumi_ai()` di `app.py`**:

Ganti dari Edge Function ke SumoPod (sama seperti yumi-finance-agent):

```python
async def _ask_yumi_ai(
    user_id: int,
    message: str,
    context_hint: str = "",
    images: list[str] | None = None,
) -> str:
    """Forward chat ke SumoPod AI dengan persona CEO."""

    system_prompt = build_ceo_prompt(context_hint)

    payload = {
        "model": "kimi-k2.6",
        "messages": [
            {"role": "system", "content": system_prompt},
            *_get_session(user_id),  # conversation history
            {"role": "user", "content": message},
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
    }

    # Save to session + supabase
    _add_to_session(user_id, "user", message)
    await _save_to_supabase(user_id, "user", message)

    # SumoPod API call (sama seperti di sumopod_client.py)
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.sumopod.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        reply = data["choices"][0]["message"]["content"]

    _add_to_session(user_id, "assistant", reply)
    await _save_to_supabase(user_id, "assistant", reply)

    return reply
```

**Files changed**:
- `yumi-ai-agent/ceo_prompt.py` (new)
- `yumi-ai-agent/app.py` (modify `_ask_yumi_ai`, add SUMOPOD_API_KEY import)

**Verifikasi**:
- Kirim `"halo"` → reply dengan persona CEO
- Kirim `"omzet hari ini"` → data lengkap dengan insight
- Kirim `"kok sepi hari ini?"` → response empatik + analisis
- Kirim `"gaji kapan naik"` → response diplomatis + informatif

---

### Tahap 5: Agent Registry & Monitoring (Estimasi: 1 jam)

**File baru**: `yumi-ai-agent/agent_registry.py`

```python
"""
agent_registry.py — Registry semua AI agent + health check.
"""

import httpx
import logging

logger = logging.getLogger("yumi-ai-agent.registry")

REGISTERED_AGENTS = {
    "yumi-ai-agent": {
        "name": "Yumi AI Agent (CEO)",
        "bot": "@YummeAIbot",
        "service": "yumi-ai-agent.service",
        "port": None,
        "description": "Orchestrator & CEO — mengatur semua agent",
    },
    "yumi-finance-agent": {
        "name": "Yumi Finance Agent",
        "bot": "@YummeFinanceAIbot",
        "service": "yumi-finance-agent.service",
        "port": 8082,
        "description": "Finance & Inventory specialist",
    },
    # (future agents akan ditambahkan di sini)
}


async def check_agent_health(agent_name: str) -> dict:
    """Check apakah agent hidup via HTTP health check."""
    agent = REGISTERED_AGENTS.get(agent_name)
    if not agent:
        return {"name": agent_name, "status": "unknown", "error": "Not registered"}

    if agent.get("port"):
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"http://127.0.0.1:{agent['port']}/health"
                )
                if resp.status_code == 200:
                    return {"name": agent_name, "status": "healthy"}
                return {"name": agent_name, "status": "unhealthy", "http": resp.status_code}
        except Exception as e:
            return {"name": agent_name, "status": "down", "error": str(e)}

    # CEO agent (self) — selalu healthy
    return {"name": agent_name, "status": "healthy"}


async def get_all_agents_status() -> list[dict]:
    """Get status of all registered agents."""
    results = []
    for name in REGISTERED_AGENTS:
        status = await check_agent_health(name)
        results.append({**REGISTERED_AGENTS[name], **status})
    return results
```

**Command baru di `app.py`**:

```python
async def cmd_agent_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Tampilkan status semua AI agent."""
    statuses = await get_all_agents_status()
    lines = ["🤖 **Status AI Agent**\n"]
    for s in statuses:
        icon = "✅" if s["status"] == "healthy" else "❌" if s["status"] == "down" else "⚠️"
        lines.append(f"{icon} **{s['name']}**")
        lines.append(f"   Bot: {s['bot']}")
        lines.append(f"   Status: {s['status']}")
        if s.get("error"):
            lines.append(f"   Error: {s['error']}")
        lines.append("")
    await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown")
```

**Files changed**: `yumi-ai-agent/agent_registry.py` (new), `yumi-ai-agent/app.py` (add command handler)

**Verifikasi**:
- `/agent status` → tampilkan daftar agent dengan status ✅/❌
- Matikan finance agent sementara → `/agent status` → finance agent ❌

---

### Tahap 6: Perluas Context Gathering (Estimasi: 30 menit)

**Modifikasi `_gather_context()` di `app.py`**:

Tambahkan data tambahan ke context:

```python
async def _gather_context() -> str:
    parts = []

    # Existing: order stats
    orders_today = await _fetch("pos_order_summary", "...")
    # ... existing code ...

    # NEW: Finance summary
    try:
        finance_data = await cek_saldo()
        if finance_data.get("ok"):
            fd = finance_data["result"]
            parts.append(
                f"--- Ringkasan Keuangan ---\n"
                f"Saldo: Rp{fd.get('saldo', 0):,}\n"
                f"Pemasukan hari ini: Rp{fd.get('income_today', 0):,}\n"
                f"Pengeluaran hari ini: Rp{fd.get('expense_today', 0):,}\n"
            )
    except Exception:
        pass

    # NEW: Low stock alerts
    try:
        stok_data = await cek_stok()
        if stok_data.get("ok"):
            low_stock = stok_data["result"].get("low_stock", [])
            if low_stock:
                parts.append("--- Stok Menipis ---\n" +
                    "\n".join(f"- {s['name']}: sisa {s['stock']}" for s in low_stock[:5]))
    except Exception:
        pass

    return "\n\n".join(parts)
```

**Files changed**: `yumi-ai-agent/app.py` (modify `_gather_context`)

---

## 5. Files Changed Summary

### New Files
| Path | Size (est) | Purpose |
|------|-----------|---------|
| `yumi-ai-agent/router.py` | ~2 KB | Intent detection engine |
| `yumi-ai-agent/delegator.py` | ~3 KB | HTTP delegation to specialist agents |
| `yumi-ai-agent/ceo_prompt.py` | ~1 KB | System prompt CEO persona |
| `yumi-ai-agent/agent_registry.py` | ~2 KB | Agent registration + health check |

### Modified Files
| Path | Changes |
|------|---------|
| `yumi-ai-agent/app.py` | Rename logger, modify `_ask_yumi_ai()` (SumoPod), modify `on_text()` (router), modify `_gather_context()` (finance data), add `/agent status` handler |
| `.gitignore` | Update path `yumi-ai-bot/` → `yumi-ai-agent/` |

### Modified Files (yumi-finance-agent)
| Path | Changes |
|------|---------|
| `yumi-finance-agent/app.py` | Add HTTP API endpoint (aiohttp) for inter-agent delegation |

### System Files
| Path | Changes |
|------|---------|
| `/etc/systemd/system/yumi-ai-bot.service` | Rename to `yumi-ai-agent.service`, update paths |
| `/etc/systemd/system/yumi-ai-agent.service` | New file (from rename) |

---

## 6. Dependencies

**Baru untuk yumi-ai-agent**:
- `aiohttp` — untuk HTTP server (di finance-agent) dan client (di delegator yumi-ai-agent)
- Atau pakai `httpx` yang sudah ada + `uvicorn` standalone

**Existing yang sudah ada**:
- `python-telegram-bot` — kedua bot
- `httpx` — kedua bot
- `Pillow` — yumi-ai-agent (OCR)
- `python-dotenv` — kedua bot

---

## 7. Testing & Validation

### Per Test Case
| Test | Input | Expected Output | Caranya |
|------|-------|-----------------|---------|
| Finance routing | `"cek saldo"` ke yumi-ai-agent | Saldo dari finance agent | Manual di grup |
| Inventory routing | `"cek stok"` ke yumi-ai-agent | Stok dari finance agent | Manual di grup |
| Intent accuracy | 10 sample input | Correct classification | Unit test router |
| Fallback AI | `"kopi enak hari ini"` | Response CEO | Manual |
| Delegate error | Finance agent mati | Error message graceful | Matikan service test |
| Health check | `/agent status` | ✅✅ (2 agent) | Manual |
| Rename validation | Service restart | No errors in journal | `journalctl` |

### Rollback Plan
Jika ada masalah setelah rename:
```bash
sudo systemctl stop yumi-ai-agent.service
sudo systemctl disable yumi-ai-agent.service
# Rename balik directory
mv /opt/djiwatentramapp/yumi-ai-agent /opt/djiwatentramapp/yumi-ai-bot
# Aktifkan service lama
sudo systemctl enable yumi-ai-bot.service
sudo systemctl start yumi-ai-bot.service
```

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Service rename gagal** | Bot mati tanpa pengganti | Rollback plan siap |
| **AI response berubah** | User bingung dengan persona baru | Test di grup test dulu |
| **HTTP delegation timeout** | Reply lama ke user | Timeout 30s + fallback message |
| **Finance agent crash saat tambah HTTP API** | Finance bot mati | Test HTTP API terpisah dulu |
| **Latensi meningkat** | User complain | Optimasi dengan caching |
| **SumoPod API key belum di yumi-ai-agent** | AI gagal | Tambah SUMOPOD_API_KEY ke .env |

### Open Questions untuk User

1. **Metode delegasi**: HTTP internal (langsung, sync) vs Supabase task queue (async, decoupled) — preferensi?
2. **Batasan kecepatan**: Apakah OK jika delegasi ke finance agent memakan 3-5 detik tambahan?
3. **Bot rename di BotFather**: @YummeAIbot → @YumiAIAgentBot? (akan break link existing)
4. **Display name**: Yumi AI → Yumi AI Agent? (non-breaking, hanya update via BotFather)
5. **Prioritas**: Tahap mana yang mau didahulukan? (Rename dulu? Atau langsung dengan routing?)
6. **Self-hosted aiohttp/uvicorn** untuk HTTP API atau pakai port yang sudah ada?

---

## 9. Kesimpulan

Transformasi ini akan mengubah yumi-ai-bot dari bot asisten biasa menjadi **CEO Digital** yang:
- ✅ Punya holistic view bisnis
- ✅ Bisa routing ke specialist agent
- ✅ Punya persona CEO yang profesional
- ✅ AI backend konsisten (SumoPod)
- ✅ Extensible untuk agent baru

Timeline: **~7-8 jam** total implementasi, atau bisa dicicil per tahap.

---

*Plan ini masih draft dan menunggu feedback & persetujuan sebelum implementasi.*
