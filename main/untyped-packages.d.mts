// Packages that ship no types and have no @types package installed. Only the
// calls the back end makes are declared. Nothing imports this file.

declare module 'qrcode' {
  const QRCode: {
    toString(text: string, options?: { type?: string; margin?: number; errorCorrectionLevel?: string }): Promise<string>;
  };
  export default QRCode;
}

declare module 'web-push' {
  const webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    sendNotification(subscription: unknown, body?: string, options?: Record<string, unknown>): Promise<unknown>;
  };
  export default webpush;
}
