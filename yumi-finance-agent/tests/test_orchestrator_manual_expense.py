import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from orchestrator import FinanceOrchestrator


def test_two_line_expense_with_rupiah_separator():
    result = FinanceOrchestrator._parse_multiline_expense(
        "pengeluaran\nrokok mang andri : Rp 20.000"
    )

    assert result is not None
    assert result.action == "record_expense"
    assert result.amount == 20000
    assert result.description == "Pembelian bahan: rokok mang andri"
    assert result.items == [
        {"name": "rokok mang andri", "qty": 1, "unit": "", "price": 20000.0}
    ]


def test_two_line_expense_accepts_bot_mention():
    result = FinanceOrchestrator._parse_multiline_expense(
        "@YummeFinanceAIbot pengeluaran\nrokok mang andri : Rp 20.000"
    )

    assert result is not None
    assert result.action == "record_expense"
    assert result.amount == 20000


def test_natural_language_expense_is_deterministic():
    import asyncio

    async def run():
        orchestrator = FinanceOrchestrator("", "", "")
        result = await orchestrator.orchestrate("tadi beli rokok mang andri 20 ribu")
        assert result.action == "record_expense"
        assert result.amount == 20000
        assert result.description == "rokok mang andri"

    asyncio.run(run())


def test_comparison_intent_is_database_backed_action():
    import asyncio

    async def run():
        orchestrator = FinanceOrchestrator("", "", "")
        result = await orchestrator.orchestrate("bandingkan pengeluaran bulan ini dengan bulan lalu")
        assert result.action == "comparison"
        assert result.text == "bulan_ini"
        assert result.description == "expense"

    asyncio.run(run())
