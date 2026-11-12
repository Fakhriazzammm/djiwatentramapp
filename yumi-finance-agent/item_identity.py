"""Conservative identity checks for receipt names with pack sizes and counts."""
import re
import unicodedata

_UNIT_NAMES = {
    'gram': 'g', 'grams': 'g', 'gr': 'g', 'g': 'g',
    'kilogram': 'kg', 'kilo': 'kg', 'kg': 'kg',
    'liter': 'l', 'litre': 'l', 'ltr': 'l', 'lt': 'l', 'l': 'l', 'ml': 'ml',
    'piece': 'pcs', 'pieces': 'pcs', 'pc': 'pcs', 'pcs': 'pcs',
    'pack': 'pack', 'pak': 'pack', 'pkt': 'pack', 'sachet': 'sachet',
    'botol': 'botol', 'btl': 'botol', 'kotak': 'kotak', 'box': 'box',
    'butir': 'butir', 'lembar': 'lembar', 'karton': 'karton', 'ctn': 'karton',
}

def variant_signature(name: str) -> tuple[str, ...]:
    tokens = re.findall(r'\d+(?:[.,]\d+)?|[^\W\d_]+', unicodedata.normalize('NFKC', name or '').casefold())
    return tuple(token.replace(',', '.') if token[0].isdigit() else _UNIT_NAMES[token]
                 for token in tokens if token[0].isdigit() or token in _UNIT_NAMES)
