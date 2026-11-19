import { z } from 'zod';

/**
 * The Midtrans notification contract.
 *
 * This is provider input, not user input, so the schema is deliberately not
 * strict: Midtrans adds fields over time, and a new optional field must not turn
 * every notification into a `422`. Unknown keys are stripped rather than kept,
 * so nothing from the provider lands in the database unless a column names it.
 *
 * `gross_amount` stays a string on purpose. The signature is computed over the
 * exact bytes Midtrans sent, so coerced or normalised values would verify
 * against the wrong text.
 */
export const notificationSchema = z.object({
  order_id: z.string().min(1, { message: 'order_id wajib diisi.' }).max(80),
  status_code: z.string().min(1, { message: 'status_code wajib diisi.' }).max(10),
  gross_amount: z
    .string({ message: 'gross_amount wajib berupa teks.' })
    .min(1, { message: 'gross_amount wajib diisi.' })
    .max(32),
  signature_key: z
    .string({ message: 'signature_key wajib diisi.' })
    .regex(/^[0-9a-fA-F]{128}$/, { message: 'signature_key tidak valid.' }),
  transaction_status: z
    .string({ message: 'transaction_status wajib diisi.' })
    .min(1)
    .max(40),
  transaction_id: z.string().max(80).optional(),
  payment_type: z.string().max(40).optional(),
  fraud_status: z.string().max(40).optional(),
  currency: z.string().max(8).optional(),
  transaction_time: z.string().max(40).optional(),
  expiry_time: z.string().max(40).optional(),
});
