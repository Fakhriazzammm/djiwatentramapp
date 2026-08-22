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
