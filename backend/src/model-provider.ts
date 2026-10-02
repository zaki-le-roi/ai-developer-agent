import OpenAI from 'openai';

export type ModelProvider = {
  name: string;
  generate: (prompt: string) => Promise<string>;
};

export function createOpenAIProvider(): ModelProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY غير مُعد في بيئة التشغيل.');
  }

  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) {
    throw new Error('OPENAI_MODEL غير مُعد في بيئة التشغيل.');
  }

  const client = new OpenAI({ apiKey });

  return {
    name: `openai:${model}`,
    async generate(prompt: string) {
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content: prompt }],
      });
      return response.output_text;
    },
  };
}

export function createUnavailableProvider(): ModelProvider {
  return {
    name: 'unconfigured',
    async generate() {
      throw new Error('مزود نموذج الذكاء الاصطناعي غير مُعد بعد.');
    },
  };
}

export function createModelProvider(): ModelProvider {
  return process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL?.trim()
    ? createOpenAIProvider()
    : createUnavailableProvider();
}
