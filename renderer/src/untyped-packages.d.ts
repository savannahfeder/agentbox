// qrcode ships no types. Only the call the renderer makes is declared.
declare module 'qrcode' {
  const QRCode: {
    toString(text: string, options?: { type?: string; margin?: number; errorCorrectionLevel?: string }): Promise<string>;
  };
  export default QRCode;
}
