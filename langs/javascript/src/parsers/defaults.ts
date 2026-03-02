/**
 * Defaults parser for DOTLYTE.
 */

export class DefaultsParser {
  constructor(private readonly defaults: Record<string, unknown>) {}

  parse(): Record<string, unknown> {
    return { ...this.defaults };
  }
}
