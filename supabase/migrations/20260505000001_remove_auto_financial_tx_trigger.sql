-- Migration: Hapus trigger auto_create_financial_tx — logic dipindah ke app layer
-- Alasan: Trigger menyebabkan duplikasi karena app code (useHybridUpdateOrder,
--   useHybridUpdateOrderStatus, useHybridUpdateOrderPaymentGateway, useHybridCreateOrder)
--   sudah handle pembuatan financial transaction.
-- Setelah trigger dihapus, useHybridUpdateOrder dimodifikasi agar juga membuat
--   financial transaction saat status berubah ke paid/completed.

-- Hapus trigger INSERT
drop trigger if exists trg_auto_create_financial_tx_insert on pos.orders;

-- Hapus trigger UPDATE
drop trigger if exists trg_auto_create_financial_tx_update on pos.orders;

-- Hapus function trigger
drop function if exists pos.auto_create_financial_tx();
