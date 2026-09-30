/** Typings for the Node training/inference core (not used by React). */
export class NeuralNetwork {
  predict(features: number[]): number[];
  static fromJSON(weights: unknown): NeuralNetwork;
}

export function extractFeatures(input: Record<string, unknown>): number[];
