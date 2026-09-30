declare module 'heic-convert' {
  export default function convert(opts: { buffer: Buffer | ArrayBuffer | Uint8Array; format: 'JPEG' | 'PNG'; quality?: number }): Promise<ArrayBuffer>;
}
