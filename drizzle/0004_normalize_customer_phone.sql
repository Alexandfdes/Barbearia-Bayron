-- Normaliza telefones já gravados: remove máscara comum (espaço, parênteses,
-- hífen, + e ponto) e, se sobrar mais de 11 dígitos (DDI 55), mantém os últimos 11.
-- A partir desta migration a coluna armazena SEMPRE só dígitos (10-11) —
-- escrita normalizada em lib/phone.ts e comparações diretas com índice.
UPDATE appointments SET customer_phone =
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '(', ''), ')', ''), '-', ''), '+', ''), '.', '');
--> statement-breakpoint
UPDATE appointments SET customer_phone = substr(customer_phone, 3)
WHERE length(customer_phone) IN (12, 13) AND substr(customer_phone, 1, 2) = '55';
--> statement-breakpoint
UPDATE appointments SET customer_phone = substr(customer_phone, -11)
WHERE length(customer_phone) > 11;
