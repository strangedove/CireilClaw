/** Thrown when generation succeeds but produces no tool calls. Carries any plain text the model produced. */
export class GenerationNoToolCallsError extends Error {
  readonly text: string | undefined;

  constructor(text: string | undefined, reason: string) {
    super(`Expected tool calls but got '${reason}' stop reason`);
    this.name = "GenerationNoToolCallsError";
    this.text = text;
  }
}
