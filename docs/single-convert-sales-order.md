# Single Convert Sales Order approval

The quotation action and final PO form submit use `Convert Sales Order`. Draft, approved, sent and accepted quotations can enter this flow without a separate quotation approval. Rejected, expired and in-flight quotation approval states remain blocked.

Conversion creates the SO and requests SO approval in one database transaction. Failure rolls back creation, sales facts, stock effects and notification rows. The existing quotation lock and unique quotation reference make retries return the original SO without another approval event. The browser no longer sends a second approval RPC. Existing SO approval, notification recipients, cost snapshots, permissions and approval-before-delivery guard remain in place. No existing quotation or SO is rewritten or automatically approved.

Validation: 372 unit tests; integration contract; repository native SO browser smoke at 1440px and 390px (TH/EN), including draft conversion, single pending approval, retry, approval-before-delivery, completion and cancellation. Authenticated database tests passed inside a rollback-only transaction: conversion, attachment validation, idempotency, financial snapshots, direct-write denial, delivery approval, stale update guard, cancellation and anonymous/unregistered access denial.

Production migration: `20261026100820_single_convert_sales_order_approval`.
