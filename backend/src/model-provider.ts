export type ModelProvider = {
  name: string;
  generate: (prompt: string) => Promise<string>;
};

export function createUnavailableProvider(): ModelProvider {
  return {
    name: 'unconfigured',
    async generate() {
      throw new Error('مزود نموذج الذكاء الاصطناعي غير مُعد بعد.');
    },
  };
}
