declare module "mammoth/mammoth.browser" {
  interface ConvertOptions {
    arrayBuffer: ArrayBuffer;
  }

  interface ConvertResult {
    value: string;
    messages: unknown[];
  }

  export function convertToHtml(options: ConvertOptions): Promise<ConvertResult>;

  const mammoth: {
    convertToHtml: (options: ConvertOptions) => Promise<ConvertResult>;
  };

  export default mammoth;
}
