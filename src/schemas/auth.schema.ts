import { z } from 'zod';
import { createStellarAddressSchema } from '../utils/stellar-address.util';

const walletAddressSchema = createStellarAddressSchema('walletAddress');

export const challengeSchema = z.object({
  walletAddress: walletAddressSchema,
});

export const connectSchema = z.object({
  walletAddress: walletAddressSchema,
  challenge: z
    .string()
    .min(1, 'walletAddress, challenge, and signature are required'),
  signature: z
    .string()
    .min(1, 'walletAddress, challenge, and signature are required'),
});
