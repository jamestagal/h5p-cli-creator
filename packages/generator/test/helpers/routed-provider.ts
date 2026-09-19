import type { ModelProvider } from "../../src/llm/provider.js";
import type { ModelRequest, ModelResponse } from "../../src/llm/types.js";

export interface Route { match: (request: ModelRequest) => boolean; script: Array<ModelResponse | Error>; }

/** A fake provider whose responses are chosen by request content, so concurrent lanes cannot swap each other's responses. */
export class RoutedProvider implements ModelProvider {
  readonly name = "fake" as const;
  readonly requests: ModelRequest[] = [];
  constructor(private readonly routes: Route[]) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const route = this.routes.find((r) => r.match(request));
    const next = route?.script.shift();
    if (next === undefined) throw new Error(`RoutedProvider has no response for purpose ${request.purpose} (user starts "${request.user.slice(0, 60)}")`);
    if (next instanceof Error) throw next;
    return { ...next, model: request.model };
  }
}
