// qrcode and web-push ship no types; this is the part of each that main/ uses.

declare module 'qrcode' {
  const QRCode: {
    toString(text: string, options?: { type?: string; margin?: number; errorCorrectionLevel?: string }): Promise<string>;
  };
  export default QRCode;
}

declare module 'web-push' {
  const webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    sendNotification(subscription: object, payload: string, options?: object): Promise<unknown>;
  };
  export default webpush;
}
