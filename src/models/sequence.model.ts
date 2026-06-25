import { Schema, model, Document } from "mongoose";

/**
 * Sequence Model for generating unique order numbers
 * Ensures no race conditions when creating multiple orders simultaneously
 */

export interface ISequence extends Document {
  _id: string; // e.g., "order_20260125"
  value: number;
}

const SequenceSchema = new Schema<ISequence>(
  {
    _id: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
      default: 0,
      required: true,
    },
  },
  { _id: false },
);

export const SequenceModel = model<ISequence>("Sequence", SequenceSchema);

/**
 * Get next sequence number for a given key
 * Uses MongoDB atomic operation to prevent race conditions
 */
export async function getNextSequence(key: string): Promise<number> {
  const result = await SequenceModel.findByIdAndUpdate(
    key,
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );

  return result!.value;
}
